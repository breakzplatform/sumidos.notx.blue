/**
 * How quiet an account is under the current rules, plus the order and the
 * filter of the results list. Everything here is pure: changing a rule or
 * the threshold re-runs these functions, never a request.
 */
import { lastActivity, type ActivityAnswer, type CountRules } from './activity';
import type { Account } from './types';

const DAY = 86_400_000;

export const MIN_DAYS_OPTIONS = [30, 90, 180, 365] as const;
export type MinDays = (typeof MIN_DAYS_OPTIONS)[number];
export const DEFAULT_MIN_DAYS: MinDays = 90;

export function isMinDays(value: unknown): value is MinDays {
  return MIN_DAYS_OPTIONS.includes(Number(value) as MinDays);
}

export const MAX_DAYS_OPTIONS = [180, 365, 730, 1095] as const;
export type MaxDays = (typeof MAX_DAYS_OPTIONS)[number];

export function isMaxDays(value: unknown): value is MaxDays {
  return value !== '' && value !== null && MAX_DAYS_OPTIONS.includes(Number(value) as MaxDays);
}

/**
 * Which accounts the list shows:
 * - `all`: everything past the threshold;
 * - `quiet`: accounts that still exist and just stopped posting;
 * - `unavailable`: deactivated, suspended or gone;
 * - `invalidHandle`: the handle no longer resolves to the account.
 */
export const KINDS = ['all', 'quiet', 'unavailable', 'invalidHandle'] as const;
export type Kind = (typeof KINDS)[number];

export function isKind(value: unknown): value is Kind {
  return KINDS.includes(value as Kind);
}

/** What the AppView shows in place of a handle that fails verification. */
export const INVALID_HANDLE = 'handle.invalid';

function matchesKind(a: Account, s: Standing, kind: Kind): boolean {
  switch (kind) {
    case 'all':
      return true;
    case 'quiet':
      return s.kind !== 'unavailable';
    case 'unavailable':
      return s.kind === 'unavailable';
    case 'invalidHandle':
      return a.handle === INVALID_HANDLE;
  }
}

/**
 * Where an account stands:
 * - `pending`: its feed was not read yet;
 * - `unavailable`: deactivated, suspended or gone, it can't post;
 * - `error`: the feed could not be read;
 * - otherwise the feed answer from `lastActivity`.
 */
export type Standing =
  | { kind: 'pending' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | ActivityAnswer;

export function standing(a: Account, rules: CountRules): Standing {
  if (a.status === 'error') return { kind: 'error' };
  if (a.status !== 'active') return { kind: 'unavailable' };
  if (!a.feed) return { kind: 'pending' };
  return lastActivity(a.feed, rules);
}

function wholeDays(now: number, iso: string): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}

/**
 * Whole days without activity that counts. `Infinity` when there is none
 * at all; a lower bound for `atLeast`; `undefined` while unknown.
 */
export function inactiveDays(s: Standing, now: number): number | undefined {
  switch (s.kind) {
    case 'at':
      return wholeDays(now, s.at);
    case 'atLeast':
      return wholeDays(now, s.since);
    case 'never':
    case 'unavailable':
      return Infinity;
    default:
      return undefined;
  }
}

export interface Filters {
  rules: CountRules;
  /** Only accounts quiet for more than this many days. */
  minDays: MinDays;
  /**
   * And at most this many, or no limit. A limit leaves out accounts with no
   * date to compare: never posted, or unavailable.
   */
  maxDays: MaxDays | null;
  kind: Kind;
  search: string;
}

export function matchesSearch(a: Account, query: string): boolean {
  const q = query.trim().toLocaleLowerCase().replace(/^@/, '');
  if (!q) return true;
  return a.handle.toLocaleLowerCase().includes(q) || (a.displayName ?? '').toLocaleLowerCase().includes(q) || a.did === q;
}

export interface Row {
  account: Account;
  standing: Standing;
  days: number | undefined;
}

/** Order: can't post, never posted, then most days first; ties by handle. */
function rank(row: Row): number {
  if (row.standing.kind === 'unavailable') return 0;
  if (row.standing.kind === 'never') return 1;
  return 2;
}

export function compareRows(x: Row, y: Row): number {
  const r = rank(x) - rank(y);
  if (r !== 0) return r;
  const xd = x.days ?? -1;
  const yd = y.days ?? -1;
  if (xd !== yd) return yd - xd;
  return x.account.handle.localeCompare(y.account.handle);
}

/**
 * The accounts that pass the filter, in display order. Accounts not read
 * yet and accounts whose feed failed are left out: they have no answer.
 */
export function visibleRows(accounts: readonly Account[], f: Filters, now: number): Row[] {
  const rows: Row[] = [];
  for (const account of accounts) {
    const s = standing(account, f.rules);
    const days = inactiveDays(s, now);
    if (days === undefined || days <= f.minDays) continue;
    if (f.maxDays !== null && days > f.maxDays) continue;
    if (!matchesKind(account, s, f.kind)) continue;
    if (!matchesSearch(account, f.search)) continue;
    rows.push({ account, standing: s, days });
  }
  return rows.sort(compareRows);
}
