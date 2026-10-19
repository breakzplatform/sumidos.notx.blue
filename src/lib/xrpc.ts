/**
 * A deliberately small XRPC client. It works on top of a "fetch handler"
 * (pathname + init -> Response), which is the same shape an OAuth session
 * exposes, so public reads and authenticated writes share one code path
 * for retries and rate limiting.
 */
import {
  DEFAULT_BACKOFF,
  isRetryableStatus,
  parseRateLimit,
  retryDelay,
  sleep as defaultSleep,
  type BackoffOptions,
  type RateLimitInfo,
} from './backoff';

export type FetchHandler = (pathname: string, init?: RequestInit) => Promise<Response>;

export type QueryParams = Record<string, string | number | boolean | string[] | undefined>;

export function serviceFetchHandler(
  service: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): FetchHandler {
  const base = service.replace(/\/+$/, '');
  return (pathname, init) => fetchImpl(base + pathname, init);
}

export class XrpcError extends Error {
  readonly status: number;
  /** atproto error name, e.g. "InvalidRequest", "AccountDeactivated". */
  readonly error: string;
  readonly headers?: Headers;
  constructor(status: number, error: string, message: string, headers?: Headers) {
    super(message || error || `HTTP ${status}`);
    this.name = 'XrpcError';
    this.status = status;
    this.error = error;
    if (headers) this.headers = headers;
  }
}

export function encodeParams(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.append(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/**
 * Shared pause shared by every request made through the clients that use
 * it: when a response says the rate-limit window is (almost) used up, all
 * further requests wait until the window resets.
 */
export class RateGate {
  private pauseUntil = 0;
  constructor(
    private readonly threshold = 5,
    private readonly now: () => number = Date.now,
  ) {}

  observe(info: RateLimitInfo): void {
    if (info.remaining !== undefined && info.remaining <= this.threshold && info.resetAt) {
      this.pauseUntil = Math.max(this.pauseUntil, info.resetAt);
    }
  }

  pauseFor(ms: number): void {
    this.pauseUntil = Math.max(this.pauseUntil, this.now() + ms);
  }

  /** Milliseconds a new request should wait before going out. */
  waitMs(): number {
    return Math.max(0, this.pauseUntil - this.now());
  }
}

export interface RetryEvent {
  nsid: string;
  attempt: number;
  status: number;
  delayMs: number;
}

export interface XrpcClientOptions {
  backoff?: BackoffOptions;
  gate?: RateGate;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  random?: () => number;
  onRetry?: (event: RetryEvent) => void;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export class XrpcClient {
  private readonly backoff: BackoffOptions;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  readonly gate: RateGate;

  constructor(
    private readonly handler: FetchHandler,
    private readonly opts: XrpcClientOptions = {},
  ) {
    this.backoff = opts.backoff ?? DEFAULT_BACKOFF;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.gate = opts.gate ?? new RateGate(5, this.now);
  }

  query<T>(nsid: string, params?: QueryParams, call: CallOptions = {}): Promise<T> {
    return this.request<T>(nsid, `/xrpc/${nsid}${encodeParams(params)}`, { method: 'GET' }, call);
  }

  procedure<T>(nsid: string, body: unknown, call: CallOptions = {}): Promise<T> {
    return this.request<T>(
      nsid,
      `/xrpc/${nsid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      call,
    );
  }

  private async request<T>(
    nsid: string,
    path: string,
    init: RequestInit,
    { signal }: CallOptions,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.gate.waitMs();
      if (wait > 0) await this.sleep(wait, signal);
      signal?.throwIfAborted();

      let res: Response;
      try {
        res = await this.handler(path, { ...init, signal });
      } catch (err) {
        if (signal?.aborted) throw err;
        // Network failure (offline, CORS on an error page, reset...).
        if (attempt >= this.backoff.retries) throw err;
        const delayMs = retryDelay(attempt, {}, this.now(), this.backoff, this.random);
        this.opts.onRetry?.({ nsid, attempt, status: 0, delayMs });
        await this.sleep(delayMs, signal);
        continue;
      }

      const info = parseRateLimit(res.headers, this.now());
      this.gate.observe(info);

      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      }

      const { error, message } = await readError(res);
      if (isRetryableStatus(res.status) && attempt < this.backoff.retries) {
        const delayMs = retryDelay(attempt, info, this.now(), this.backoff, this.random);
        if (res.status === 429) this.gate.pauseFor(delayMs);
        this.opts.onRetry?.({ nsid, attempt, status: res.status, delayMs });
        await this.sleep(delayMs, signal);
        continue;
      }
      throw new XrpcError(res.status, error, message, res.headers);
    }
  }
}

async function readError(res: Response): Promise<{ error: string; message: string }> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    // ignore, body unreadable
  }
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    return {
      error: typeof body.error === 'string' ? body.error : '',
      message: typeof body.message === 'string' ? body.message : '',
    };
  } catch {
    // Load balancers and CDNs answer with HTML error pages.
    return { error: '', message: `HTTP ${res.status}` };
  }
}
