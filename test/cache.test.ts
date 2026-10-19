import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IdbScanStore, MemoryScanStore, isStale, type ScanRecord } from '../src/lib/cache';
import type { Account } from '../src/lib/types';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const base = { now: NOW, maxAgeMs: 24 * HOUR, mode: 'posts' as const, deep: true };

function checked(extra: Partial<Account> = {}): Account {
  return {
    did: 'did:plc:a',
    handle: 'a.test',
    status: 'active',
    activityMode: 'posts',
    checkedAt: NOW - HOUR,
    lastActivity: null,
    ...extra,
  };
}

describe('isStale', () => {
  it('missing or never checked entries are stale', () => {
    expect(isStale(undefined, base)).toBe(true);
    expect(isStale(checked({ checkedAt: undefined }), base)).toBe(true);
  });

  it('fresh entries are reused', () => {
    expect(isStale(checked(), base)).toBe(false);
  });

  it('entries older than maxAge are stale', () => {
    expect(isStale(checked({ checkedAt: NOW - 25 * HOUR }), base)).toBe(true);
    expect(isStale(checked({ checkedAt: NOW - 24 * HOUR }), base)).toBe(false);
  });

  it('a different activity mode makes entries stale', () => {
    expect(isStale(checked({ activityMode: 'all' }), base)).toBe(true);
  });

  it('a full scan refreshes approximate (quick scan) results, a quick scan does not', () => {
    const approx = checked({ approximate: true, quietSince: new Date(NOW).toISOString() });
    expect(isStale(approx, base)).toBe(true);
    expect(isStale(approx, { ...base, deep: false })).toBe(false);
  });

  it('errors are retried', () => {
    expect(isStale(checked({ status: 'error' }), base)).toBe(true);
  });
});

const record = (did: string, scannedAt: number): ScanRecord => ({
  did,
  handle: `${did.slice(8)}.test`,
  mode: 'posts',
  scannedAt,
  accounts: [checked()],
});

describe.each([
  ['memory', () => new MemoryScanStore()],
  ['indexeddb', () => new IdbScanStore(indexedDB, `test-${Math.random()}`)],
])('%s store', (_name, make) => {
  it('round-trips, lists newest first, deletes and clears', async () => {
    const store = make();
    expect(await store.get('did:plc:x')).toBeUndefined();
    await store.put(record('did:plc:old', 1));
    await store.put(record('did:plc:new', 2));
    expect((await store.get('did:plc:old'))?.accounts).toHaveLength(1);
    const list = await store.list();
    expect(list.map((s) => s.did).sort()).toEqual(['did:plc:new', 'did:plc:old']);
    await store.delete('did:plc:old');
    expect(await store.get('did:plc:old')).toBeUndefined();
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('put replaces the previous record', async () => {
    const store = make();
    await store.put(record('did:plc:a', 1));
    await store.put({ ...record('did:plc:a', 5), accounts: [] });
    expect(await store.get('did:plc:a')).toMatchObject({ scannedAt: 5, accounts: [] });
  });
});
