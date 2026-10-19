import { describe, expect, it, vi } from 'vitest';
import {
  classifyItem,
  feedFilterFor,
  findLastActivity,
  itemTime,
  pickLastActivity,
  type AuthorFeedFetcher,
} from '../src/lib/activity';
import type { FeedViewPost } from '../src/lib/types';
import { post, repost } from './helpers';

const P = post('2024-03-01T00:00:00.000Z');
const R = post('2024-04-01T00:00:00.000Z', { reply: true });
const RP = repost('2024-05-01T00:00:00.000Z');
const PIN: FeedViewPost = { ...post('2025-01-01T00:00:00.000Z'), reason: { $type: 'app.bsky.feed.defs#reasonPin' } };

describe('feed filter per mode', () => {
  it('maps modes to getAuthorFeed filters', () => {
    expect(feedFilterFor('posts')).toBe('posts_no_replies');
    expect(feedFilterFor('posts_replies')).toBe('posts_with_replies');
    expect(feedFilterFor('all')).toBe('posts_with_replies');
  });
});

describe('classifyItem / itemTime', () => {
  it('tells posts, replies, reposts and pins apart', () => {
    expect([P, R, RP, PIN].map(classifyItem)).toEqual(['post', 'reply', 'repost', 'pin']);
  });

  it('uses the repost time for reposts, not the original post', () => {
    expect(itemTime(RP)).toBe(Date.parse('2024-05-01T00:00:00.000Z'));
  });

  it('does not trust future-dated createdAt', () => {
    const future = post('2099-01-01T00:00:00.000Z', { indexedAt: '2024-01-01T00:00:00.000Z' });
    expect(itemTime(future)).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
  });
});

describe('pickLastActivity for each mode', () => {
  const feed = [RP, R, P, PIN];

  it('posts only: ignores replies, reposts and pins', () => {
    expect(pickLastActivity(feed, 'posts')).toMatchObject({ kind: 'post', at: '2024-03-01T00:00:00.000Z' });
  });

  it('posts and replies: counts replies, not reposts', () => {
    expect(pickLastActivity(feed, 'posts_replies')).toMatchObject({ kind: 'reply', at: '2024-04-01T00:00:00.000Z' });
  });

  it('including reposts: the repost wins', () => {
    expect(pickLastActivity(feed, 'all')).toMatchObject({ kind: 'repost', at: '2024-05-01T00:00:00.000Z' });
  });

  it('returns null when nothing counts', () => {
    expect(pickLastActivity([RP, PIN], 'posts')).toBeNull();
    expect(pickLastActivity([], 'all')).toBeNull();
  });
});

function fakeFeed(items: FeedViewPost[]): ReturnType<typeof vi.fn> & AuthorFeedFetcher {
  return vi.fn(async ({ limit, cursor }: { limit: number; cursor?: string }) => {
    const start = cursor ? Number(cursor) : 0;
    const page = items.slice(start, start + limit);
    const next = start + limit;
    return { feed: page, ...(next < items.length ? { cursor: String(next) } : {}) };
  }) as never;
}

describe('findLastActivity', () => {
  it('needs a single request when the first item counts', async () => {
    const fetch = fakeFeed([P, R]);
    const res = await findLastActivity(fetch, 'did:plc:a', 'posts', { deep: true });
    expect(res.lastActivity?.kind).toBe('post');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toMatchObject({ limit: 1, filter: 'posts_no_replies' });
  });

  it('reports never posted on an empty feed', async () => {
    const res = await findLastActivity(fakeFeed([]), 'did:plc:a', 'all', { deep: true });
    expect(res).toEqual({ lastActivity: null });
  });

  it('deep: pages past reposts to find the last post', async () => {
    const fetch = fakeFeed([RP, RP, RP, P]);
    const res = await findLastActivity(fetch, 'did:plc:a', 'posts', { deep: true, pageSize: 2 });
    expect(res.lastActivity?.at).toBe('2024-03-01T00:00:00.000Z');
    expect(res.approximate).toBeUndefined();
  });

  it('deep: concludes there is no matching post once the feed is exhausted', async () => {
    const res = await findLastActivity(fakeFeed([RP, RP]), 'did:plc:a', 'posts', { deep: true });
    expect(res).toEqual({ lastActivity: null });
  });

  it('deep: gives a lower bound when the page budget runs out', async () => {
    const items = Array.from({ length: 50 }, (_, i) => repost(new Date(Date.UTC(2024, 0, 50 - i)).toISOString()));
    const res = await findLastActivity(fakeFeed(items), 'did:plc:a', 'posts', {
      deep: true,
      pageSize: 5,
      maxExtraPages: 2,
    });
    expect(res.lastActivity).toBeNull();
    expect(res.approximate).toBe(true);
    expect(res.quietSince).toBe(items[10]!.reason!.indexedAt);
  });

  it('quick: does not page, returns a lower bound from the first item', async () => {
    const fetch = fakeFeed([RP, P]);
    const res = await findLastActivity(fetch, 'did:plc:a', 'posts', { deep: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ lastActivity: null, approximate: true, quietSince: '2024-05-01T00:00:00.000Z' });
  });
});
