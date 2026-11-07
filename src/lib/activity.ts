/**
 * Working out when an account was last active, from its author feed.
 *
 * The feed is read once with every kind of item (posts, replies, reposts)
 * until the first plain post shows up. Everything newer than that post is a
 * reply or a repost, so the newest item of each kind is known exactly and
 * the "count replies" and "count reposts" toggles only re-filter: no new
 * request is needed when they change.
 */
import type { FeedSummary, FeedViewPost, GetAuthorFeedResponse } from './types';

export type ItemKind = 'post' | 'reply' | 'repost' | 'pin';

export function classifyItem(item: FeedViewPost): ItemKind {
  const reasonType = item.reason?.$type ?? '';
  if (reasonType.endsWith('#reasonRepost')) return 'repost';
  if (reasonType.endsWith('#reasonPin')) return 'pin';
  if (item.post.record?.reply) return 'reply';
  return 'post';
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

const KIND_FIELD = { post: 'lastPost', reply: 'lastReply', repost: 'lastRepost' } as const;

/** Folds feed items into the newest time per kind and the oldest time seen. */
export function summarize(items: readonly FeedViewPost[], complete: boolean): FeedSummary {
  const newest: Partial<Record<keyof typeof KIND_FIELD, number>> = {};
  let oldest: number | undefined;
  for (const item of items) {
    const kind = classifyItem(item);
    if (kind === 'pin') continue;
    const t = itemTime(item);
    if (t === undefined) continue;
    if ((newest[kind] ?? -Infinity) < t) newest[kind] = t;
    if (oldest === undefined || t < oldest) oldest = t;
  }
  const summary: FeedSummary = { complete };
  for (const kind of ['post', 'reply', 'repost'] as const) {
    const t = newest[kind];
    if (t !== undefined) summary[KIND_FIELD[kind]] = new Date(t).toISOString();
  }
  if (oldest !== undefined) summary.oldestSeen = new Date(oldest).toISOString();
  return summary;
}

export interface CountRules {
  replies: boolean;
  reposts: boolean;
}

export const DEFAULT_COUNT_RULES: CountRules = { replies: true, reposts: false };

/**
 * What the feed says under the given rules:
 * - `at`: the newest activity that counts;
 * - `never`: the whole feed was read and nothing counts;
 * - `atLeast`: nothing counts in what was read, which goes back to `since`.
 */
export type ActivityAnswer = { kind: 'at'; at: string } | { kind: 'never' } | { kind: 'atLeast'; since: string };

export function lastActivity(summary: FeedSummary, rules: CountRules): ActivityAnswer {
  const candidates = [summary.lastPost, rules.replies ? summary.lastReply : undefined, rules.reposts ? summary.lastRepost : undefined];
  let best: string | undefined;
  for (const at of candidates) if (at && (!best || at > best)) best = at;
  if (best) return { kind: 'at', at: best };
  if (summary.complete || !summary.oldestSeen) return { kind: 'never' };
  return { kind: 'atLeast', since: summary.oldestSeen };
}

export type AuthorFeedFetcher = (params: {
  actor: string;
  limit: number;
  filter: string;
  cursor?: string;
  signal?: AbortSignal;
}) => Promise<GetAuthorFeedResponse>;

export interface ReadFeedOptions {
  /** Pages of `pageSize` to read after the first single-item page. */
  maxExtraPages?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/**
 * Asks for a single item first, which answers the question for most
 * accounts. Only when that item isn't a plain post are a few more pages
 * read, stopping at the first plain post.
 */
export async function readFeed(
  fetchFeed: AuthorFeedFetcher,
  actor: string,
  { maxExtraPages = 3, pageSize = 30, signal }: ReadFeedOptions = {},
): Promise<FeedSummary> {
  const filter = 'posts_with_replies';
  const seen: FeedViewPost[] = [];
  const hasPost = () => seen.some((item) => classifyItem(item) === 'post');

  let res = await fetchFeed({ actor, limit: 1, filter, signal });
  seen.push(...res.feed);
  for (let page = 0; !hasPost() && res.cursor && res.feed.length > 0 && page < maxExtraPages; page++) {
    res = await fetchFeed({ actor, limit: pageSize, filter, cursor: res.cursor, signal });
    seen.push(...res.feed);
  }
  const ended = !res.cursor || res.feed.length === 0;
  return summarize(seen, hasPost() || ended);
}
