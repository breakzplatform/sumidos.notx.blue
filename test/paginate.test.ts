import { describe, expect, it, vi } from 'vitest';
import { chunk, collect, paginate } from '../src/lib/paginate';

function pages(data: { items: number[]; cursor?: string }[]) {
  const fetchPage = vi.fn(async (cursor: string | undefined) => {
    const index = cursor ? Number(cursor.slice(1)) : 0;
    return data[index]!;
  });
  return fetchPage;
}

describe('paginate', () => {
  it('follows cursors until there is none', async () => {
    const fetchPage = pages([{ items: [1, 2], cursor: 'c1' }, { items: [3, 4], cursor: 'c2' }, { items: [5] }]);
    expect(await collect(paginate(fetchPage))).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([undefined, 'c1', 'c2']);
  });

  it('stops on an empty page even if a cursor is returned', async () => {
    const fetchPage = pages([{ items: [1], cursor: 'c1' }, { items: [], cursor: 'c2' }, { items: [9] }]);
    expect(await collect(paginate(fetchPage))).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stops when a cursor repeats', async () => {
    const fetchPage = vi.fn(async () => ({ items: [1], cursor: 'same' }));
    expect(await collect(paginate(fetchPage))).toEqual([1, 1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('respects maxPages', async () => {
    const fetchPage = vi.fn(async (c: string | undefined) => ({ items: [1], cursor: `${c ?? ''}x` }));
    expect(await collect(paginate(fetchPage, { maxPages: 3 }))).toEqual([1, 1, 1]);
  });

  it('can be aborted between pages', async () => {
    const ac = new AbortController();
    const fetchPage = vi.fn(async (c: string | undefined) => {
      if (c) ac.abort();
      return { items: [1], cursor: `${c ?? ''}x` };
    });
    await expect(collect(paginate(fetchPage, { signal: ac.signal }))).rejects.toThrow();
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
