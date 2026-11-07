import { describe, expect, it } from 'vitest';
import { csvField, profileUrl, rowsToCsv } from '../src/lib/csv';
import type { Row } from '../src/lib/inactivity';

describe('csvField', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('@cmd')).toBe("'@cmd");
  });

  it('renders empty values', () => {
    expect(csvField(undefined)).toBe('');
    expect(csvField(null)).toBe('');
    expect(csvField(false)).toBe('false');
  });
});

describe('profileUrl', () => {
  it('links by handle, or DID when the handle is invalid', () => {
    expect(profileUrl({ did: 'did:plc:a', handle: 'alice.test' })).toBe('https://bsky.app/profile/alice.test');
    expect(profileUrl({ did: 'did:plc:a', handle: 'handle.invalid' })).toBe('https://bsky.app/profile/did%3Aplc%3Aa');
  });
});

describe('rowsToCsv', () => {
  it('writes a header and one line per row, in order', () => {
    const rows: Row[] = [
      {
        account: { did: 'did:plc:a', handle: 'alice.test', displayName: 'Alice, "A"', status: 'active' },
        standing: { kind: 'at', at: '2026-01-01T00:00:00.000Z' },
        days: 300,
      },
      { account: { did: 'did:plc:b', handle: 'bob.test', status: 'deactivated' }, standing: { kind: 'unavailable' }, days: Infinity },
      { account: { did: 'did:plc:c', handle: 'carol.test', status: 'active' }, standing: { kind: 'atLeast', since: '2026-01-01T00:00:00.000Z' }, days: 120 },
    ];
    const lines = rowsToCsv(rows).split('\r\n');
    expect(lines[0]).toBe('handle,did,display_name,profile_url,status,last_activity_at,inactive_days,at_least,never_posted');
    expect(lines[1]).toBe('alice.test,did:plc:a,"Alice, ""A""",https://bsky.app/profile/alice.test,active,2026-01-01T00:00:00.000Z,300,false,false');
    expect(lines[2]).toBe('bob.test,did:plc:b,,https://bsky.app/profile/bob.test,deactivated,,,false,false');
    expect(lines[3]).toBe('carol.test,did:plc:c,,https://bsky.app/profile/carol.test,active,,120,true,false');
    expect(lines[4]).toBe('');
  });
});
