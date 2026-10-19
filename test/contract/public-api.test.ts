/**
 * Contract test against the real public Bluesky API. Skipped unless
 * QUIET_CONTRACT=1 is set (npm run test:contract). It checks that the
 * response fields this app depends on still exist and have the right types.
 * It makes about a dozen requests.
 */
import { describe, expect, it } from 'vitest';
import { AppViewReader, PdsRepoClient, PUBLIC_APPVIEW } from '../../src/lib/bsky';
import { pdsEndpoint, resolveDidDocument } from '../../src/lib/identity';
import { scan } from '../../src/lib/scan';
import { MemoryScanStore } from '../../src/lib/cache';
import { XrpcClient, XrpcError, serviceFetchHandler } from '../../src/lib/xrpc';

const enabled = process.env.QUIET_CONTRACT === '1';
const ACTOR = process.env.QUIET_CONTRACT_ACTOR ?? 'bsky.app';
const TIMEOUT = 60_000;

const client = new XrpcClient(serviceFetchHandler(PUBLIC_APPVIEW), {
  backoff: { baseMs: 1000, maxMs: 10_000, retries: 3, jitter: 0.2 },
});
const reader = new AppViewReader(client);

const isString = (v: unknown) => typeof v === 'string' && v.length > 0;
const isIsoDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function expectProfileView(p: Record<string, unknown>) {
  expect(p.did).toSatisfy(isString);
  expect(String(p.did)).toMatch(/^did:/);
  expect(p.handle).toSatisfy(isString);
  if (p.displayName !== undefined) expect(typeof p.displayName).toBe('string');
  if (p.avatar !== undefined) expect(String(p.avatar)).toMatch(/^https:\/\//);
  if (p.createdAt !== undefined) expect(p.createdAt).toSatisfy(isIsoDate);
}

describe.skipIf(!enabled)('public API contract', () => {
  let did = '';
  let follows: { did: string }[] = [];

  it(
    'getProfile returns did, handle and counts',
    async () => {
      const p = await reader.getProfile(ACTOR);
      expectProfileView(p as never);
      expect(typeof p.followsCount).toBe('number');
      expect(typeof p.followersCount).toBe('number');
      expect(typeof p.postsCount).toBe('number');
      did = p.did;
    },
    TIMEOUT,
  );

  it(
    'getFollows pages with a cursor and returns profile views',
    async () => {
      const page = await reader.getFollows(did, undefined);
      expect(Array.isArray(page.follows)).toBe(true);
      expect(page.follows.length).toBeGreaterThan(0);
      expect(page.subject.did).toBe(did);
      for (const f of page.follows.slice(0, 5)) expectProfileView(f as never);
      if (page.cursor !== undefined) expect(typeof page.cursor).toBe('string');
      follows = page.follows;
    },
    TIMEOUT,
  );

  it(
    'getProfiles returns detailed profiles with counts',
    async () => {
      const res = await reader.getProfiles(follows.slice(0, 5).map((f) => f.did));
      expect(res.profiles.length).toBeGreaterThan(0);
      for (const p of res.profiles) {
        expectProfileView(p as never);
        expect(typeof p.postsCount).toBe('number');
      }
    },
    TIMEOUT,
  );

  it(
    'getRelationships reports follow records and follow-backs by DID',
    async () => {
      const res = await reader.getRelationships(did, follows.slice(0, 5).map((f) => f.did));
      expect(res.relationships.length).toBeGreaterThan(0);
      for (const r of res.relationships) {
        if (r.notFound) continue;
        expect(r.did).toSatisfy(isString);
        // The scanned account follows all of these, so the URI must be there.
        expect(r.following).toMatch(new RegExp(`^at://${did}/app\\.bsky\\.graph\\.follow/`));
        if (r.followedBy !== undefined) expect(r.followedBy).toMatch(/^at:\/\/did:.+\/app\.bsky\.graph\.follow\//);
      }
    },
    TIMEOUT,
  );

  it.each(['posts_no_replies', 'posts_with_replies'])(
    'getAuthorFeed (%s) items have the fields used for last activity',
    async (filter) => {
      const res = await reader.getAuthorFeed({ actor: did, limit: 5, filter });
      expect(Array.isArray(res.feed)).toBe(true);
      for (const item of res.feed) {
        expect(item.post.uri).toMatch(/^at:\/\//);
        expect(item.post.indexedAt).toSatisfy(isIsoDate);
        expect(item.post.author.did).toSatisfy(isString);
        if (item.post.record.createdAt !== undefined) expect(item.post.record.createdAt).toSatisfy(isIsoDate);
        if (item.reason) {
          expect(item.reason.$type).toSatisfy(isString);
          if (item.reason.$type!.endsWith('#reasonRepost')) expect(item.reason.indexedAt).toSatisfy(isIsoDate);
        }
      }
    },
    TIMEOUT,
  );

  it(
    'unknown actors fail with a 400 XRPC error',
    async () => {
      const err = await reader.getProfile('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(XrpcError);
      expect((err as XrpcError).status).toBe(400);
      expect((err as XrpcError).error).toSatisfy(isString);
    },
    TIMEOUT,
  );

  it(
    'the DID document names a PDS that lists follow records publicly',
    async () => {
      const doc = await resolveDidDocument(did);
      const pds = pdsEndpoint(doc);
      expect(pds).toMatch(/^https:\/\//);
      const repo = new PdsRepoClient(new XrpcClient(serviceFetchHandler(pds!)));
      const res = await repo.listFollows(did, undefined);
      expect(res.records.length).toBeGreaterThan(0);
      const rec = res.records[0]!;
      expect(rec.uri).toMatch(new RegExp(`^at://${did}/app\\.bsky\\.graph\\.follow/`));
      expect(rec.value.subject).toMatch(/^did:/);
    },
    TIMEOUT,
  );

  it(
    'a quick scan with a tiny sample runs end to end',
    async () => {
      const res = await scan(
        { reader, store: new MemoryScanStore() },
        { actor: ACTOR, mode: 'posts', scanType: 'quick', concurrency: 2, maxAgeMs: 0, sampleSize: 3 },
      );
      expect(res.did).toBe(did);
      expect(res.accounts.length).toBeGreaterThan(0);
      expect(res.stats.fetched + res.stats.skipped).toBeGreaterThan(0);
    },
    TIMEOUT * 3,
  );
});
