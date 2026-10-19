/**
 * Deriving "how quiet" an account is, plus ghost hints, sorting and
 * filtering for the results table.
 */
import type { Account } from './types';

const DAY = 86_400_000;

export function isNeverPosted(a: Account): boolean {
  if (a.status !== 'active') return false;
  if (a.lastActivity) return false;
  if (a.postsCount !== undefined) return a.postsCount === 0;
  return a.lastActivity === null && !a.quietSince;
}

/** True when the account can no longer post (gone, suspended, ...). */
export function isUnavailable(a: Account): boolean {
  return a.status !== 'active';
}

/**
 * Whole days since the last matching activity. `Infinity` for accounts with
 * nothing at all (never posted or unavailable). For partially read feeds
 * it is a lower bound based on `quietSince`. `undefined` when not checked.
 */
export function inactiveDays(a: Account, now: number): number | undefined {
  if (a.status !== 'active') return Infinity;
  if (a.lastActivity) return Math.max(0, Math.floor((now - Date.parse(a.lastActivity.at)) / DAY));
  if (a.quietSince) return Math.max(0, Math.floor((now - Date.parse(a.quietSince)) / DAY));
  if (a.lastActivity === null) return Infinity;
  return undefined;
}

// ---------------------------------------------------------------------------
// Ghost hints

export type GhostSignal = 'no-avatar' | 'no-name' | 'new-account' | 'no-posts' | 'no-followers';

export interface GhostOptions {
  /** Accounts younger than this many days count as "very new". */
  newAccountDays: number;
  /** How many signals make an account a likely ghost. */
  threshold: number;
}

export const DEFAULT_GHOST_OPTIONS: GhostOptions = { newAccountDays: 30, threshold: 3 };

export function ghostSignals(a: Account, now: number, opts: GhostOptions = DEFAULT_GHOST_OPTIONS): GhostSignal[] {
  if (a.status !== 'active') return [];
  const signals: GhostSignal[] = [];
  if (!a.avatar) signals.push('no-avatar');
  const name = (a.displayName ?? '').trim();
  const handleLocal = a.handle.split('.')[0] ?? a.handle;
  if (!name || name === a.handle || name === handleLocal) signals.push('no-name');
  if (a.createdAt) {
    const created = Date.parse(a.createdAt);
    if (!Number.isNaN(created) && now - created < opts.newAccountDays * DAY) signals.push('new-account');
  }
  if (a.postsCount === 0 || (a.postsCount === undefined && isNeverPosted(a))) signals.push('no-posts');
  if (a.followersCount !== undefined && a.followersCount <= 1) signals.push('no-followers');
  return signals;
}

export function isLikelyGhost(a: Account, now: number, opts: GhostOptions = DEFAULT_GHOST_OPTIONS): boolean {
  return ghostSignals(a, now, opts).length >= opts.threshold;
}

// ---------------------------------------------------------------------------
// Sorting

export type SortKey = 'inactivity' | 'name' | 'followers' | 'following' | 'posts';
export type SortDir = 'asc' | 'desc';

function compareNumbers(a: number | undefined, b: number | undefined): number {
  // Unknown values always sort last regardless of direction is handled by caller.
  return (a ?? -1) - (b ?? -1);
}

/**
 * Default order: most inactive first. Unchecked accounts go last; among
 * accounts with equal inactivity, unavailable ones come before "never
 * posted", then alphabetical by handle for a stable result.
 */
export function sortAccounts(list: readonly Account[], key: SortKey, dir: SortDir, now: number): Account[] {
  const sign = dir === 'asc' ? 1 : -1;
  const decorated = list.map((a) => ({ a, days: inactiveDays(a, now) }));
  decorated.sort((x, y) => {
    let c = 0;
    switch (key) {
      case 'inactivity': {
        const xd = x.days;
        const yd = y.days;
        if (xd === undefined && yd !== undefined) return 1;
        if (yd === undefined && xd !== undefined) return -1;
        if (xd !== undefined && yd !== undefined && xd !== yd) c = xd < yd ? -1 : 1;
        if (c === 0 && xd === Infinity) {
          c = Number(isUnavailable(x.a)) - Number(isUnavailable(y.a));
        }
        break;
      }
      case 'name':
        c = displayLabel(x.a).localeCompare(displayLabel(y.a));
        break;
      case 'followers':
        c = compareNumbers(x.a.followersCount, y.a.followersCount);
        break;
      case 'following':
        c = compareNumbers(x.a.followsCount, y.a.followsCount);
        break;
      case 'posts':
        c = compareNumbers(x.a.postsCount, y.a.postsCount);
        break;
    }
    if (c !== 0) return c * sign;
    return x.a.handle.localeCompare(y.a.handle);
  });
  return decorated.map((d) => d.a);
}

export function displayLabel(a: Account): string {
  return (a.displayName?.trim() || a.handle).toLocaleLowerCase();
}

// ---------------------------------------------------------------------------
// Filtering

export interface Filters {
  /** Only accounts inactive for more than this many days (0 = no limit). */
  minDays: number;
  onlyNonMutual: boolean;
  onlyNeverPosted: boolean;
  onlyGhosts: boolean;
  hideAllowlisted: boolean;
  search: string;
}

export const DEFAULT_FILTERS: Filters = {
  minDays: 90,
  onlyNonMutual: false,
  onlyNeverPosted: false,
  onlyGhosts: false,
  hideAllowlisted: false,
  search: '',
};

export function matchesSearch(a: Account, query: string): boolean {
  const q = query.trim().toLocaleLowerCase().replace(/^@/, '');
  if (!q) return true;
  return (
    a.handle.toLocaleLowerCase().includes(q) ||
    (a.displayName ?? '').toLocaleLowerCase().includes(q) ||
    a.did === q
  );
}

export function filterAccounts(
  list: readonly Account[],
  f: Filters,
  now: number,
  allowlist: ReadonlySet<string> = new Set(),
  ghost: GhostOptions = DEFAULT_GHOST_OPTIONS,
): Account[] {
  return list.filter((a) => {
    if (f.minDays > 0) {
      const days = inactiveDays(a, now);
      if (days === undefined || days <= f.minDays) return false;
    }
    if (f.onlyNonMutual && a.mutual !== false) return false;
    if (f.onlyNeverPosted && !isNeverPosted(a)) return false;
    if (f.onlyGhosts && !isLikelyGhost(a, now, ghost)) return false;
    if (f.hideAllowlisted && allowlist.has(a.did)) return false;
    return matchesSearch(a, f.search);
  });
}
