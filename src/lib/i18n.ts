/**
 * Tiny i18n: flat message tables, {placeholder} interpolation and plural
 * forms through Intl.PluralRules.
 */
import { en } from '../locales/en';
import { ptBR } from '../locales/pt-BR';

export type Messages = Record<string, string | Partial<Record<Intl.LDMLPluralRule, string>>>;
export type Locale = 'en' | 'pt-BR';

export const LOCALES: Record<Locale, { label: string; messages: Messages }> = {
  en: { label: 'English', messages: en },
  'pt-BR': { label: 'Português (Brasil)', messages: ptBR },
};

/** Best supported locale for a list of browser languages. */
export function pickLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const lower = lang.toLowerCase();
    if (lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

export type Params = Record<string, string | number>;

export function format(messages: Messages, fallback: Messages, locale: Locale, key: string, params: Params = {}): string {
  const entry = messages[key] ?? fallback[key];
  if (entry === undefined) return key;
  let template: string;
  if (typeof entry === 'string') {
    template = entry;
  } else {
    const count = Number(params.count ?? 0);
    const rule = new Intl.PluralRules(locale).select(count);
    template = entry[rule] ?? entry.other ?? key;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? value.toLocaleString(locale) : value;
  });
}

export class I18n {
  private listeners = new Set<() => void>();
  constructor(public locale: Locale) {}

  t = (key: string, params?: Params): string =>
    format(LOCALES[this.locale].messages, en, this.locale, key, params);

  setLocale(locale: Locale): void {
    this.locale = locale;
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  number(n: number): string {
    return n.toLocaleString(this.locale);
  }

  date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' }).format(new Date(iso));
  }

  dateTime(ms: number): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
  }
}

/** Fills elements carrying data-i18n / data-i18n-* attributes. */
export function applyTranslations(root: ParentNode, t: (key: string) => string): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n!);
  }
  for (const attr of ['placeholder', 'title', 'aria-label'] as const) {
    const dataKey = `i18n${attr.replace(/(^|-)(\w)/g, (_, _d, c: string) => c.toUpperCase())}`;
    for (const el of root.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.dataset[dataKey]!));
    }
  }
}
