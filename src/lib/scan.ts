/**
 * The scan: list who an account follows, add profile counts, then read each
 * followed account's feed. Accounts are reported as soon as their feed is
 * read so the list fills in while the scan runs. Nothing is stored.
 *
 * Without a session the scan only uses public AppView data for the handle
 * that was typed. With a session for that same account, its own follow
 * records are also listed from its PDS: they include follows the AppView
 * no longer shows (deactivated or deleted accounts).
 */
import { readFeed } from './activity';
import { isAbortError } from './backoff';
import type { BskyReader, RepoClient } from './bsky';
import { chunk, paginate } from './paginate';
import { runPool } from './pool';
import type { Account, AccountStatus, ProfileView, ProfileViewDetailed } from './types';
import { XrpcError } from './xrpc';

/** Requests in flight at once. Fixed: this is a public API. */
export const SCAN_CONCURRENCY = 4;

/** From this many follows the page warns that the scan takes a while. */
export const LARGE_LIST = 500;

export type ScanPhase = 'resolve' | 'follows' | 'records' | 'profiles' | 'feeds';

export interface ScanProgress {
  phase: ScanPhase;
  done: number;
  /** 0 when unknown. */
  total: number;
}

export interface ScanSubject {
  did: string;
  handle: string;
  followsCount?: number;
}

export interface ScanDeps {
  reader: BskyReader;
  /**
   * The scanned account's own repo, only when it is the logged-in account.
   * Called once the handle is resolved to a DID.
   */
  ownRepoFor?: (did: string) => RepoClient | undefined;
}

export interface ScanOptions {
  actor: string;
  signal?: AbortSignal;
  concurrency?: number;
  onSubject?: (subject: ScanSubject) => void;
  onProgress?: (p: ScanProgress) => void;
  /** Called whenever an account's data changes (profile or feed read). */
  onAccount?: (a: Account) => void;
}

export interface ScanResult {
  subject: ScanSubject;
  accounts: Account[];
  cancelled: boolean;
}

export class ActorError extends Error {
  constructor(
    readonly code: 'notfound' | 'deactivated' | 'takendown',
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
    if (err.error === 'NotFound' || err.error === 'ProfileNotFound') return 'notfound';
    if (err.status === 400 && /not found/i.test(err.message)) return 'notfound';
  }
  return 'error';
}

function fromProfileView(p: ProfileView): Account {
  const a: Account = { did: p.did, handle: p.handle, status: 'active' };
  if (p.displayName) a.displayName = p.displayName;
  if (p.avatar) a.avatar = p.avatar;
  return a;
}

