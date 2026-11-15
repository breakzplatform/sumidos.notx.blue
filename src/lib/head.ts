/**
 * The <head> text each site host is shared with: title, description and the
 * Open Graph / Twitter tags. Crawlers don't run the app, so the build writes
 * these into one HTML file per host; the page refreshes the language-bound
 * ones when the language changes.
 */
import { format, LOCALES, type Locale } from './i18n';
import { en } from '../locales/en';
import { localeForHost, siteNameFor } from './site';

export interface HeadText {
  title: string;
  description: string;
  siteName: string;
  /** Open Graph form, e.g. "pt_BR". */
  ogLocale: string;
}

export function headText(host: string, locale: Locale): HeadText {
  const siteName = `${siteNameFor(host, locale)}.notx.blue`;
  const messages = LOCALES[locale].messages;
  return {
    title: format(messages, en, locale, 'appTitle', { host: siteName }),
    description: format(messages, en, locale, 'description'),
    siteName,
    ogLocale: locale.replace('-', '_'),
  };
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The tags for a site host, as served from that host's root. */
export function headTags(host: string): string {
  const head = headText(host, localeForHost(host));
  const url = `https://${host}/`;
  const meta = (attr: 'name' | 'property', key: string, content: string) =>
    `<meta ${attr}="${key}" content="${escape(content)}" />`;
  return [
    `<title>${escape(head.title)}</title>`,
    meta('name', 'description', head.description),
    `<link rel="canonical" href="${url}" />`,
    meta('property', 'og:title', head.title),
    meta('property', 'og:description', head.description),
    meta('property', 'og:url', url),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', head.siteName),
    meta('property', 'og:locale', head.ogLocale),
    meta('name', 'twitter:card', 'summary'),
    meta('name', 'twitter:title', head.title),
    meta('name', 'twitter:description', head.description),
  ].join('\n    ');
}
