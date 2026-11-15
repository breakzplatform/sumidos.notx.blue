import { describe, expect, it } from 'vitest';
import { I18n, LOCALES, format } from '../src/lib/i18n';

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
    expect(t('span.days', { count: 1 })).toBe('1 dia');
    expect(t('span.days', { count: 2000 })).toBe('2.000 dias');
    expect(t('span.months', { count: 1 })).toBe('1 mês');
  });

  it('agrees in number, zero included', () => {
    const pt = new I18n('pt-BR').t;
    const en = new I18n('en').t;
    expect(pt('owner.unfollow', { count: 0 })).toBe('Deixar de seguir');
    expect(pt('owner.unfollow', { count: 1 })).toBe('Deixar de seguir 1 conta');
    expect(pt('owner.unfollow', { count: 3 })).toBe('Deixar de seguir 3 contas');
    expect(en('owner.unfollow', { count: 0 })).toBe('Unfollow');
    expect(en('owner.unfollow', { count: 1 })).toBe('Unfollow 1 account');
    expect(pt('confirm.title', { count: 1 })).toBe('Deixar de seguir 1 conta?');
    expect(pt('undo.text', { count: 2 })).toBe('Você deixou de seguir 2 contas.');
    expect(pt('results.meta', { shown: 1, count: 1 })).toBe('1 de 1 conta no filtro');
    expect(pt('results.meta', { shown: 0, count: 0 })).toBe('0 de 0 contas no filtro');
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
