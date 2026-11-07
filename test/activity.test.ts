import { describe, expect, it } from 'vitest';
import { classifyItem, itemTime, lastActivity, readFeed, summarize, type AuthorFeedFetcher } from '../src/lib/activity';
import type { FeedViewPost } from '../src/lib/types';
import { post, reply, repost } from './helpers';

const T1 = '2026-10-01T00:00:00.000Z';
const T2 = '2026-09-01T00:00:00.000Z';
const T3 = '2026-08-01T00:00:00.000Z';

function fetcherFor(feed: FeedViewPost[]) {
  const calls: { limit: number; cursor?: string; filter: string }[] = [];
  const fetchFeed: AuthorFeedFetcher = async ({ limit, cursor, filter }) => {
    calls.push({ limit, filter, ...(cursor ? { cursor } : {}) });
    const start = cursor ? Number(cursor) : 0;
    const next = start + limit;
    return { feed: feed.slice(start, next), ...(next < feed.length ? { cursor: String(next) } : {}) };
  };
  return { fetchFeed, calls };
}

describe('classifyItem and itemTime', () => {
  it('tells posts, replies and reposts apart', () => {
    expect(classifyItem(post(T1))).toBe('post');
    expect(classifyItem(reply(T1))).toBe('reply');
    expect(classifyItem(repost(T1))).toBe('repost');
  });

  it('never dates a post after the AppView saw it', () => {
    expect(itemTime(post('2030-01-01T00:00:00.000Z', { indexedAt: T1 }))).toBe(Date.parse(T1));
  });

  it('dates a repost by the repost, not the original post', () => {
    expect(itemTime(repost(T1))).toBe(Date.parse(T1));
  });
});

describe('summarize and lastActivity', () => {
  const summary = summarize([repost(T1), reply(T2), post(T3)], true);

  it('keeps the newest time per kind', () => {
    expect(summary).toEqual({ lastRepost: T1, lastReply: T2, lastPost: T3, oldestSeen: T3, complete: true });
  });

  it('answers every rule combination from the same read', () => {
    expect(lastActivity(summary, { replies: false, reposts: false })).toEqual({ kind: 'at', at: T3 });
    expect(lastActivity(summary, { replies: true, reposts: false })).toEqual({ kind: 'at', at: T2 });
    expect(lastActivity(summary, { replies: false, reposts: true })).toEqual({ kind: 'at', at: T1 });
    expect(lastActivity(summary, { replies: true, reposts: true })).toEqual({ kind: 'at', at: T1 });
  });

  it('says never when the whole feed holds nothing that counts', () => {
    expect(lastActivity(summarize([reply(T1)], true), { replies: false, reposts: false })).toEqual({ kind: 'never' });
    expect(lastActivity(summarize([], true), { replies: true, reposts: true })).toEqual({ kind: 'never' });
  });

  it('gives a lower bound when the read stopped early', () => {
    expect(lastActivity(summarize([reply(T1), reply(T2)], false), { replies: false, reposts: false })).toEqual({
      kind: 'atLeast',
      since: T2,
    });
  });
});

describe('readFeed', () => {
  it('stops after one item when it is a plain post', async () => {
    const { fetchFeed, calls } = fetcherFor([post(T1), post(T2)]);
    expect(await readFeed(fetchFeed, 'a')).toMatchObject({ lastPost: T1, complete: true });
    expect(calls).toEqual([{ limit: 1, filter: 'posts_with_replies' }]);
  });

  it('pages on until the first plain post', async () => {
    const { fetchFeed, calls } = fetcherFor([repost(T1), reply(T2), post(T3)]);
    const summary = await readFeed(fetchFeed, 'a', { pageSize: 1 });
    expect(summary).toMatchObject({ lastRepost: T1, lastReply: T2, lastPost: T3, complete: true });
    expect(calls).toHaveLength(3);
  });

  it('gives up after the extra pages and marks the result incomplete', async () => {
    const feed = [reply(T1), reply(T2), reply(T3), post('2026-01-01T00:00:00.000Z')];
    const { fetchFeed } = fetcherFor(feed);
    const summary = await readFeed(fetchFeed, 'a', { pageSize: 1, maxExtraPages: 2 });
    expect(summary.complete).toBe(false);
    expect(summary.oldestSeen).toBe(T3);
  });

  it('is complete when the feed ends', async () => {
    const { fetchFeed } = fetcherFor([reply(T1)]);
    expect(await readFeed(fetchFeed, 'a')).toMatchObject({ lastReply: T1, complete: true });
  });
});
