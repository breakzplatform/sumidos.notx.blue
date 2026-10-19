/**
 * Cursor pagination for list endpoints. Stops when the server returns no
 * cursor, repeats a cursor (seen in the wild on some services), returns an
 * empty page, or `maxPages` is reached.
 */

export interface Page<T> {
  items: T[];
  cursor?: string | undefined;
}

export interface PaginateOptions {
  maxPages?: number;
  signal?: AbortSignal;
}

export async function* paginate<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  { maxPages = Infinity, signal }: PaginateOptions = {},
): AsyncGenerator<T[], void, undefined> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    signal?.throwIfAborted();
    const res = await fetchPage(cursor);
    if (res.items.length > 0) yield res.items;
    if (!res.cursor || res.items.length === 0 || seen.has(res.cursor)) return;
    seen.add(res.cursor);
    cursor = res.cursor;
  }
}

export async function collect<T>(gen: AsyncIterable<T[]>): Promise<T[]> {
  const all: T[] = [];
  for await (const page of gen) all.push(...page);
  return all;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