function applyDetailed(a: Account, p: ProfileViewDetailed): void {
  a.handle = p.handle;
  a.status = 'active';
  if (p.displayName) a.displayName = p.displayName;
  if (p.avatar) a.avatar = p.avatar;
  if (p.postsCount !== undefined) a.postsCount = p.postsCount;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Reads one account's feed into it; failures become its status. */
async function readAccountFeed(reader: BskyReader, a: Account, signal?: AbortSignal): Promise<void> {
  try {
    a.feed = await readFeed(({ signal: s, ...p }) => reader.getAuthorFeed(p, { signal: s }), a.did, { signal });
    a.status = 'active';
    delete a.errorMessage;
  } catch (err) {
    if (isAbortError(err)) throw err;
    a.status = statusFromError(err);
    if (a.status === 'error') a.errorMessage = errorText(err);
  }
}

/** Resolves a handle or DID to the account whose follows will be listed. */
export async function resolveSubject(reader: BskyReader, actor: string, signal?: AbortSignal): Promise<ScanSubject> {
  try {
    const p = await reader.getProfile(actor, { signal });
    const subject: ScanSubject = { did: p.did, handle: p.handle };
    if (p.followsCount !== undefined) subject.followsCount = p.followsCount;
    return subject;
  } catch (err) {
    if (isAbortError(err)) throw err;
    const status = statusFromError(err);
    if (status === 'deactivated' || status === 'takendown' || status === 'notfound') throw new ActorError(status, actor);
    if (err instanceof XrpcError && err.status === 400) throw new ActorError('notfound', actor);
    throw err;
  }
}

export async function scan(deps: ScanDeps, opts: ScanOptions): Promise<ScanResult> {
  const { signal, onProgress, onAccount } = opts;
  const concurrency = opts.concurrency ?? SCAN_CONCURRENCY;
  const call = { signal };

  onProgress?.({ phase: 'resolve', done: 0, total: 1 });
  const subject = await resolveSubject(deps.reader, opts.actor, signal);
  opts.onSubject?.(subject);
  const did = subject.did;

  const accounts = new Map<string, Account>();
  const all = () => [...accounts.values()];
  let cancelled = false;

  try {
    // 1. Everyone they follow, per the AppView.
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

    // 2. Own list only: follow records the AppView no longer lists.
    const ownRepo = deps.ownRepoFor?.(did);
    if (ownRepo) {
      let seen = 0;
      for await (const page of paginate(
        async (cursor) => {
          const res = await ownRepo.listFollows(did, cursor, call);
          return { items: res.records, cursor: res.cursor };
        },
        { signal },
      )) {
        for (const rec of page) {
          const followed = rec.value?.subject;
          if (typeof followed !== 'string' || accounts.has(followed)) continue;
          accounts.set(followed, { did: followed, handle: followed, status: 'notfound' });
        }
        seen += page.length;
        onProgress?.({ phase: 'records', done: seen, total: subject.followsCount ?? 0 });
      }
    }

    // 3. Post counts in batches of 25; accounts left out are asked one by
    // one so their status (deactivated, suspended, gone) is known.
    const batches = chunk(all().map((a) => a.did), 25);
    const missing: string[] = [];
    await runPool(
      batches,
      async (dids) => {
        const res = await deps.reader.getProfiles(dids, call);
        const found = new Set<string>();
        for (const p of res.profiles) {
          const a = accounts.get(p.did);
          if (!a) continue;
          applyDetailed(a, p);
          found.add(p.did);
        }
        for (const d of dids) if (!found.has(d)) missing.push(d);
      },
      {
        concurrency,
        signal,
        onSettled: ({ done, total }) => onProgress?.({ phase: 'profiles', done, total }),
      },
    );
    await runPool(
      missing,
      async (d) => {
        const a = accounts.get(d)!;
        try {
          applyDetailed(a, await deps.reader.getProfile(d, call));
        } catch (err) {
          if (isAbortError(err)) throw err;
          a.status = statusFromError(err);
          if (a.status === 'error') a.errorMessage = errorText(err);
          else onAccount?.(a);
        }
      },
      { concurrency, signal },
    );

    // 4. Feeds.
    const toRead = all().filter((a) => a.status === 'active');
    await runPool(
      toRead,
      async (a, _i, sig) => {
        await readAccountFeed(deps.reader, a, sig);
        onAccount?.(a);
      },
      {
        concurrency,
        signal,
        onSettled: ({ done, total }) => onProgress?.({ phase: 'feeds', done, total }),
      },
    );
  } catch (err) {
    if (!isAbortError(err)) throw err;
    cancelled = true;
  }

  return { subject, accounts: all(), cancelled };
}

/**
 * Picks up a stopped scan: reads the feeds that are still missing (or
 * failed) and leaves everything else as it was.
 */
export async function resumeFeeds(
  deps: Pick<ScanDeps, 'reader'>,
  accounts: readonly Account[],
  opts: Pick<ScanOptions, 'signal' | 'concurrency' | 'onProgress' | 'onAccount'>,
): Promise<{ cancelled: boolean }> {
  const pending = accounts.filter((a) => (a.status === 'active' && !a.feed) || a.status === 'error');
  try {
    await runPool(
      pending,
      async (a, _i, sig) => {
        await readAccountFeed(deps.reader, a, sig);
        opts.onAccount?.(a);
      },
      {
        concurrency: opts.concurrency ?? SCAN_CONCURRENCY,
        signal: opts.signal,
        onSettled: ({ done, total }) => opts.onProgress?.({ phase: 'feeds', done, total }),
      },
    );
    return { cancelled: false };
  } catch (err) {
    if (!isAbortError(err)) throw err;
    return { cancelled: true };
  }
}
