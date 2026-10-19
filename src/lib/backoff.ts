/**
 * Retry helpers: exponential backoff with jitter, and parsing of the
 * rate-limit headers that atproto services send.
 */

export interface BackoffOptions {
  /** Delay before the first retry, in ms. */
  baseMs: number;
  /** Upper bound for a single computed delay, in ms. */
  maxMs: number;
  /** Maximum number of retries (not counting the first attempt). */
  retries: number;
  /** 0 disables jitter, 1 means "anywhere between 0 and the full delay". */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 1000,
  maxMs: 60_000,
  retries: 5,
  jitter: 0.25,
};

/**
 * Delay for the given retry attempt (0-based): base * 2^attempt, capped,
 * with some jitter subtracted so parallel workers don't retry in lockstep.
 */
export function backoffDelay(
  attempt: number,
  opts: Pick<BackoffOptions, 'baseMs' | 'maxMs' | 'jitter'> = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const raw = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt);
  const jitter = raw * opts.jitter * random();
  return Math.max(0, Math.round(raw - jitter));
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  /** Epoch ms when the window resets. */
  resetAt?: number;
  /** Explicit wait requested by the server, in ms. */
  retryAfterMs?: number;
}

function num(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Reads `ratelimit-*` and `retry-after` headers. `ratelimit-reset` is an
 * epoch timestamp in seconds on atproto services; small values are treated
 * as "seconds from now" to also cover the IETF draft semantics.
 */
export function parseRateLimit(headers: Headers, now: number = Date.now()): RateLimitInfo {
  const info: RateLimitInfo = {};
  const limit = num(headers.get('ratelimit-limit'));
  const remaining = num(headers.get('ratelimit-remaining'));
  const reset = num(headers.get('ratelimit-reset'));
  if (limit !== undefined) info.limit = limit;
  if (remaining !== undefined) info.remaining = remaining;
  if (reset !== undefined) {
    // Anything below ~2001-09-09 in epoch seconds is a relative delta.
    info.resetAt = reset < 1_000_000_000 ? now + reset * 1000 : reset * 1000;
  }
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const secs = num(retryAfter);
    if (secs !== undefined) {
      info.retryAfterMs = Math.max(0, secs * 1000);
    } else {
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) info.retryAfterMs = Math.max(0, date - now);
    }
  }
  return info;
}

/** Status codes worth retrying: rate limited, or a transient server error. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status !== 501);
}

/**
 * How long to wait before retrying after a failed response. Server hints
 * win over our own schedule, but are capped so a bogus header can't stall
 * the app for hours.
 */
export function retryDelay(
  attempt: number,
  info: RateLimitInfo,
  now: number,
  opts: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const cap = 5 * 60_000;
  if (info.retryAfterMs !== undefined) return Math.min(cap, info.retryAfterMs);
  if (info.resetAt !== undefined && info.remaining === 0) {
    return Math.min(cap, Math.max(0, info.resetAt - now));
  }
  return backoffDelay(attempt, opts, random);
}

/** Abortable sleep. Rejects with the signal's reason when aborted. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
