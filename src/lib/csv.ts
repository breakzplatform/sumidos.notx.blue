/**
 * CSV export of the current table view (RFC 4180, CRLF line endings).
 */
import type { Row } from './inactivity';
import type { Account } from './types';

const HEADER = ['handle', 'did', 'display_name', 'profile_url', 'status', 'last_activity_at', 'inactive_days', 'at_least', 'never_posted'] as const;

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

/** The rows as shown: same filter, same order. */
export function rowsToCsv(rows: readonly Row[]): string {
  const lines = [HEADER.join(',')];
  for (const { account: a, standing: s, days } of rows) {
    lines.push(
      [
        a.handle,
        a.did,
        a.displayName ?? '',
        profileUrl(a),
        a.status,
        s.kind === 'at' ? s.at : '',
        days === undefined || days === Infinity ? '' : days,
        s.kind === 'atLeast',
        s.kind === 'never',
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
