/**
 * One app, two names: each site host has its own name and opening language.
 * Any other host (a deploy preview, staging, loopback) opens in Portuguese
 * and takes the name of whichever language is showing.
 */
import type { Locale } from './i18n';

export type SiteName = 'sumidos' | 'crickets';

export const PRIMARY_HOST = 'sumidos.notx.blue';
export const ENGLISH_HOST = 'crickets.notx.blue';

const SITES: Record<string, { name: SiteName; locale: Locale }> = {
  [PRIMARY_HOST]: { name: 'sumidos', locale: 'pt-BR' },
  [ENGLISH_HOST]: { name: 'crickets', locale: 'en' },
};

export const SITE_HOSTS: readonly string[] = Object.keys(SITES);

const NAME_FOR_LOCALE: Record<Locale, SiteName> = { 'pt-BR': 'sumidos', en: 'crickets' };

function site(hostname: string) {
  return SITES[hostname.toLowerCase()];
}

export function localeForHost(hostname: string): Locale {
  return site(hostname)?.locale ?? 'pt-BR';
}

export function siteNameFor(hostname: string, locale: Locale): SiteName {
  return site(hostname)?.name ?? NAME_FOR_LOCALE[locale];
}
