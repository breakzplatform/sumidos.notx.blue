import { describe, expect, it } from 'vitest';
import { localeForHost, siteHostForLocale, siteNameFor } from '../src/lib/site';

describe('localeForHost', () => {
  it('opens each site host in its own language', () => {
    expect(localeForHost('crickets.notx.blue')).toBe('en');
    expect(localeForHost('CRICKETS.notx.blue')).toBe('en');
    expect(localeForHost('sumidos.notx.blue')).toBe('pt-BR');
  });

  it('opens any other host in Portuguese', () => {
    expect(localeForHost('127.0.0.1')).toBe('pt-BR');
    expect(localeForHost('staging.joselito.dev')).toBe('pt-BR');
    expect(localeForHost('crickets.notx.blue.evil.example')).toBe('pt-BR');
  });
});

describe('siteNameFor', () => {
  it('keeps the host name whatever the language', () => {
    expect(siteNameFor('sumidos.notx.blue', 'en')).toBe('sumidos');
    expect(siteNameFor('crickets.notx.blue', 'pt-BR')).toBe('crickets');
  });

  it('names other hosts after the language showing', () => {
    expect(siteNameFor('redesign--sumidos-notx-blue.netlify.app', 'pt-BR')).toBe('sumidos');
    expect(siteNameFor('redesign--sumidos-notx-blue.netlify.app', 'en')).toBe('crickets');
  });
});

describe('siteHostForLocale', () => {
  it('points each site host to the site of the other language', () => {
    expect(siteHostForLocale('sumidos.notx.blue', 'en')).toBe('crickets.notx.blue');
    expect(siteHostForLocale('CRICKETS.notx.blue', 'pt-BR')).toBe('sumidos.notx.blue');
  });

  it('has no site to move to from other hosts', () => {
    expect(siteHostForLocale('127.0.0.1', 'en')).toBeUndefined();
    expect(siteHostForLocale('redesign--sumidos-notx-blue.netlify.app', 'en')).toBeUndefined();
  });
});
