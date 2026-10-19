import { describe, expect, it, vi } from 'vitest';
import { RateGate, XrpcClient, XrpcError, encodeParams } from '../src/lib/xrpc';
import { fakeSleep, jsonResponse } from './helpers';

const backoff = { baseMs: 100, maxMs: 10_000, retries: 3, jitter: 0 };

describe('encodeParams', () => {
  it('repeats array params and skips undefined', () => {
    expect(encodeParams({ actors: ['a', 'b'], limit: 25, cursor: undefined })).toBe('?actors=a&actors=b&limit=25');
    expect(encodeParams({})).toBe('');
  });
});

describe('XrpcClient', () => {
  it('builds the request path and parses JSON', async () => {
    const handler = vi.fn(async () => jsonResponse({ ok: 1 }));
    const client = new XrpcClient(handler);
    await expect(client.query('app.bsky.actor.getProfile', { actor: 'alice.test' })).resolves.toEqual({ ok: 1 });
    expect(handler).toHaveBeenCalledWith('/xrpc/app.bsky.actor.getProfile?actor=alice.test', expect.anything());
  });

  it('retries 5xx with exponential backoff, then succeeds', async () => {
    const responses = [
      new Response('<html>503</html>', { status: 503 }),
      new Response('bad gateway', { status: 502 }),
      jsonResponse({ ok: true }),
    ];
    const sleep = fakeSleep();
    const retries: number[] = [];
    const client = new XrpcClient(async () => responses.shift()!, {
      backoff,
      sleep: sleep.fn,
      onRetry: (e) => retries.push(e.status),
    });
    await expect(client.query('x.y.z')).resolves.toEqual({ ok: true });
    expect(sleep.delays).toEqual([100, 200]);
    expect(retries).toEqual([503, 502]);
  });

  it('honors retry-after on 429 and pauses other requests through the gate', async () => {
    let now = 0;
    const gate = new RateGate(5, () => now);
    const responses = [jsonResponse({ error: 'RateLimitExceeded' }, 429, { 'retry-after': '3' }), jsonResponse({})];
    const sleep = fakeSleep();
    const client = new XrpcClient(async () => responses.shift()!, { backoff, sleep: sleep.fn, gate, now: () => now });
    await client.query('x.y.z');
    expect(sleep.delays[0]).toBe(3000);
    expect(gate.waitMs()).toBe(3000);
    now = 3000;
    expect(gate.waitMs()).toBe(0);
  });

  it('pauses before the next request when the window is almost used up', async () => {
    const now = 1_700_000_000_000;
    const sleep = fakeSleep();
    const responses = [
      jsonResponse({}, 200, { 'ratelimit-remaining': '2', 'ratelimit-reset': String(now / 1000 + 20) }),
      jsonResponse({}),
    ];
    const client = new XrpcClient(async () => responses.shift()!, { backoff, sleep: sleep.fn, now: () => now });
    await client.query('a.b.c');
    expect(sleep.delays).toEqual([]);
    await client.query('a.b.c');
    expect(sleep.delays).toEqual([20_000]);
  });

  it('gives up after the retry budget and throws XrpcError', async () => {
    const sleep = fakeSleep();
    const handler = vi.fn(async () => jsonResponse({ error: 'InternalServerError', message: 'boom' }, 500));
    const client = new XrpcClient(handler, { backoff, sleep: sleep.fn });
    const err = await client.query<never>('a.b.c').catch((e: XrpcError) => e);
    expect(err).toBeInstanceOf(XrpcError);
    expect(err.status).toBe(500);
    expect(handler).toHaveBeenCalledTimes(4);
    expect(sleep.delays).toEqual([100, 200, 400]);
  });

  it('does not retry client errors and exposes the atproto error name', async () => {
    const handler = vi.fn(async () => jsonResponse({ error: 'AccountDeactivated', message: 'gone' }, 400));
    const client = new XrpcClient(handler, { backoff, sleep: fakeSleep().fn });
    const err = await client.query<never>('a.b.c').catch((e: XrpcError) => e);
    expect(err.error).toBe('AccountDeactivated');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('retries network failures', async () => {
    let calls = 0;
    const client = new XrpcClient(
      async () => {
        if (calls++ === 0) throw new TypeError('Failed to fetch');
        return jsonResponse({ fine: true });
      },
      { backoff, sleep: fakeSleep().fn },
    );
    await expect(client.query('a.b.c')).resolves.toEqual({ fine: true });
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const client = new XrpcClient(async () => jsonResponse({}), { backoff });
    await expect(client.query('a.b.c', {}, { signal: ac.signal })).rejects.toThrow();
  });

  it('sends procedures as JSON POST', async () => {
    const handler = vi.fn(async (_path: string, _init?: RequestInit) => new Response('', { status: 200 }));
    const client = new XrpcClient(handler);
    await client.procedure('com.atproto.repo.deleteRecord', { repo: 'did:plc:a' });
    const [path, init] = handler.mock.calls[0]!;
    expect(path).toBe('/xrpc/com.atproto.repo.deleteRecord');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ repo: 'did:plc:a' });
  });
});
