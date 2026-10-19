/**
 * atproto OAuth for the logged-in owner. This module is loaded on demand,
 * so people who only browse never download it.
 */
import { BrowserOAuthClient, type OAuthSession } from '@atproto/oauth-client-browser';
import { PUBLIC_APPVIEW } from './bsky';
import { buildClientMetadata, isLoopbackHost, loopbackClientId } from './oauth-metadata';

export interface OAuthConfig {
  publicUrl: string;
  scope: string;
}

let clientPromise: Promise<BrowserOAuthClient> | undefined;

function createClient(config: OAuthConfig): Promise<BrowserOAuthClient> {
  const { hostname, origin, pathname } = window.location;
  if (isLoopbackHost(hostname)) {
    // Local development: the loopback client needs no hosted metadata.
    return BrowserOAuthClient.load({
      clientId: loopbackClientId(origin + pathname, config.scope),
      handleResolver: PUBLIC_APPVIEW,
      responseMode: 'fragment',
    });
  }
  return Promise.resolve(
    new BrowserOAuthClient({
      clientMetadata: buildClientMetadata(config.publicUrl, config.scope),
      handleResolver: PUBLIC_APPVIEW,
      responseMode: 'fragment',
    }),
  );
}

export function getClient(config: OAuthConfig): Promise<BrowserOAuthClient> {
  clientPromise ??= createClient(config);
  return clientPromise;
}

/** Restores the last session or completes a login redirect. */
export async function initSession(config: OAuthConfig): Promise<OAuthSession | undefined> {
  const client = await getClient(config);
  const result = await client.init();
  return result?.session;
}

/** Redirects to the user's PDS to log in; does not return on success. */
export async function signIn(config: OAuthConfig, handle: string): Promise<void> {
  const client = await getClient(config);
  await client.signInRedirect(handle);
}

export async function signOut(config: OAuthConfig, session: OAuthSession): Promise<void> {
  const client = await getClient(config);
  try {
    await session.signOut();
  } catch {
    await client.revoke(session.sub).catch(() => {});
  }
}

export type { OAuthSession };
