/**
 * Local cache of scan results, one record per scanned account, kept in
 * IndexedDB. Nothing here ever leaves the browser.
 */
import type { Account, ActivityMode } from './types';

export interface ScanRecord {
  /** DID of the scanned account. */
  did: string;
  handle: string;
  mode: ActivityMode;
  /** Epoch ms of the last completed (or cancelled) scan. */
  scannedAt: number;
  accounts: Account[];
}

export interface ScanSummary {
  did: string;
  handle: string;
  scannedAt: number;
  count: number;
}

export interface ScanStore {
  get(did: string): Promise<ScanRecord | undefined>;
  put(record: ScanRecord): Promise<void>;
  delete(did: string): Promise<void>;
  list(): Promise<ScanSummary[]>;
  clear(): Promise<void>;
}

export interface StaleOptions {
  now: number;
  /** Activity older than this is refetched. */
  maxAgeMs: number;
  mode: ActivityMode;
  /** A full scan also replaces results a quick scan only estimated. */
  deep: boolean;
}

/** Whether an account's cached activity needs to be fetched again. */
export function isStale(a: Account | undefined, { now, maxAgeMs, mode, deep }: StaleOptions): boolean {
  if (!a || a.checkedAt === undefined) return true;
  if (a.activityMode !== mode) return true;
  if (a.status === 'error') return true;
  if (deep && a.approximate) return true;
  return now - a.checkedAt > maxAgeMs;
}

export const DEFAULT_MAX_AGE_MS = 24 * 3_600_000;

function summarize(r: ScanRecord): ScanSummary {
  return { did: r.did, handle: r.handle, scannedAt: r.scannedAt, count: r.accounts.length };
}

export class MemoryScanStore implements ScanStore {
  private readonly map = new Map<string, ScanRecord>();
  async get(did: string) {
    const r = this.map.get(did);
    return r ? structuredClone(r) : undefined;
  }
  async put(record: ScanRecord) {
    this.map.set(record.did, structuredClone(record));
  }
  async delete(did: string) {
    this.map.delete(did);
  }
  async list() {
    return [...this.map.values()].map(summarize);
  }
  async clear() {
    this.map.clear();
  }
}

const DB_NAME = 'quiet-notx-blue';
const DB_VERSION = 1;
const STORE = 'scans';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbScanStore implements ScanStore {
  private db?: Promise<IDBDatabase>;

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly name = DB_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(this.name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'did' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    });
    return this.db;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(STORE, mode);
    const result = promisify(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
    return result;
  }

  async get(did: string) {
    return (await this.tx('readonly', (s) => s.get(did))) as ScanRecord | undefined;
  }
  async put(record: ScanRecord) {
    await this.tx('readwrite', (s) => s.put(record));
  }
  async delete(did: string) {
    await this.tx('readwrite', (s) => s.delete(did));
  }
  async list() {
    const all = (await this.tx('readonly', (s) => s.getAll())) as ScanRecord[];
    return all.map(summarize).sort((a, b) => b.scannedAt - a.scannedAt);
  }
  async clear() {
    await this.tx('readwrite', (s) => s.clear());
  }
}

/** IndexedDB when available (it isn't in some private modes), else memory. */
export function createScanStore(): ScanStore {
  try {
    if (globalThis.indexedDB) return new IdbScanStore();
  } catch {
    // fall through
  }
  return new MemoryScanStore();
}
