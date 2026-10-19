/**
 * CSV export of the current table view (RFC 4180, CRLF line endings).
 */
import { ghostSignals, inactiveDays, isNeverPosted } from './inactivity';
import type { Account } from './types';

const HEADER = [
  'handle',
  'did',
  'display_name',
  'profile_url',
  'status',
  'last_activity_at',
  'last_activity_kind',
  'inactive_days',
  'quiet_since',
  'never_posted',
  'mutual',
  'followers',
  'following',
  'posts',
  'ghost_signals',
  'allowlisted',
] as const;

/**
 * Quotes a field when needed. Fields that a spreadsheet would run as a
 * formula (leading = + - @, tab, CR) get a leading apostrophe.
 */
export function csvField(value: unknown): string {
  if (value === undefined || value === null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function profileUrl(a: Pick<Account, 'did' | 'handle'>): string {
  const id = a.handle && a.handle !== 'handle.invalid' ? a.handle : a.did;
  return `https://bsky.app/profile/${encodeURIComponent(id)}`;
}

export function accountsToCsv(
  accounts: readonly Account[],
  now: number,
  allowlist: ReadonlySet<string> = new Set(),
): string {
  const rows = [HEADER.join(',')];
  for (const a of accounts) {
    const days = inactiveDays(a, now);
    rows.push(
      [
        a.handle,
        a.did,
        a.displayName ?? '',
        profileUrl(a),
        a.status,
        a.lastActivity?.at ?? '',
        a.lastActivity?.kind ?? '',
        days === undefined || days === Infinity ? '' : days,
        a.quietSince ?? '',
        isNeverPosted(a),
        a.mutual === undefined ? '' : a.mutual,
        a.followersCount ?? '',
        a.followsCount ?? '',
        a.postsCount ?? '',
        ghostSignals(a, now).join(' '),
        allowlist.has(a.did),
      ]
        .map(csvField)
        .join(','),
    );
  }
  return rows.join('\r\n') + '\r\n';
}
