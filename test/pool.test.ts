import { describe, expect, it } from 'vitest';
import { runPool } from '../src/lib/pool';

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

describe('runPool', () => {
  it('never exceeds the concurrency limit and keeps order', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const results = await runPool(
      items,
      async (n) => {
        active++;
        peak = Math.max(peak, active);
        await tick(Math.random() * 5);
        active--;
        return n * 2;
      },
      { concurrency: 4 },
    );
    expect(peak).toBe(4);
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual(items.map((n) => n * 2));
  });

  it('reports failures without stopping other items', async () => {
    const results = await runPool(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('nope');
        return n;
      },
      { concurrency: 2 },
    );
    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1]!.ok).toBe(false);
    expect(results[2]).toEqual({ ok: true, value: 3 });
  });

  it('reports progress for every item', async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3, 4], async (n) => n, { concurrency: 2, onSettled: ({ done }) => seen.push(done) });
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('stops scheduling after abort and rejects', async () => {
    const ac = new AbortController();
    let started = 0;
    const p = runPool(
      Array.from({ length: 100 }, (_, i) => i),
      async () => {
        started++;
        if (started === 3) ac.abort();
        await tick();
      },
      { concurrency: 2, signal: ac.signal },
    );
    await expect(p).rejects.toThrow();
    expect(started).toBeLessThan(10);
  });

  it('handles empty input and odd concurrency values', async () => {
    expect(await runPool([], async () => 1, { concurrency: 4 })).toEqual([]);
    expect(await runPool([1], async (n) => n, { concurrency: 0 })).toEqual([{ ok: true, value: 1 }]);
  });
});
