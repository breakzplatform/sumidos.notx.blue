/**
 * The scan: list who an account follows, enrich each followed account with
 * profile counts and follow-back state, then find its last activity. Fresh
 * cached activity is reused so rescans only fetch what went stale.
 */
import { findLastActivity } from './activity';
import { isAbortError } from './backoff';
import type { BskyReader, RepoClient } from './bsky';
import { isStale, type ScanStore } from './cache';
import { chunk, paginate } from './paginate';
import { runPool } from './pool';
import type { Account, AccountStatus, ActivityMode, ProfileView, ProfileViewDetailed } from './types';
import { XrpcError } from './xrpc';

export type ScanType = 'full' | 'quick';

export type ScanPhase = 'resolve' | 'follows' | 'records' | 'profiles' | 'relationships' | 'activity' | 'saving';

export interface ScanProgress {
  phase: ScanPhase;
  done: number;
  /** 0 when unknown (e.g. while paging through follows). */
  total: number;
}

export interface ScanDeps {
  reader: BskyReader;
  store: ScanStore;
  now?: () => number;
  random?: () => number;
  /** Repo client for the scanned account's PDS (full scans only). */
  repoFor?: (did: string, signal?: AbortSignal) => Promise<RepoClient>;
}

export interface ScanOptions {
  actor: string;
  mode: ActivityMode;
  scanType: ScanType;
  concurrency: number;
  maxAgeMs: number;
  /** Quick scan: only check activity for this many random accounts. */
  sampleSize?: number;
  /** Ignore cached activity. */
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: ScanProgress) => void;
}

export interface ScanStats {
  follows: number;
  fetched: number;
  fromCache: number;
  skipped: number;
  failed: number;
}

export interface ScanResult {
  did: string;
  handle: string;
  accounts: Account[];
  stats: ScanStats;
  cancelled: boolean;
  scannedAt: number;
}

export class ActorError extends Error {
  constructor(
    readonly code: 'notfound' | 'deactivated' | 'takendown' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'ActorError';
  }
}

/** Maps an AppView error for a single actor to an account status. */
export function statusFromError(err: unknown): AccountStatus {
  if (err instanceof XrpcError) {
    if (err.error === 'AccountDeactivated') return 'deactivated';
    if (err.error === 'AccountTakedown') return 'takendown';
    if (err.error === 'BlockedActor' || err.error === 'BlockedByActor') return 'blocked';
    if (err.status === 400 && /not found/i.test(err.message)) return 'notfound';
    if (err.error === 'NotFound' || err.error === 'ProfileNotFound') return 'notfound';
  }
  return 'error';
}

function fromProfileView(p: ProfileView): Account {
  const a: Account = { did: p.did, handle: p.handle, status: 'active' };
  if (p.displayName) a.displayName = p.displayName;
  if (p.avatar) a.avatar = p.avatar;
  if (p.createdAt) a.createdAt = p.createdAt;
  return a;
}

function applyDetailed(a: Account, p: ProfileViewDetailed): void {
  a.handle = p.handle;
  a.status = 'active';
  if (p.displayName) a.displayName = p.displayName;
  else delete a.displayName;
  if (p.avatar) a.avatar = p.avatar;
  else delete a.avatar;
  if (p.createdAt) a.createdAt = p.createdAt;
  if (p.followersCount !== undefined) a.followersCount = p.followersCount;
  if (p.followsCount !== undefined) a.followsCount = p.followsCount;
  if (p.postsCount !== undefined) a.postsCount = p.postsCount;
}

const ACTIVITY_FIELDS = ['lastActivity', 'quietSince', 'approximate', 'activityMode', 'checkedAt'] as const;

function copyActivity(from: Account, to: Account): void {
  for (const key of ACTIVITY_FIELDS) {
    if (from[key] !== undefined) (to as unknown as Record<string, unknown>)[key] = from[key];
  }
}

function clearActivity(a: Account): void {
  for (const key of ACTIVITY_FIELDS) delete a[key];
  delete a.errorMessage;
}

