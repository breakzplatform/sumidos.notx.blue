/**
 * "Never suggest unfollowing" list, kept in localStorage and exportable
 * as JSON.
 */

export interface AllowlistEntry {
  did: string;
  handle?: string;
  addedAt: string;
}

export interface AllowlistFile {
  type: 'quiet.notx.blue/allowlist';
  version: 1;
  exportedAt: string;
  entries: AllowlistEntry[];
}

const KEY = 'quiet.allowlist.v1';

export class Allowlist {
  private entries = new Map<string, AllowlistEntry>();
  private listeners = new Set<() => void>();

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.load();
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return;
      for (const e of parseEntries(JSON.parse(raw))) this.entries.set(e.did, e);
    } catch {
      // corrupt storage: start empty
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.entries.values()]));
    } catch {
      // quota or disabled storage: keep the in-memory list
    }
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  has(did: string): boolean {
    return this.entries.has(did);
  }

  get size(): number {
    return this.entries.size;
  }

  dids(): Set<string> {
    return new Set(this.entries.keys());
  }

  list(): AllowlistEntry[] {
    return [...this.entries.values()];
  }

  add(did: string, handle?: string, now = new Date()): void {
    this.entries.set(did, { did, ...(handle ? { handle } : {}), addedAt: now.toISOString() });
    this.save();
  }

  remove(did: string): void {
    if (this.entries.delete(did)) this.save();
  }

  toggle(did: string, handle?: string): boolean {
    if (this.has(did)) {
      this.remove(did);
      return false;
    }
    this.add(did, handle);
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.save();
  }

  export(now = new Date()): AllowlistFile {
    return { type: 'quiet.notx.blue/allowlist', version: 1, exportedAt: now.toISOString(), entries: this.list() };
  }

  /** Merges entries from an exported file. Returns how many were new. */
  import(data: unknown): number {
    const source =
      data && typeof data === 'object' && !Array.isArray(data) && 'entries' in data ? (data as AllowlistFile).entries : data;
    let added = 0;
    for (const e of parseEntries(source)) {
      if (!this.entries.has(e.did)) added++;
      this.entries.set(e.did, e);
    }
    this.save();
    return added;
  }
}

function parseEntries(value: unknown): AllowlistEntry[] {
  if (!Array.isArray(value)) throw new Error('Not an allowlist');
  const out: AllowlistEntry[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.startsWith('did:')) {
      out.push({ did: item, addedAt: new Date(0).toISOString() });
    } else if (item && typeof item === 'object' && typeof item.did === 'string' && item.did.startsWith('did:')) {
      out.push({
        did: item.did,
        ...(typeof item.handle === 'string' ? { handle: item.handle } : {}),
        addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date(0).toISOString(),
      });
    }
  }
  return out;
}
