import { describe, expect, it } from 'vitest';
import { accountsToCsv, csvField, profileUrl } from '../src/lib/csv';
import type { Account } from '../src/lib/types';

const NOW = Date.parse('2026-10-19T00:00:00.000Z');

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

describe('accountsToCsv', () => {
  it('writes a header and one row per account', () => {
    const accounts: Account[] = [
      {
        did: 'did:plc:a',
        handle: 'alice.test',
        displayName: 'Alice, "A"',
        status: 'active',
        mutual: false,
        postsCount: 3,
        followersCount: 10,
        followsCount: 2,
        avatar: 'x',
        lastActivity: { at: '2026-10-09T00:00:00.000Z', kind: 'post', uri: 'at://x' },
      },
      { did: 'did:plc:b', handle: 'bob.test', status: 'deactivated' },
    ];
    const csv = accountsToCsv(accounts, NOW, new Set(['did:plc:b']));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'handle,did,display_name,profile_url,status,last_activity_at,last_activity_kind,inactive_days,quiet_since,never_posted,mutual,followers,following,posts,ghost_signals,allowlisted',
    );
    expect(lines[1]).toBe(
      'alice.test,did:plc:a,"Alice, ""A""",https://bsky.app/profile/alice.test,active,2026-10-09T00:00:00.000Z,post,10,,false,false,10,2,3,,false',
    );
    expect(lines[2]).toBe('bob.test,did:plc:b,,https://bsky.app/profile/bob.test,deactivated,,,,,false,,,,,,true');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
