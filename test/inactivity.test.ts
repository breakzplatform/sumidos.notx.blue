import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  filterAccounts,
  ghostSignals,
  inactiveDays,
  isLikelyGhost,
  isNeverPosted,
  sortAccounts,
} from '../src/lib/inactivity';
import type { Account } from '../src/lib/types';
import { DAY } from './helpers';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function acct(handle: string, extra: Partial<Account> = {}): Account {
  return {
    did: `did:plc:${handle}`,
    handle: `${handle}.test`,
    displayName: handle.toUpperCase(),
    avatar: 'https://cdn.example/a.jpg',
    status: 'active',
    postsCount: 10,
    followersCount: 50,
    followsCount: 20,
    createdAt: ago(1000),
    mutual: true,
    ...extra,
  };
}

const active = acct('active', { lastActivity: { at: ago(2), kind: 'post', uri: 'at://x' } });
const quiet = acct('quiet', { lastActivity: { at: ago(200), kind: 'post', uri: 'at://x' }, mutual: false });
const lowerBound = acct('lower', { lastActivity: null, quietSince: ago(120), approximate: true });
const never = acct('never', { lastActivity: null, postsCount: 0 });
const gone = acct('gone', { status: 'deactivated' });
const unchecked = acct('unchecked');

describe('inactiveDays', () => {
  it('counts whole days since the last activity', () => {
    expect(inactiveDays(active, NOW)).toBe(2);
    expect(inactiveDays(quiet, NOW)).toBe(200);
  });
  it('uses quietSince as a lower bound', () => {
    expect(inactiveDays(lowerBound, NOW)).toBe(120);
  });
  it('is Infinity for never posted and unavailable accounts', () => {
    expect(inactiveDays(never, NOW)).toBe(Infinity);
    expect(inactiveDays(gone, NOW)).toBe(Infinity);
  });
  it('is undefined when not checked yet', () => {
    expect(inactiveDays(unchecked, NOW)).toBeUndefined();
  });
});

describe('isNeverPosted', () => {
  it('trusts postsCount = 0', () => {
    expect(isNeverPosted(never)).toBe(true);
    expect(isNeverPosted(quiet)).toBe(false);
    expect(isNeverPosted(gone)).toBe(false);
  });
  it('without counts, needs an empty feed', () => {
    expect(isNeverPosted(acct('x', { postsCount: undefined, lastActivity: null }))).toBe(true);
    expect(isNeverPosted(acct('y', { postsCount: undefined, lastActivity: null, quietSince: ago(3) }))).toBe(false);
  });
});

describe('sortAccounts', () => {
  const list = [active, unchecked, quiet, never, lowerBound, gone];

  it('puts the most inactive first and unchecked last', () => {
    const order = sortAccounts(list, 'inactivity', 'desc', NOW).map((a) => a.handle);
    expect(order).toEqual(['gone.test', 'never.test', 'quiet.test', 'lower.test', 'active.test', 'unchecked.test']);
  });

  it('ascending keeps unchecked last too', () => {
    const order = sortAccounts(list, 'inactivity', 'asc', NOW).map((a) => a.handle);
    expect(order[0]).toBe('active.test');
    expect(order.at(-1)).toBe('unchecked.test');
  });

  it('sorts by name and by counts', () => {
    const byName = sortAccounts([quiet, active, never], 'name', 'asc', NOW).map((a) => a.handle);
    expect(byName).toEqual(['active.test', 'never.test', 'quiet.test']);
    const a = acct('a', { followersCount: 5 });
    const b = acct('b', { followersCount: 500 });
    expect(sortAccounts([a, b], 'followers', 'desc', NOW)[0]).toBe(b);
  });
});

describe('filterAccounts', () => {
  const list = [active, quiet, never, lowerBound, gone, unchecked];
  const f = { ...DEFAULT_FILTERS, minDays: 0 };

  it('filters by minimum inactivity (strictly more than N days)', () => {
    const r = filterAccounts(list, { ...f, minDays: 120 }, NOW).map((a) => a.handle);
    expect(r).toEqual(['quiet.test', 'never.test', 'gone.test']);
    expect(filterAccounts(list, { ...f, minDays: 119 }, NOW)).toContain(lowerBound);
  });

  it('only non-mutuals (unknown mutual state is excluded)', () => {
    expect(filterAccounts(list, { ...f, onlyNonMutual: true }, NOW)).toEqual([quiet]);
  });

  it('only never posted', () => {
    expect(filterAccounts(list, { ...f, onlyNeverPosted: true }, NOW)).toEqual([never]);
  });

  it('search matches handle, display name and DID', () => {
    expect(filterAccounts(list, { ...f, search: '@QUIET' }, NOW)).toEqual([quiet]);
    expect(filterAccounts(list, { ...f, search: 'NEVER' }, NOW)).toEqual([never]);
    expect(filterAccounts(list, { ...f, search: 'did:plc:gone' }, NOW)).toEqual([gone]);
  });

  it('can hide allowlisted accounts', () => {
    const r = filterAccounts(list, { ...f, hideAllowlisted: true }, NOW, new Set([quiet.did]));
    expect(r).not.toContain(quiet);
  });
});

describe('ghost heuristics', () => {
  it('a normal account has no signals', () => {
    expect(ghostSignals(quiet, NOW)).toEqual([]);
  });

  it('collects the simple signals', () => {
    const ghost = acct('ghost', {
      avatar: undefined,
      displayName: '',
      createdAt: ago(5),
      postsCount: 0,
      followersCount: 0,
    });
    expect(ghostSignals(ghost, NOW)).toEqual(['no-avatar', 'no-name', 'new-account', 'no-posts', 'no-followers']);
    expect(isLikelyGhost(ghost, NOW)).toBe(true);
  });

  it('treats a display name equal to the handle as empty', () => {
    expect(ghostSignals(acct('x', { displayName: 'x.test' }), NOW)).toContain('no-name');
    expect(ghostSignals(acct('x', { displayName: 'x' }), NOW)).toContain('no-name');
  });

  it('needs enough signals', () => {
    const twoSignals = acct('half', { avatar: undefined, displayName: undefined });
    expect(isLikelyGhost(twoSignals, NOW)).toBe(false);
    expect(isLikelyGhost(twoSignals, NOW, { newAccountDays: 30, threshold: 2 })).toBe(true);
  });

  it('does not flag unavailable accounts', () => {
    expect(ghostSignals(acct('z', { status: 'takendown', avatar: undefined }), NOW)).toEqual([]);
  });
});
