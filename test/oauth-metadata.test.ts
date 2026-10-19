import { describe, expect, it } from 'vitest';
import { buildClientMetadata, loopbackClientId, normalizePublicUrl } from '../src/lib/oauth-metadata';

describe('client metadata', () => {
  it('derives client_id and redirect_uri from the public URL', () => {
    const m = buildClientMetadata('https://quiet.notx.blue');
    expect(m.client_id).toBe('https://quiet.notx.blue/client-metadata.json');
    expect(m.redirect_uris).toEqual(['https://quiet.notx.blue/']);
    expect(m.scope).toContain('atproto');
    expect(m.dpop_bound_access_tokens).toBe(true);
  });

  it('supports hosting under a sub-path', () => {
    const m = buildClientMetadata('https://example.org/tools/quiet');
    expect(m.client_id).toBe('https://example.org/tools/quiet/client-metadata.json');
    expect(m.redirect_uris).toEqual(['https://example.org/tools/quiet/']);
  });

  it('normalizes the URL', () => {
    expect(normalizePublicUrl('https://a.example/x?y=1#z')).toBe('https://a.example/x/');
  });

  it('builds a loopback client id for development', () => {
    const id = loopbackClientId('http://127.0.0.1:5173/', 'atproto');
    expect(id).toBe('http://localhost?redirect_uri=http%3A%2F%2F127.0.0.1%3A5173%2F&scope=atproto');
  });
});
