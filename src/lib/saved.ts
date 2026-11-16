import type { ScanSubject } from './scan';
import type { Account } from './types';
import type { StoredFollow } from './unfollow';

/**
 * What stays in this browser between visits, in IndexedDB: the last list read
 * and, per signed-in account, everyone it unfollowed here, with the original
 * follow records so a later visit can follow them again as they were.
 */

export interface SavedList {
  savedAt: string;
  subject: ScanSubject;
  owned: boolean;
  /** The read stopped before the end. */
  partial: boolean;
  accounts: Account[];
}

export interface Unfollowed {
  account: Account;
  records: StoredFollow[];
  at: string;
}

/** Followed DID -> how it was unfollowed. */
export type UnfollowedMap = Record<string, Unfollowed>;

const DB_NAME = 'sumidos';
const STORE = 'kv';
const LAST_KEY = 'last';
const unfollowedKey = (owner: string) => `unfollowed:${owner}`;

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      // No IndexedDB (private mode in some browsers): nothing is kept.
      resolve(null);
    }
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = act(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const loadList = () => run<SavedList>('readonly', (s) => s.get(LAST_KEY));
export const saveList = (list: SavedList) => run('readwrite', (s) => s.put(list, LAST_KEY));
export const clearList = () => run('readwrite', (s) => s.delete(LAST_KEY));

export async function loadUnfollowed(owner: string): Promise<UnfollowedMap> {
  return (await run<UnfollowedMap>('readonly', (s) => s.get(unfollowedKey(owner)))) ?? {};
}
export const saveUnfollowed = (owner: string, map: UnfollowedMap) =>
  run('readwrite', (s) => s.put(map, unfollowedKey(owner)));
