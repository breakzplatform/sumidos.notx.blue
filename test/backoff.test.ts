import { describe, expect, it } from 'vitest';
import { backoffDelay, isRetryableStatus, parseRateLimit, retryDelay, sleep } from '../src/lib/backoff';

describe('backoffDelay', () => {
  const opts = { baseMs: 1000, maxMs: 30_000, jitter: 0 };

  it('doubles each attempt', () => {
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, opts))).toEqual([1000, 2000, 4000, 8000]);
  });

  it('is capped', () => {
    expect(backoffDelay(10, opts)).toBe(30_000);
  });

  it('subtracts jitter within bounds', () => {
    const d = backoffDelay(2, { ...opts, jitter: 0.5 }, () => 1);
    expect(d).toBe(2000);
    expect(backoffDelay(2, { ...opts, jitter: 0.5 }, () => 0)).toBe(4000);
  });
});

describe('parseRateLimit', () => {
  const now = 1_700_000_000_000;

  it('reads atproto ratelimit headers (reset as epoch seconds)', () => {
    const h = new Headers({ 'ratelimit-limit': '3000', 'ratelimit-remaining': '0', 'ratelimit-reset': '1700000060' });
    expect(parseRateLimit(h, now)).toEqual({ limit: 3000, remaining: 0, resetAt: 1_700_000_060_000 });
  });

  it('treats small reset values as relative seconds', () => {
    const h = new Headers({ 'ratelimit-reset': '30' });
    expect(parseRateLimit(h, now).resetAt).toBe(now + 30_000);
  });

  it('reads retry-after in seconds or as a date', () => {
    expect(parseRateLimit(new Headers({ 'retry-after': '7' }), now).retryAfterMs).toBe(7000);
    const date = new Date(now + 5000).toUTCString();
    expect(parseRateLimit(new Headers({ 'retry-after': date }), now).retryAfterMs).toBe(5000);
  });

  it('ignores garbage', () => {
    expect(parseRateLimit(new Headers({ 'ratelimit-remaining': 'lots', 'retry-after': 'soon' }), now)).toEqual({});
  });
});

describe('retryDelay', () => {
  const opts = { baseMs: 1000, maxMs: 60_000, retries: 5, jitter: 0 };
  const now = 1_000_000;

  it('prefers retry-after', () => {
    expect(retryDelay(0, { retryAfterMs: 12_000 }, now, opts)).toBe(12_000);
  });

  it('waits for the reset when the window is used up', () => {
    expect(retryDelay(0, { remaining: 0, resetAt: now + 9000 }, now, opts)).toBe(9000);
  });

  it('caps server hints at five minutes', () => {
    expect(retryDelay(0, { retryAfterMs: 3_600_000 }, now, opts)).toBe(300_000);
  });

  it('falls back to exponential backoff', () => {
    expect(retryDelay(3, {}, now, opts)).toBe(8000);
  });

  it('keeps the backoff as a floor when retry-after is zero', () => {
    expect(retryDelay(2, { retryAfterMs: 0 }, now, opts)).toBe(4000);
  });

  it('keeps the backoff as a floor when the reset is already past', () => {
    expect(retryDelay(1, { remaining: 0, resetAt: now - 60_000 }, now, opts)).toBe(2000);
  });
});

describe('isRetryableStatus', () => {
  it('retries 429 and transient 5xx only', () => {
    expect([429, 408, 500, 502, 503, 504].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404, 501].some(isRetryableStatus)).toBe(false);
  });
});

describe('sleep', () => {
  it('rejects when aborted', async () => {
    const ac = new AbortController();
    const p = sleep(10_000, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
  });
});
