import { describe, expect, it } from 'vitest';
import {
  allowedHosts,
  buildClientMetadata,
  OAUTH_SCOPE,
  oauthTarget,
  parseHostList,
} from '../src/lib/oauth-metadata';

const at = (url: string) => {
  const u = new URL(url);
  return { protocol: u.protocol, host: u.host, hostname: u.hostname, origin: u.origin };
};

describe('buildClientMetadata', () => {
  it('uses one client per origin, identified by its own document URL', () => {
    const m = buildClientMetadata('sumidos.notx.blue');
    expect(m.client_id).toBe('https://sumidos.notx.blue/oauth/sumidos.notx.blue.json');
    expect(m.redirect_uris).toEqual(['https://sumidos.notx.blue/']);
    expect(m.client_name).toBe('sumidos.notx.blue');
    expect(buildClientMetadata('quiet.notx.blue').client_id).toBe('https://quiet.notx.blue/oauth/quiet.notx.blue.json');
  });

  it('asks only to create and delete follows', () => {
    expect(OAUTH_SCOPE).toBe('atproto repo:app.bsky.graph.follow?action=create&action=delete');
    expect(buildClientMetadata('sumidos.notx.blue')).toMatchObject({
      token_endpoint_auth_method: 'none',
      dpop_bound_access_tokens: true,
      application_type: 'web',
    });
  });
});

describe('oauthTarget', () => {
  const hosts = allowedHosts();

  it('allows both site hosts', () => {
    expect(oauthTarget(at('https://sumidos.notx.blue/'), hosts)).toEqual({ kind: 'hosted', host: 'sumidos.notx.blue' });
    expect(oauthTarget(at('https://quiet.notx.blue/?x=1'), hosts)).toEqual({ kind: 'hosted', host: 'quiet.notx.blue' });
  });

  it('refuses other hosts, plain http and odd ports', () => {
    expect(oauthTarget(at('https://evil.example/'), hosts)).toEqual({ kind: 'none' });
    expect(oauthTarget(at('https://sumidos.notx.blue.evil.example/'), hosts)).toEqual({ kind: 'none' });
    expect(oauthTarget(at('http://sumidos.notx.blue/'), hosts)).toEqual({ kind: 'none' });
    expect(oauthTarget(at('https://sumidos.notx.blue:8443/'), hosts)).toEqual({ kind: 'none' });
  });

  it('uses the loopback client locally', () => {
    expect(oauthTarget(at('http://localhost:5173/'), hosts)).toEqual({ kind: 'loopback', redirectUri: 'http://127.0.0.1:5173/' });
  });

  it('accepts extra hosts from the build, like a preview', () => {
    const extra = parseHostList(' preview--site.netlify.app , bad/host ');
    expect(extra).toEqual(['preview--site.netlify.app']);
    expect(oauthTarget(at('https://preview--site.netlify.app/'), allowedHosts(extra)).kind).toBe('hosted');
  });
});
