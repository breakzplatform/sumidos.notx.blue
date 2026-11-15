/**
 * atproto OAuth for the owner of a list. Loaded on demand, so people who only
 * look up a handle never download it.
 *
 * The session belongs to the tab that logged in. The OAuth library keeps
 * tokens in IndexedDB, shared by every tab of the origin, so:
 * - this tab remembers its DID in sessionStorage and holds a Web Lock for it;
 * - other tabs never restore that session;
 * - a later visit revokes a session whose tab is gone (no lock holder).
 * Logging out revokes the session at once.
 */
import { BrowserOAuthClient, type OAuthSession } from '@atproto/oauth-client-browser';
import { PUBLIC_APPVIEW } from './bsky';
import { buildClientMetadata, loopbackClientId, OAUTH_SCOPE, type OAuthTarget } from './oauth-metadata';

const TAB_KEY = 'sumidos.session';
/** Where the library records the last DID that logged in on this origin. */
const LIBRARY_SUB_KEY = '@@atproto/oauth-client-browser(sub)';
const LOCK_PREFIX = 'sumidos.session:';

let clientPromise: Promise<BrowserOAuthClient> | undefined;

function createClient(target: Exclude<OAuthTarget, { kind: 'none' }>): Promise<BrowserOAuthClient> {
  if (target.kind === 'loopback') {
    return BrowserOAuthClient.load({
      clientId: loopbackClientId(target.redirectUri, OAUTH_SCOPE),
      handleResolver: PUBLIC_APPVIEW,
      responseMode: 'fragment',
    });
  }
  return Promise.resolve(
    new BrowserOAuthClient({
      clientMetadata: buildClientMetadata(target.host, target.base),
      handleResolver: PUBLIC_APPVIEW,
      responseMode: 'fragment',
    }),
  );
}

function getClient(target: Exclude<OAuthTarget, { kind: 'none' }>): Promise<BrowserOAuthClient> {
  clientPromise ??= createClient(target);
  return clientPromise;
}

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Holds a lock for as long as this tab lives, so other tabs can tell. */
function claim(sub: string): void {
  navigator.locks?.request(`${LOCK_PREFIX}${sub}`, () => new Promise<never>(() => {})).catch(() => {});
  try {
    sessionStorage.setItem(TAB_KEY, sub);
  } catch {
    // No sessionStorage: the session lasts until this page is reloaded.
  }
}

async function isClaimed(sub: string): Promise<boolean> {
  if (!navigator.locks?.query) return true;
  const state = await navigator.locks.query();
  return (state.held ?? []).some((lock) => lock.name === `${LOCK_PREFIX}${sub}`);
}

function hasCallbackParams(): boolean {
  const params = new URLSearchParams(location.hash.slice(1));
  return params.has('state') && (params.has('code') || params.has('error'));
}

/**
 * Completes a login redirect, or restores this tab's own session. Revokes a
 * leftover session from a tab that was closed without logging out.
 */
export async function initSession(target: Exclude<OAuthTarget, { kind: 'none' }>): Promise<OAuthSession | undefined> {
  if (hasCallbackParams()) {
    const client = await getClient(target);
    const { session } = await client.initCallback();
    claim(session.sub);
    return session;
  }

  const mine = read(sessionStorage, TAB_KEY);
  if (mine) {
    const client = await getClient(target);
    try {
      const session = await client.restore(mine);
      claim(session.sub);
      return session;
    } catch {
      sessionStorage.removeItem(TAB_KEY);
      return undefined;
    }
  }

  const leftover = read(localStorage, LIBRARY_SUB_KEY);
  if (leftover && !(await isClaimed(leftover))) {
    const client = await getClient(target);
    await client.revoke(leftover).catch(() => {});
  }
  return undefined;
}

/** Redirects to the user's PDS to log in; does not return on success. */
export async function signIn(target: Exclude<OAuthTarget, { kind: 'none' }>, handle: string): Promise<void> {
  const client = await getClient(target);
  await client.signInRedirect(handle);
}

export async function signOut(target: Exclude<OAuthTarget, { kind: 'none' }>, session: OAuthSession): Promise<void> {
  try {
    sessionStorage.removeItem(TAB_KEY);
  } catch {
    // Nothing stored.
  }
  try {
    await session.signOut();
  } catch {
    const client = await getClient(target);
    await client.revoke(session.sub).catch(() => {});
  }
}

export type { OAuthSession };
