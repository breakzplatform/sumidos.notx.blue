/**
 * Builds the OAuth client metadata document. Used at build time to write
 * client-metadata.json and at runtime to configure the OAuth client, so the
 * two can't drift apart.
 */

export const DEFAULT_PUBLIC_URL = 'https://quiet.notx.blue/';

/**
 * Only what the app needs: the `atproto` base scope plus permission to
 * delete follow records.
 */
export const DEFAULT_OAUTH_SCOPE = 'atproto repo:app.bsky.graph.follow?action=delete';

/** Normalizes the public URL: https (or http for loopback), trailing slash. */
export function normalizePublicUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
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

export function buildClientMetadata(publicUrl: string, scope: string = DEFAULT_OAUTH_SCOPE): ClientMetadata {
  const base = normalizePublicUrl(publicUrl);
  return {
    client_id: `${base}client-metadata.json`,
    client_name: 'quiet.notx.blue',
    client_uri: base,
    redirect_uris: [base],
    scope,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  };
}

/** Loopback client id for local development (no metadata document needed). */
export function loopbackClientId(redirectUri: string, scope: string = DEFAULT_OAUTH_SCOPE): string {
  return `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
}
