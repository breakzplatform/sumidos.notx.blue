import type { FeedViewPost } from '../src/lib/types';

export function post(createdAt: string, opts: { reply?: boolean; indexedAt?: string; uri?: string } = {}): FeedViewPost {
  return {
    post: {
      uri: opts.uri ?? `at://did:plc:a/app.bsky.feed.post/${createdAt}`,
      indexedAt: opts.indexedAt ?? createdAt,
      author: { did: 'did:plc:a' },
      record: { createdAt, ...(opts.reply ? { reply: { root: {}, parent: {} } } : {}) },
    },
  };
}

export function repost(at: string, originalCreatedAt = '2020-01-01T00:00:00.000Z'): FeedViewPost {
  return {
    post: {
      uri: `at://did:plc:other/app.bsky.feed.post/${at}`,
      indexedAt: originalCreatedAt,
      author: { did: 'did:plc:other' },
      record: { createdAt: originalCreatedAt },
    },
    reason: { $type: 'app.bsky.feed.defs#reasonRepost', indexedAt: at, by: { did: 'did:plc:a' } },
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Sleep that resolves immediately and records requested delays. */
export function fakeSleep() {
  const delays: number[] = [];
  const fn = async (ms: number, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    delays.push(ms);
  };
  return { fn, delays };
}

export const DAY = 86_400_000;
