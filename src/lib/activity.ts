/**
 * Working out when an account was last active, from its author feed.
 */
import type { ActivityMode, FeedViewPost, GetAuthorFeedResponse, LastActivity } from './types';

export const ACTIVITY_MODES: readonly ActivityMode[] = ['posts', 'posts_replies', 'all'];

/** getAuthorFeed `filter` value used for each mode. */
export function feedFilterFor(mode: ActivityMode): 'posts_no_replies' | 'posts_with_replies' {
  return mode === 'posts' ? 'posts_no_replies' : 'posts_with_replies';
}

export function classifyItem(item: FeedViewPost): LastActivity['kind'] | 'pin' {
  const reasonType = item.reason?.$type ?? '';
  if (reasonType.endsWith('#reasonRepost')) return 'repost';
  if (reasonType.endsWith('#reasonPin')) return 'pin';
  if (item.post.record?.reply) return 'reply';
  return 'post';
}

export function kindMatches(kind: LastActivity['kind'] | 'pin', mode: ActivityMode): boolean {
  switch (kind) {
    case 'post':
      return true;
    case 'reply':
      return mode !== 'posts';
    case 'repost':
      return mode === 'all';
    default:
      return false;
  }
}

function validTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : t;
}

/**
 * Timestamp of a feed item. For posts we use the record's createdAt, but
 * never later than when the AppView first saw it, so a post dated in the
 * future can't make an account look active. Reposts use the repost time.
 */
export function itemTime(item: FeedViewPost): number | undefined {
  if (classifyItem(item) === 'repost') {
    return validTime(item.reason?.indexedAt) ?? validTime(item.post.indexedAt);
  }
  const created = validTime(item.post.record?.createdAt);
  const indexed = validTime(item.post.indexedAt);
  if (created === undefined) return indexed;
  if (indexed === undefined) return created;
  return Math.min(created, indexed);
}

/** Most recent item that counts for `mode`, or null if none does. */
export function pickLastActivity(items: readonly FeedViewPost[], mode: ActivityMode): LastActivity | null {
  let best: { t: number; item: FeedViewPost; kind: LastActivity['kind'] } | null = null;
  for (const item of items) {
    const kind = classifyItem(item);
    if (kind === 'pin' || !kindMatches(kind, mode)) continue;
    const t = itemTime(item);
    if (t === undefined) continue;
    if (!best || t > best.t) best = { t, item, kind };
  }
  if (!best) return null;
  return { at: new Date(best.t).toISOString(), kind: best.kind, uri: best.item.post.uri };
}

/** Oldest timestamp among the items, any kind. */
export function oldestTime(items: readonly FeedViewPost[]): number | undefined {
  let oldest: number | undefined;
  for (const item of items) {
    if (classifyItem(item) === 'pin') continue;
    const t = itemTime(item);
    if (t !== undefined && (oldest === undefined || t < oldest)) oldest = t;
  }
  return oldest;
}

export interface ActivityResult {
  lastActivity: LastActivity | null;
  quietSince?: string;
  approximate?: boolean;
}

export type AuthorFeedFetcher = (params: {
  actor: string;
  limit: number;
  filter: string;
  cursor?: string;
  signal?: AbortSignal;
}) => Promise<GetAuthorFeedResponse>;

export interface FindActivityOptions {
  /** Keep paging when the first item doesn't count for the mode. */
  deep: boolean;
  /** Extra pages to read in deep mode. */
  maxExtraPages?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/**
 * Asks for a single feed item first, which answers the question for most
 * accounts. Only when that item doesn't count (say, a repost in "posts
 * only" mode) and `deep` is on, a few more pages are read.
 */
export async function findLastActivity(
  fetchFeed: AuthorFeedFetcher,
  actor: string,
  mode: ActivityMode,
  { deep, maxExtraPages = 3, pageSize = 30, signal }: FindActivityOptions,
): Promise<ActivityResult> {
  const filter = feedFilterFor(mode);
  const seen: FeedViewPost[] = [];
  let res = await fetchFeed({ actor, limit: 1, filter, signal });
  seen.push(...res.feed);
  let found = pickLastActivity(seen, mode);
  if (found) return { lastActivity: found };
  if (!res.cursor || res.feed.length === 0) return { lastActivity: null };

  if (deep) {
    for (let page = 0; page < maxExtraPages && res.cursor; page++) {
      res = await fetchFeed({ actor, limit: pageSize, filter, cursor: res.cursor, signal });
      seen.push(...res.feed);
      found = pickLastActivity(seen, mode);
      if (found) return { lastActivity: found };
      if (res.feed.length === 0) break;
    }
    if (!res.cursor) return { lastActivity: null };
  }

  const oldest = oldestTime(seen);
  return {
    lastActivity: null,
    approximate: true,
    ...(oldest !== undefined ? { quietSince: new Date(oldest).toISOString() } : {}),
  };
}
