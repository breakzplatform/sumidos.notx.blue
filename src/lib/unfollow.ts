/**
 * Bulk unfollow: deletes app.bsky.graph.follow records from the owner's
 * repo, one at a time and paced, with a dry-run mode that only reports.
 */
import { isAbortError, sleep as defaultSleep } from './backoff';
import { FOLLOW_COLLECTION, parseAtUri, type RepoClient } from './bsky';
import { paginate } from './paginate';

export type UnfollowEvent =
  | { type: 'indexing'; records: number }
  | { type: 'deleted'; subject: string; uri: string }
  | { type: 'would-delete'; subject: string; uri: string }
  | { type: 'skipped'; subject: string; reason: 'allowlisted' | 'not-following' }
  | { type: 'failed'; subject: string; error: string }
  | { type: 'stopped' };

export interface UnfollowSummary {
  requested: number;
  deleted: number;
  wouldDelete: number;
  allowlisted: number;
  notFollowing: number;
  failed: number;
  stopped: boolean;
  dryRun: boolean;
  /** Subjects that are no longer followed (or would not be, in a dry run). */
  done: string[];
}

export interface UnfollowOptions {
  /** DID of the logged-in account; records are only deleted from its repo. */
  owner: string;
  subjects: readonly string[];
  repo: RepoClient;
  allowlist?: ReadonlySet<string>;
  dryRun: boolean;
  /** Minimum time between two deletes. */
  minIntervalMs: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  onEvent?: (e: UnfollowEvent) => void;
}

/** Map of followed DID -> follow record URIs (duplicates happen). */
export async function indexFollowRecords(
  repo: RepoClient,
  owner: string,
  signal?: AbortSignal,
  onPage?: (count: number) => void,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  let count = 0;
  for await (const page of paginate(
    async (cursor) => {
      const res = await repo.listFollows(owner, cursor, { signal });
      return { items: res.records, cursor: res.cursor };
    },
    { signal },
  )) {
    for (const rec of page) {
      const subject = rec.value?.subject;
      if (typeof subject !== 'string') continue;
      const list = map.get(subject);
      if (list) list.push(rec.uri);
      else map.set(subject, [rec.uri]);
    }
    count += page.length;
    onPage?.(count);
  }
  return map;
}

export async function runUnfollow(opts: UnfollowOptions): Promise<UnfollowSummary> {
  const { owner, repo, dryRun, signal, onEvent } = opts;
  const wait = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const allowlist = opts.allowlist ?? new Set<string>();
  const subjects = [...new Set(opts.subjects)];
  const summary: UnfollowSummary = {
    requested: subjects.length,
    deleted: 0,
    wouldDelete: 0,
    allowlisted: 0,
    notFollowing: 0,
    failed: 0,
    stopped: false,
    dryRun,
    done: [],
  };

  let index: Map<string, string[]>;
  try {
    index = await indexFollowRecords(repo, owner, signal, (records) => onEvent?.({ type: 'indexing', records }));
  } catch (err) {
    if (!isAbortError(err)) throw err;
    summary.stopped = true;
    onEvent?.({ type: 'stopped' });
    return summary;
  }

  let lastDelete = -Infinity;
  for (const subject of subjects) {
    if (signal?.aborted) {
      summary.stopped = true;
      onEvent?.({ type: 'stopped' });
      break;
    }
    if (allowlist.has(subject)) {
      summary.allowlisted++;
      onEvent?.({ type: 'skipped', subject, reason: 'allowlisted' });
      continue;
    }
    const uris = (index.get(subject) ?? []).filter((uri) => {
      const parts = parseAtUri(uri);
      return parts !== null && parts.repo === owner && parts.collection === FOLLOW_COLLECTION;
    });
    if (uris.length === 0) {
      summary.notFollowing++;
      onEvent?.({ type: 'skipped', subject, reason: 'not-following' });
      continue;
    }
    if (dryRun) {
      summary.wouldDelete++;
      summary.done.push(subject);
      onEvent?.({ type: 'would-delete', subject, uri: uris[0]! });
      continue;
    }

    try {
      for (const uri of uris) {
        const gap = lastDelete + opts.minIntervalMs - now();
        if (gap > 0) await wait(gap, signal);
        const { rkey } = parseAtUri(uri)!;
        lastDelete = now();
        await repo.deleteRecord(owner, FOLLOW_COLLECTION, rkey, { signal });
      }
      summary.deleted++;
      summary.done.push(subject);
      onEvent?.({ type: 'deleted', subject, uri: uris[0]! });
    } catch (err) {
      if (isAbortError(err)) {
        summary.stopped = true;
        onEvent?.({ type: 'stopped' });
        break;
      }
      summary.failed++;
      onEvent?.({ type: 'failed', subject, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return summary;
}
