import { describe, expect, it } from 'vitest';
import { normalizeActorInput } from '../src/lib/identity';

describe('normalizeActorInput', () => {
  it('accepts handles in different forms', () => {
    expect(normalizeActorInput('alice.bsky.social')).toBe('alice.bsky.social');
    expect(normalizeActorInput('  @Alice.Bsky.Social ')).toBe('alice.bsky.social');
    expect(normalizeActorInput('https://bsky.app/profile/alice.bsky.social/post/123')).toBe('alice.bsky.social');
  });

  it('accepts DIDs unchanged', () => {
    expect(normalizeActorInput('did:plc:z72i7hdynmk6r22z27h6tvur')).toBe('did:plc:z72i7hdynmk6r22z27h6tvur');
    expect(normalizeActorInput('did:web:example.com')).toBe('did:web:example.com');
  });

  it('rejects junk', () => {
    expect(normalizeActorInput('')).toBeNull();
    expect(normalizeActorInput('not a handle')).toBeNull();
    expect(normalizeActorInput('alice')).toBeNull();
  });
});