function sample<T>(items: T[], n: number, random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

export async function scan(deps: ScanDeps, opts: ScanOptions): Promise<ScanResult> {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const { signal, onProgress } = opts;
  const deep = opts.scanType === 'full';
  const call = { signal };
  const stats: ScanStats = { follows: 0, fetched: 0, fromCache: 0, skipped: 0, failed: 0 };

  // 1. Resolve the actor (getProfile accepts both handles and DIDs).
  onProgress?.({ phase: 'resolve', done: 0, total: 1 });
  let subject: ProfileViewDetailed;
  try {
    subject = await deps.reader.getProfile(opts.actor, call);
  } catch (err) {
    if (isAbortError(err)) throw err;
    const status = statusFromError(err);
    if (status === 'deactivated' || status === 'takendown' || status === 'notfound') {
      throw new ActorError(status, opts.actor);
    }
    if (err instanceof XrpcError && err.status === 400) throw new ActorError('notfound', opts.actor);
    throw err;
  }
  const did = subject.did;
  const cached = opts.force ? undefined : await deps.store.get(did);
  const cachedByDid = new Map((cached?.accounts ?? []).map((a) => [a.did, a]));

  // 2. Everyone they follow, per the AppView.
  const accounts = new Map<string, Account>();
  for await (const page of paginate(
    async (cursor) => {
      const res = await deps.reader.getFollows(did, cursor, call);
      return { items: res.follows, cursor: res.cursor };
    },
    { signal },
  )) {
    for (const p of page) if (!accounts.has(p.did)) accounts.set(p.did, fromProfileView(p));
    onProgress?.({ phase: 'follows', done: accounts.size, total: subject.followsCount ?? 0 });
  }

  // 3. Full scan: the follow records in their repo. These also include
  // follows of accounts the AppView no longer lists (deleted, suspended).
  if (deep && deps.repoFor) {
    try {
      const repo = await deps.repoFor(did, signal);
      let seen = 0;
      for await (const page of paginate(
        async (cursor) => {
          const res = await repo.listFollows(did, cursor, call);
          return { items: res.records, cursor: res.cursor };
        },
        { signal },
      )) {
        for (const rec of page) {
          const subjectDid = rec.value?.subject;
          if (typeof subjectDid !== 'string') continue;
          let a = accounts.get(subjectDid);
          if (!a) {
            a = { did: subjectDid, handle: subjectDid, status: 'notfound' };
            accounts.set(subjectDid, a);
          }
          a.followUri ??= rec.uri;
        }
        seen += page.length;
        onProgress?.({ phase: 'records', done: seen, total: 0 });
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      // Optional step: the AppView list is still usable without it.
    }
  }

  const all = [...accounts.values()];
  stats.follows = all.length;

  // 4. Profile details (counts) in batches of 25.
  const batches = chunk(all.map((a) => a.did), 25);
  const missing: string[] = [];
  let profilesDone = 0;
  await runPool(
    batches,
    async (dids) => {
      const res = await deps.reader.getProfiles(dids, call);
      const found = new Set<string>();
      for (const p of res.profiles) {
        const a = accounts.get(p.did);
        if (a) {
          applyDetailed(a, p);
          found.add(p.did);
        }
      }
      for (const d of dids) if (!found.has(d)) missing.push(d);
    },
    {
      concurrency: opts.concurrency,
      signal,
      onSettled: ({ result }) => {
        profilesDone++;
        if (!result.ok && !isAbortError(result.error)) stats.failed++;
        onProgress?.({ phase: 'profiles', done: profilesDone, total: batches.length });
      },
    },
  );

  // Accounts getProfiles left out: ask one by one to learn why.
  await runPool(
    missing,
    async (d) => {
      const a = accounts.get(d)!;
      try {
        applyDetailed(a, await deps.reader.getProfile(d, call));
      } catch (err) {
        if (isAbortError(err)) throw err;
        a.status = statusFromError(err);
        if (a.status === 'error') a.errorMessage = err instanceof Error ? err.message : String(err);
        clearActivity(a);
      }
    },
    { concurrency: opts.concurrency, signal },
  );

  // 5. Follow-back state and follow record URIs, in batches of 30.
  const relBatches = chunk(all.filter((a) => a.status === 'active').map((a) => a.did), 30);
  let relDone = 0;
  await runPool(
    relBatches,
    async (dids) => {
      const res = await deps.reader.getRelationships(did, dids, call);
      for (const rel of res.relationships) {
        if (rel.notFound || !rel.did) continue;
        const a = accounts.get(rel.did);
        if (!a) continue;
        a.mutual = Boolean(rel.followedBy);
        if (rel.following) a.followUri = rel.following;
      }
    },
    {
      concurrency: opts.concurrency,
      signal,
      onSettled: () => {
        relDone++;
        onProgress?.({ phase: 'relationships', done: relDone, total: relBatches.length });
      },
    },
  );

  // 6. Last activity, reusing fresh cache entries.
  const checkTime = now();
  const staleOpts = { now: checkTime, maxAgeMs: opts.maxAgeMs, mode: opts.mode, deep };
  let toFetch: Account[] = [];
  for (const a of all) {
    if (a.status !== 'active') continue;
    const prev = cachedByDid.get(a.did);
    if (prev && prev.status === 'active' && !isStale(prev, staleOpts)) {
      copyActivity(prev, a);
      stats.fromCache++;
      continue;
    }
    if (a.postsCount === 0 && opts.mode !== 'all') {
      // Nothing to look for; no request needed.
      a.lastActivity = null;
      a.activityMode = opts.mode;
      a.checkedAt = checkTime;
      stats.skipped++;
      continue;
    }
    toFetch.push(a);
  }

  if (!deep && opts.sampleSize && opts.sampleSize > 0 && toFetch.length > opts.sampleSize) {
    const chosen = new Set(sample(toFetch, opts.sampleSize, random));
    for (const a of toFetch) {
      if (chosen.has(a)) continue;
      // Not sampled this time: keep whatever older result we had.
      const prev = cachedByDid.get(a.did);
      if (prev && prev.activityMode === opts.mode) copyActivity(prev, a);
    }
    toFetch = toFetch.filter((a) => chosen.has(a));
  }

  let cancelled = false;
  try {
    await runPool(
      toFetch,
      async (a, _i, sig) => {
        try {
          const res = await findLastActivity(
            ({ signal: s, ...p }) => deps.reader.getAuthorFeed(p, { signal: s }),
            a.did,
            opts.mode,
            { deep, signal: sig },
          );
          clearActivity(a);
          a.lastActivity = res.lastActivity;
          if (res.quietSince) a.quietSince = res.quietSince;
          if (res.approximate) a.approximate = true;
          a.activityMode = opts.mode;
          a.checkedAt = now();
          stats.fetched++;
        } catch (err) {
          if (isAbortError(err)) throw err;
          const status = statusFromError(err);
          if (status !== 'error') {
            a.status = status;
            clearActivity(a);
          } else {
            a.errorMessage = err instanceof Error ? err.message : String(err);
          }
          stats.failed++;
        }
      },
      {
        concurrency: opts.concurrency,
        signal,
        onSettled: ({ done, total }) => onProgress?.({ phase: 'activity', done, total }),
      },
    );
  } catch (err) {
    if (!isAbortError(err)) throw err;
    cancelled = true;
  }

  // 7. Save, including partial progress after a cancel.
  onProgress?.({ phase: 'saving', done: 0, total: 1 });
  const scannedAt = now();
  const result: ScanResult = {
    did,
    handle: subject.handle,
    accounts: all,
    stats,
    cancelled,
    scannedAt,
  };
  await deps.store.put({ did, handle: subject.handle, mode: opts.mode, scannedAt, accounts: all });
  return result;
}
