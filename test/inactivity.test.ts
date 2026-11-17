import { describe, expect, it } from 'vitest';
import { DEFAULT_COUNT_RULES } from '../src/lib/activity';
import {
  DEFAULT_MIN_DAYS,
  INVALID_HANDLE,
  inactiveDays,
  isKind,
  isMaxDays,
  isMinDays,
  matchesSearch,
  standing,
  visibleRows,
  type Kind,
} from '../src/lib/inactivity';
import type { Account } from '../src/lib/types';
import { DAY } from './helpers';

const NOW = Date.parse('2026-11-06T00:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

function account(handle: string, extra: Partial<Account> = {}): Account {
  return { did: `did:plc:${handle}`, handle, status: 'active', ...extra };
}

const rules = DEFAULT_COUNT_RULES;

describe('standing and inactiveDays', () => {
  it('is pending until the feed is read', () => {
    expect(standing(account('a'), rules)).toEqual({ kind: 'pending' });
    expect(inactiveDays({ kind: 'pending' }, NOW)).toBeUndefined();
  });

  it('treats accounts that cannot post as quiet forever', () => {
    const s = standing(account('a', { status: 'deactivated' }), rules);
    expect(s).toEqual({ kind: 'unavailable' });
    expect(inactiveDays(s, NOW)).toBe(Infinity);
  });

  it('counts whole days since the last activity that counts', () => {
    const s = standing(account('a', { feed: { lastPost: ago(100), lastReply: ago(10), complete: true } }), rules);
    expect(inactiveDays(s, NOW)).toBe(10);
    const strict = standing(account('a', { feed: { lastPost: ago(100), lastReply: ago(10), complete: true } }), {
      replies: false,
      reposts: false,
    });
    expect(inactiveDays(strict, NOW)).toBe(100);
  });
});

describe('visibleRows', () => {
  const accounts = [
    account('recent', { feed: { lastPost: ago(5), complete: true } }),
    account('quiet', { feed: { lastPost: ago(200), complete: true } }),
    account('quieter', { feed: { lastPost: ago(400), complete: true } }),
    account('never', { feed: { complete: true } }),
    account('gone', { status: 'deactivated' }),
    account('pending'),
    account('broken', { status: 'error' }),
    account('replier', { feed: { lastPost: ago(300), lastReply: ago(2), complete: true } }),
  ];

  it('defaults to 90 days', () => {
    expect(DEFAULT_MIN_DAYS).toBe(90);
  });

  it('orders unavailable, never posted, then most days', () => {
    const rows = visibleRows(accounts, { rules, minDays: 90, maxDays: null, kind: 'all', search: '' }, NOW);
    expect(rows.map((r) => r.account.handle)).toEqual(['gone', 'never', 'quieter', 'quiet']);
  });

  it('re-filters when the rules change, without new data', () => {
    const rows = visibleRows(accounts, { rules: { replies: false, reposts: false }, minDays: 90, maxDays: null, kind: 'all', search: '' }, NOW);
    expect(rows.map((r) => r.account.handle)).toContain('replier');
  });

  it('applies the threshold', () => {
    const rows = visibleRows(accounts, { rules, minDays: 365, maxDays: null, kind: 'all', search: '' }, NOW);
    expect(rows.map((r) => r.account.handle)).toEqual(['gone', 'never', 'quieter']);
  });

  it('applies an upper limit, leaving out accounts with no date', () => {
    const rows = visibleRows(accounts, { rules, minDays: 90, maxDays: 365, kind: 'all', search: '' }, NOW);
    expect(rows.map((r) => r.account.handle)).toEqual(['quiet']);
  });

  it('filters by kind', () => {
    const list = [...accounts, account(INVALID_HANDLE, { did: 'did:plc:invalid', feed: { lastPost: ago(120), complete: true } })];
    const pick = (kind: Kind) =>
      visibleRows(list, { rules, minDays: 90, maxDays: null, kind, search: '' }, NOW).map((r) => r.account.handle);
    expect(pick('unavailable')).toEqual(['gone']);
    expect(pick('quiet')).toEqual(['never', 'quieter', 'quiet', INVALID_HANDLE]);
    expect(pick('invalidHandle')).toEqual([INVALID_HANDLE]);
  });

  it('only accepts the offered upper limits and kinds', () => {
    expect(isMaxDays('365')).toBe(true);
    expect(isMaxDays('')).toBe(false);
    expect(isMaxDays('90')).toBe(false);
    expect(isKind('unavailable')).toBe(true);
    expect(isKind('other')).toBe(false);
  });

  it('searches by name or handle', () => {
    expect(matchesSearch(account('quiet.test', { displayName: 'Maria' }), '@quiet')).toBe(true);
    expect(matchesSearch(account('x.test', { displayName: 'Maria' }), 'mar')).toBe(true);
    expect(matchesSearch(account('x.test'), 'zzz')).toBe(false);
  });

  it('only accepts the offered thresholds', () => {
    expect(isMinDays('180')).toBe(true);
    expect(isMinDays('0')).toBe(false);
    expect(isMinDays(null)).toBe(false);
  });
});
