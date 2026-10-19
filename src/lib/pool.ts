/**
 * Runs `worker` over `items` with at most `concurrency` in flight.
 * Results keep the input order. A failing item does not stop the others;
 * its error is reported in the result. Aborting stops scheduling new work
 * and rejects with the abort reason once in-flight work has settled.
 */

export type PoolResult<R> = { ok: true; value: R } | { ok: false; error: unknown };

export interface PoolOptions<T, R> {
  concurrency: number;
  signal?: AbortSignal;
  onSettled?: (info: { done: number; total: number; item: T; result: PoolResult<R> }) => void;
}

export async function runPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number, signal?: AbortSignal) => Promise<R>,
  { concurrency, signal, onSettled }: PoolOptions<T, R>,
): Promise<PoolResult<R>[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: PoolResult<R>[] = new Array(items.length);
  let next = 0;
  let done = 0;

  async function lane(): Promise<void> {
    while (next < items.length) {
      if (signal?.aborted) return;
      const index = next++;
      const item = items[index] as T;
      let result: PoolResult<R>;
      try {
        result = { ok: true, value: await worker(item, index, signal) };
      } catch (error) {
        result = { ok: false, error };
      }
      results[index] = result;
      done++;
      onSettled?.({ done, total: items.length, item, result });
    }
  }

  const lanes = Array.from({ length: Math.min(limit, items.length) }, lane);
  await Promise.all(lanes);
  signal?.throwIfAborted();
  return results;
}
