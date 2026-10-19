/**
 * Text and badges for one account row. Pure functions of the account and a
 * translate function, so they are easy to reuse and test.
 */
import { ghostSignals, inactiveDays, isLikelyGhost, isNeverPosted } from '../lib/inactivity';
import type { Account } from '../lib/types';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface ActivityText {
  primary: string;
  secondary?: string;
  /** Tooltip explaining an estimate. */
  note?: string;
}

export function activityText(a: Account, now: number, t: Translate, formatDate: (iso: string) => string): ActivityText {
  if (a.status !== 'active') return { primary: t(`badge.${a.status}`) };
  if (a.lastActivity) {
    const days = inactiveDays(a, now) ?? 0;
    return {
      primary: days === 0 ? t('activity.today') : t('days_ago', { count: days }),
      secondary: `${formatDate(a.lastActivity.at)} · ${t(`activity.kind.${a.lastActivity.kind}`)}`,
    };
  }
  if (a.quietSince) {
    return {
      primary: t('activity.quietSince', { count: inactiveDays(a, now) ?? 0 }),
      secondary: t('activity.estimate'),
      note: t('activity.estimateHint'),
    };
  }
  if (a.lastActivity === null) {
    return { primary: isNeverPosted(a) ? t('activity.never') : t('activity.noneMatching') };
  }
  return { primary: t('activity.unchecked') };
}

export interface Badge {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral';
  title?: string;
}

export function badgesFor(a: Account, now: number, t: Translate, kept: boolean): Badge[] {
  const out: Badge[] = [];
  if (a.status !== 'active') {
    out.push({ label: t(`badge.${a.status}`), tone: 'bad', ...(a.errorMessage ? { title: a.errorMessage } : {}) });
  }
  if (a.mutual === true) out.push({ label: t('badge.mutual'), tone: 'good' });
  else if (a.mutual === false) out.push({ label: t('badge.notMutual'), tone: 'neutral' });
  if (isNeverPosted(a)) out.push({ label: t('badge.never'), tone: 'warn' });
  if (isLikelyGhost(a, now)) {
    const signals = ghostSignals(a, now).map((s) => t(`ghost.${s}`));
    out.push({ label: t('badge.ghost'), tone: 'warn', title: signals.join(', ') });
  }
  if (a.status === 'active' && a.errorMessage) out.push({ label: t('badge.error'), tone: 'bad', title: a.errorMessage });
  if (kept) out.push({ label: t('badge.kept'), tone: 'info' });
  return out;
}
