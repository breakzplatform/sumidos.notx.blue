/**
 * OAuth client metadata, one client per origin. The same static build is
 * served on every host below; each host gets its own metadata document whose
 * client_id is that document's own URL, so a session started on one host is
 * never presented by another. Hosts outside the allowlist get no login.
 *
 * Used at build time to write the documents and at runtime to configure the
 * client, so the two can't drift apart.
 */

export const PRIMARY_HOST = 'sumidos.notx.blue';
/** English alias of the same site. */
export const ALIAS_HOST = 'quiet.notx.blue';
export const SITE_HOSTS: readonly string[] = [PRIMARY_HOST, ALIAS_HOST];

/** The `atproto` base scope plus deleting follows and writing them back (undo). */
export const OAUTH_SCOPE = 'atproto repo:app.bsky.graph.follow?action=create&action=delete';

/** Parses a comma-separated host list, e.g. from VITE_OAUTH_EXTRA_HOSTS. */
export function parseHostList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+$/.test(h));
}

export function allowedHosts(extra: readonly string[] = []): string[] {
  return [...new Set([...SITE_HOSTS, ...extra])];
}

export function metadataPath(host: string): string {
  return `oauth/${host}.json`;
}

export interface ClientMetadata {
  client_id: string;
  client_name: string;
  client_uri: string;
  redirect_uris: [string, ...string[]];
  scope: string;
  grant_types: ['authorization_code', 'refresh_token'];
  response_types: ['code'];
  token_endpoint_auth_method: 'none';
  application_type: 'web';
  dpop_bound_access_tokens: true;
}

export function buildClientMetadata(host: string, scope: string = OAUTH_SCOPE): ClientMetadata {
  const origin = `https://${host}`;
  return {
    client_id: `${origin}/${metadataPath(host)}`,
    client_name: host,
    client_uri: `${origin}/`,
    redirect_uris: [`${origin}/`],
    scope,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  };
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
}

/** Loopback client id for local development (no metadata document needed). */
export function loopbackClientId(redirectUri: string, scope: string = OAUTH_SCOPE): string {
  return `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
}

export type OAuthTarget = { kind: 'hosted'; host: string } | { kind: 'loopback'; redirectUri: string } | { kind: 'none' };

/**
 * Which OAuth client this page may use. Only https pages on an allowed host
 * (exact match, default port) and loopback pages get one.
 */
export function oauthTarget(location: Pick<Location, 'protocol' | 'host' | 'hostname' | 'origin'>, allowed: readonly string[]): OAuthTarget {
  if (isLoopbackHost(location.hostname)) {
    return { kind: 'loopback', redirectUri: `${location.origin.replace('//localhost', '//127.0.0.1')}/` };
  }
  const host = location.host.toLowerCase();
  if (location.protocol === 'https:' && allowed.includes(host)) return { kind: 'hosted', host };
  return { kind: 'none' };
}
