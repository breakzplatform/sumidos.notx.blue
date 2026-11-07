/**
 * Mass unfollow on the logged-in account's own repo, and its undo.
 *
 * Follow records are listed from the owner's repo (getFollows doesn't give
 * record keys), then deleted with com.atproto.repo.applyWrites in batches.
 * Each deleted record is kept in memory so "undo" can write it back with the
 * same key and value: the follow returns with its original date.
 */
import { isAbortError, sleep as defaultSleep } from './backoff';
import { FOLLOW_COLLECTION, MAX_WRITES_PER_CALL, parseAtUri, type RepoClient, type RepoWrite } from './bsky';
import { paginate } from './paginate';
import type { FollowRecord } from './types';

export interface StoredFollow {
  rkey: string;
  value: FollowRecord;
}

/** Followed DID -> its follow records in the owner's repo (duplicates happen). */
export type FollowIndex = Map<string, StoredFollow[]>;

export async function indexFollowRecords(
  repo: RepoClient,
  owner: string,
  signal?: AbortSignal,
  onPage?: (records: number) => void,
): Promise<FollowIndex> {
  const index: FollowIndex = new Map();
  let count = 0;
  for await (const page of paginate(
    async (cursor) => {
      const res = await repo.listFollows(owner, cursor, { signal });
      return { items: res.records, cursor: res.cursor };
    },
    { signal },
  )) {
    for (const rec of page) {
      const parts = parseAtUri(rec.uri);
      const subject = rec.value?.subject;
      if (!parts || parts.repo !== owner || parts.collection !== FOLLOW_COLLECTION) continue;
      if (typeof subject !== 'string') continue;
      const list = index.get(subject) ?? [];
      list.push({ rkey: parts.rkey, value: rec.value });
      index.set(subject, list);
    }
    count += page.length;
    onPage?.(count);
  }
  return index;
}

/** One applyWrites call and the accounts it settles. */
export interface Batch {
  subjects: string[];
  writes: RepoWrite[];
}

/**
 * Packs per-account writes into calls of at most `max` writes. An account's
 * writes stay in one call when they fit, so a failed call never leaves an
 * account half done.
 */
export function packBatches(groups: ReadonlyArray<{ subject: string; writes: RepoWrite[] }>, max = MAX_WRITES_PER_CALL): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { subjects: [], writes: [] };
  const flush = () => {
    if (current.writes.length > 0) batches.push(current);
    current = { subjects: [], writes: [] };
  };
  for (const { subject, writes } of groups) {
    if (writes.length === 0) continue;
    if (current.writes.length + writes.length > max) flush();
    for (let i = 0; i < writes.length; i += max) {
      const slice = writes.slice(i, i + max);
      if (current.writes.length + slice.length > max) flush();
      current.writes.push(...slice);
    }
    current.subjects.push(subject);
  }
  flush();
  return batches;
}

export interface UnfollowPlan {
  batches: Batch[];
  /** Records that will be deleted, by account, for undo. */
  removed: Map<string, StoredFollow[]>;
  /** Selected accounts with no follow record in the repo. */
  notFollowing: string[];
}

export function planUnfollow(subjects: readonly string[], index: FollowIndex): UnfollowPlan {
  const removed = new Map<string, StoredFollow[]>();
  const notFollowing: string[] = [];
  const groups: { subject: string; writes: RepoWrite[] }[] = [];
  for (const subject of new Set(subjects)) {
    const records = index.get(subject) ?? [];
    if (records.length === 0) {
      notFollowing.push(subject);
      continue;
    }
    removed.set(subject, records);
    groups.push({
      subject,
      writes: records.map(({ rkey }) => ({ $type: 'com.atproto.repo.applyWrites#delete', collection: FOLLOW_COLLECTION, rkey })),
    });
  }
  return { batches: packBatches(groups), removed, notFollowing };
}

/** Writes the deleted records back, with the same keys and values. */
export function planRefollow(removed: ReadonlyMap<string, readonly StoredFollow[]>): Batch[] {
  const groups = [...removed].map(([subject, records]) => ({
    subject,
    writes: records.map(
      ({ rkey, value }): RepoWrite => ({
        $type: 'com.atproto.repo.applyWrites#create',
        collection: FOLLOW_COLLECTION,
        rkey,
        value: { ...value, $type: FOLLOW_COLLECTION },
      }),
    ),
  }));
  return packBatches(groups);
}

export interface BatchProgress {
  done: number;
  failed: number;
  total: number;
}

export interface RunOptions {
  owner: string;
  repo: RepoClient;
  batches: readonly Batch[];
  /** Minimum time between two calls. */
  minIntervalMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  onProgress?: (p: BatchProgress) => void;
}

export interface RunResult {
  done: string[];
  failed: string[];
  stopped: boolean;
}

export async function runBatches(opts: RunOptions): Promise<RunResult> {
  const wait = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const minInterval = opts.minIntervalMs ?? 1000;
  const total = opts.batches.reduce((n, b) => n + b.subjects.length, 0);
  const result: RunResult = { done: [], failed: [], stopped: false };
  let last = -Infinity;
  for (const batch of opts.batches) {
    try {
      opts.signal?.throwIfAborted();
      const gap = last + minInterval - now();
      if (gap > 0) await wait(gap, opts.signal);
      last = now();
      await opts.repo.applyWrites(opts.owner, batch.writes, { signal: opts.signal });
      result.done.push(...batch.subjects);
    } catch (err) {
      if (isAbortError(err)) {
        result.stopped = true;
        break;
      }
      result.failed.push(...batch.subjects);
    }
    opts.onProgress?.({ done: result.done.length, failed: result.failed.length, total });
  }
  return result;
}

/** What an undo needs: the records removed by the last successful run. */
export function keepForUndo(plan: UnfollowPlan, done: readonly string[]): Map<string, StoredFollow[]> {
  const kept = new Map<string, StoredFollow[]>();
  for (const subject of done) {
    const records = plan.removed.get(subject);
    if (records) kept.set(subject, records);
  }
  return kept;
}
