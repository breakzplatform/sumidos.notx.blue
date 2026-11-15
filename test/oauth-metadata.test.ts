import { describe, expect, it } from 'vitest';
import {
  allowedHosts,
  buildClientMetadata,
  normalizeBase,
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
    expect(buildClientMetadata('crickets.notx.blue').client_id).toBe('https://crickets.notx.blue/oauth/crickets.notx.blue.json');
  });

  it('puts the redirect and the document under a subpath build', () => {
    const m = buildClientMetadata('staging.joselito.dev', '/sumidos/');
    expect(m.client_id).toBe('https://staging.joselito.dev/sumidos/oauth/staging.joselito.dev.json');
    expect(m.redirect_uris).toEqual(['https://staging.joselito.dev/sumidos/']);
    expect(m.client_uri).toBe('https://staging.joselito.dev/sumidos/');
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

  it('has one client per site host and no other', () => {
    expect(hosts).toEqual(['sumidos.notx.blue', 'crickets.notx.blue']);
  });

  it('allows both site hosts', () => {
    expect(oauthTarget(at('https://sumidos.notx.blue/'), hosts)).toEqual({ kind: 'hosted', host: 'sumidos.notx.blue', base: '/' });
    expect(oauthTarget(at('https://crickets.notx.blue/?x=1'), hosts)).toEqual({ kind: 'hosted', host: 'crickets.notx.blue', base: '/' });
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

  it('picks the client by host, under the build base', () => {
    const extra = allowedHosts(['staging.joselito.dev']);
    expect(oauthTarget(at('https://staging.joselito.dev/sumidos/'), extra, '/sumidos/')).toEqual({
      kind: 'hosted',
      host: 'staging.joselito.dev',
      base: '/sumidos/',
    });
    expect(oauthTarget(at('http://127.0.0.1:4173/sumidos/'), hosts, '/sumidos/')).toEqual({
      kind: 'loopback',
      redirectUri: 'http://127.0.0.1:4173/sumidos/',
    });
  });

  it('accepts extra hosts from the build, like a preview', () => {
    const extra = parseHostList(' preview--site.netlify.app , bad/host ');
    expect(extra).toEqual(['preview--site.netlify.app']);
    expect(oauthTarget(at('https://preview--site.netlify.app/'), allowedHosts(extra)).kind).toBe('hosted');
  });
});

describe('normalizeBase', () => {
  it('always has a leading and a trailing slash', () => {
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('/sumidos/')).toBe('/sumidos/');
    expect(normalizeBase('sumidos')).toBe('/sumidos/');
    expect(normalizeBase('/a/b')).toBe('/a/b/');
  });
});
