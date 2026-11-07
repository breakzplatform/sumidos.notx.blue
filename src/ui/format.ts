/** Text for a results row: the badge and the line under the name. */
import type { I18n } from '../lib/i18n';
import type { Row } from '../lib/inactivity';

export type Tone = 'gone' | 'empty' | 'quiet';

export interface RowText {
  badge: string;
  when: string;
  tone: Tone;
}

/** Days as the largest whole unit that reads naturally. */
export function spanText(days: number, i18n: I18n): string {
  if (days >= 730) return i18n.t('span.years', { count: Math.floor(days / 365) });
  if (days >= 60) return i18n.t('span.months', { count: Math.floor(days / 30) });
  return i18n.t('span.days', { count: days });
}

export function rowText({ account, standing, days }: Row, i18n: I18n): RowText {
  const t = i18n.t;
  switch (standing.kind) {
    case 'unavailable': {
      const status = account.status === 'takendown' ? 'takendown' : account.status === 'notfound' ? 'notfound' : 'deactivated';
      return { badge: t(`badge.${status}`), when: t(`when.${status}`), tone: 'gone' };
    }
    case 'never':
      return { badge: t('badge.never'), when: t('when.never'), tone: 'empty' };
    case 'atLeast':
      return {
        badge: t('badge.quietAtLeast', { span: spanText(days ?? 0, i18n) }),
        when: t('when.atLeast', { date: i18n.date(standing.since) }),
        tone: 'quiet',
      };
    case 'at':
      return {
        badge: t('badge.quiet', { span: spanText(days ?? 0, i18n) }),
        when: t('when.at', { date: i18n.date(standing.at) }),
        tone: 'quiet',
      };
    default:
      return { badge: '', when: '', tone: 'quiet' };
  }
}
