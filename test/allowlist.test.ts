import { describe, expect, it } from 'vitest';
import { Allowlist } from '../src/lib/allowlist';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('Allowlist', () => {
  it('persists across instances', () => {
    const storage = memoryStorage();
    const a = new Allowlist(storage);
    a.add('did:plc:a', 'a.test');
    expect(new Allowlist(storage).has('did:plc:a')).toBe(true);
  });

  it('toggles and notifies listeners', () => {
    const a = new Allowlist(memoryStorage());
    let calls = 0;
    a.onChange(() => calls++);
    expect(a.toggle('did:plc:a')).toBe(true);
    expect(a.toggle('did:plc:a')).toBe(false);
    expect(a.size).toBe(0);
    expect(calls).toBe(2);
  });

  it('exports and imports, merging entries', () => {
    const a = new Allowlist(memoryStorage());
    a.add('did:plc:a', 'a.test');
    const file = JSON.parse(JSON.stringify(a.export()));
    expect(file.type).toBe('quiet.notx.blue/allowlist');
    const b = new Allowlist(memoryStorage());
    b.add('did:plc:b');
    expect(b.import(file)).toBe(1);
    expect([...b.dids()].sort()).toEqual(['did:plc:a', 'did:plc:b']);
  });

  it('imports a plain array of DIDs and rejects junk', () => {
    const a = new Allowlist(memoryStorage());
    expect(a.import(['did:plc:x', 'nope', 42])).toBe(1);
    expect(() => a.import({ hello: 'world' })).toThrow();
  });

  it('works without storage', () => {
    const a = new Allowlist(null);
    a.add('did:plc:a');
    expect(a.has('did:plc:a')).toBe(true);
  });
});
