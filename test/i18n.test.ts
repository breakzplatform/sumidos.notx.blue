import { describe, expect, it } from 'vitest';
import { I18n, LOCALES, format, pickLocale } from '../src/lib/i18n';

describe('pickLocale', () => {
  it('maps browser languages to supported locales', () => {
    expect(pickLocale(['pt-BR', 'en'])).toBe('pt-BR');
    expect(pickLocale(['pt-PT'])).toBe('pt-BR');
    expect(pickLocale(['fr-FR', 'en-GB'])).toBe('en');
    expect(pickLocale(['de'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });
});

describe('format', () => {
  const msgs = { hi: 'Hi {name}', days: { one: '{count} day', other: '{count} days' } };

  it('interpolates and pluralizes', () => {
    expect(format(msgs, {}, 'en', 'hi', { name: 'Ana' })).toBe('Hi Ana');
    expect(format(msgs, {}, 'en', 'days', { count: 1 })).toBe('1 day');
    expect(format(msgs, {}, 'en', 'days', { count: 1200 })).toBe('1,200 days');
  });

  it('falls back to the fallback table, then the key', () => {
    expect(format({}, msgs, 'pt-BR', 'hi', { name: 'Ana' })).toBe('Hi Ana');
    expect(format({}, {}, 'en', 'missing.key')).toBe('missing.key');
  });

  it('uses Portuguese plural rules and number format', () => {
    const t = new I18n('pt-BR').t;
    expect(t('days_ago', { count: 1 })).toBe('há 1 dia');
    expect(t('days_ago', { count: 2000 })).toBe('há 2.000 dias');
  });
});

describe('locale tables', () => {
  it('Portuguese has every English key', () => {
    const en = Object.keys(LOCALES.en.messages);
    const pt = new Set(Object.keys(LOCALES['pt-BR'].messages));
    expect(en.filter((k) => !pt.has(k))).toEqual([]);
  });

  it('placeholders match between languages', () => {
    const vars = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(LOCALES.en.messages)) {
      const pt = LOCALES['pt-BR'].messages[key];
      expect([key, [...new Set(vars(pt))]]).toEqual([key, [...new Set(vars(value))]]);
    }
  });
});
