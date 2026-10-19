import { describe, expect, it } from 'vitest';
import type { BskyReader, RepoClient } from '../src/lib/bsky';
import { MemoryScanStore } from '../src/lib/cache';
import { ActorError, scan, statusFromError, type ScanOptions } from '../src/lib/scan';
import type { FeedViewPost, ProfileViewDetailed } from '../src/lib/types';
import { XrpcError } from '../src/lib/xrpc';
import { DAY, post, repost } from './helpers';

const NOW = Date.parse('2026-10-19T00:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const ME = 'did:plc:me';

interface FakeUser {
  profile: ProfileViewDetailed;
  feed: FeedViewPost[];
  followsMe?: boolean;
  error?: string;
}

function user(name: string, extra: Partial<FakeUser> & { posts?: number } = {}): FakeUser {
  return {
    profile: { did: `did:plc:${name}`, handle: `${name}.test`, displayName: name, avatar: 'x', postsCount: extra.posts ?? 5 },
    feed: [],
    ...extra,
  };
}

class FakeAppView implements BskyReader {
  calls: Record<string, number> = {};
  constructor(private readonly users: FakeUser[], private readonly pageSize = 2) {}

  private count(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  private find(did: string) {
    return this.users.find((u) => u.profile.did === did);
  }

  async getProfile(actor: string) {
    this.count('getProfile');
    if (actor === ME || actor === 'me.test') {
      return { did: ME, handle: 'me.test', followsCount: this.users.length };
    }
    const u = this.find(actor);
    if (!u) throw new XrpcError(400, 'InvalidRequest', 'Profile not found');
    if (u.error) throw new XrpcError(400, u.error, '');
    return u.profile;
  }

  async getProfiles(actors: string[]) {
    this.count('getProfiles');
    return { profiles: actors.map((a) => this.find(a)).filter((u) => u && !u.error).map((u) => u!.profile) };
  }

  async getFollows(_actor: string, cursor: string | undefined) {
    this.count('getFollows');
    const visible = this.users.filter((u) => !u.error);
    const start = cursor ? Number(cursor) : 0;
    const page = visible.slice(start, start + this.pageSize);
    const next = start + this.pageSize;
    return {
      subject: { did: ME, handle: 'me.test' },
      follows: page.map((u) => u.profile),
      ...(next < visible.length ? { cursor: String(next) } : {}),
    };
  }

  async getRelationships(_actor: string, others: string[]) {
    this.count('getRelationships');
    return {
      relationships: others.map((did) => ({
        did,
        following: `at://${ME}/app.bsky.graph.follow/${did.slice(8)}`,
        ...(this.find(did)?.followsMe ? { followedBy: `at://${did}/app.bsky.graph.follow/x` } : {}),
      })),
    };
  }

  async getAuthorFeed(params: { actor: string; limit: number; cursor?: string }) {
    this.count('getAuthorFeed');
    const u = this.find(params.actor)!;
    const start = params.cursor ? Number(params.cursor) : 0;
    const next = start + params.limit;
    return { feed: u.feed.slice(start, next), ...(next < u.feed.length ? { cursor: String(next) } : {}) };
  }
}

const opts: ScanOptions = { actor: 'me.test', mode: 'posts', scanType: 'full', concurrency: 3, maxAgeMs: DAY };

function world() {
  return [
    user('active', { feed: [post(ago(1))], followsMe: true }),
    user('quiet', { feed: [post(ago(400))] }),
    user('reposter', { feed: [repost(ago(2)), post(ago(100))] }),
    user('never', { posts: 0 }),
    user('gone', { error: 'AccountDeactivated' }),
  ];
}

describe('scan', () => {
  it('lists follows, enriches them, and finds last activity', async () => {
    const reader = new FakeAppView(world());
    const repoFor = async (): Promise<RepoClient> => ({
      listFollows: async () => ({
        records: world().map((u) => ({
          uri: `at://${ME}/app.bsky.graph.follow/${u.profile.handle}`,
          cid: 'c',
          value: { subject: u.profile.did, createdAt: '' },
        })),
      }),
      deleteRecord: async () => {},
    });
    const store = new MemoryScanStore();
    const res = await scan({ reader, store, repoFor, now: () => NOW }, opts);
    const by = Object.fromEntries(res.accounts.map((a) => [a.handle, a]));

    expect(res.did).toBe(ME);
    expect(res.accounts).toHaveLength(5);
    expect(by['active.test']).toMatchObject({ mutual: true, lastActivity: { at: ago(1) } });
    expect(by['quiet.test']).toMatchObject({ mutual: false, lastActivity: { at: ago(400) } });
    // Posts-only mode reads past the repost.
    expect(by['reposter.test']!.lastActivity?.at).toBe(ago(100));
    // Zero posts: no feed request needed.
    expect(by['never.test']).toMatchObject({ lastActivity: null, checkedAt: NOW });
    // Only found through the repo records; getProfile explains why.
    expect(by['did:plc:gone']).toMatchObject({ status: 'deactivated' });
    expect(res.stats).toMatchObject({ follows: 5, fetched: 3, skipped: 1 });
    expect(reader.calls.getAuthorFeed).toBe(4); // 3 accounts + 1 extra page for the reposter
    expect((await store.get(ME))?.accounts).toHaveLength(5);
  });

  it('rescans incrementally: fresh cache entries are not fetched again', async () => {
    const store = new MemoryScanStore();
    let now = NOW;
    await scan({ reader: new FakeAppView(world()), store, now: () => now }, opts);

    const reader2 = new FakeAppView(world());
    now = NOW + DAY / 2;
    const second = await scan({ reader: reader2, store, now: () => now }, opts);
    expect(reader2.calls.getAuthorFeed).toBeUndefined();
    expect(second.stats.fromCache).toBe(4);

    const reader3 = new FakeAppView(world());
    now = NOW + 2 * DAY;
    await scan({ reader: reader3, store, now: () => now }, opts);
    expect(reader3.calls.getAuthorFeed).toBe(4);
  });

  it('refetches when the activity mode changes, or when forced', async () => {
    const store = new MemoryScanStore();
    await scan({ reader: new FakeAppView(world()), store, now: () => NOW }, opts);
    const r2 = new FakeAppView(world());
    const res = await scan({ reader: r2, store, now: () => NOW }, { ...opts, mode: 'all' });
    expect(r2.calls.getAuthorFeed).toBe(4); // includes the zero-post account in "all" mode
    expect(res.accounts.find((a) => a.handle === 'reposter.test')!.lastActivity?.kind).toBe('repost');
    const r3 = new FakeAppView(world());
    await scan({ reader: r3, store, now: () => NOW }, { ...opts, mode: 'all', force: true });
    expect(r3.calls.getAuthorFeed).toBe(4);
  });

  it('quick scan skips deep checks and can sample', async () => {
    const reader = new FakeAppView(world());
    const res = await scan(
      { reader, store: new MemoryScanStore(), now: () => NOW, random: () => 0 },
      { ...opts, scanType: 'quick', sampleSize: 2 },
    );
    expect(reader.calls.getAuthorFeed).toBe(2);
    expect(res.accounts.filter((a) => a.checkedAt !== undefined)).toHaveLength(3); // 2 sampled + zero-post
    const reposter = res.accounts.find((a) => a.handle === 'reposter.test');
    if (reposter?.checkedAt) expect(reposter).toMatchObject({ approximate: true, quietSince: ago(2) });
  });

  it('saves partial progress when cancelled', async () => {
    const ac = new AbortController();
    const store = new MemoryScanStore();
    const res = await scan(
      { reader: new FakeAppView(world()), store, now: () => NOW },
      {
        ...opts,
        concurrency: 1,
        signal: ac.signal,
        onProgress: (p) => {
          if (p.phase === 'activity' && p.done === 1) ac.abort();
        },
      },
    );
    expect(res.cancelled).toBe(true);
    const saved = await store.get(ME);
    expect(saved?.accounts.filter((a) => a.checkedAt !== undefined).length).toBeGreaterThanOrEqual(2);
  });

  it('reports a missing or deactivated actor clearly', async () => {
    const reader = new FakeAppView([]);
    await expect(scan({ reader, store: new MemoryScanStore() }, { ...opts, actor: 'nobody.test' })).rejects.toBeInstanceOf(
      ActorError,
    );
  });
});

describe('statusFromError', () => {
  it('maps AppView errors to statuses', () => {
    expect(statusFromError(new XrpcError(400, 'AccountDeactivated', ''))).toBe('deactivated');
    expect(statusFromError(new XrpcError(400, 'AccountTakedown', ''))).toBe('takendown');
    expect(statusFromError(new XrpcError(400, 'InvalidRequest', 'Profile not found'))).toBe('notfound');
    expect(statusFromError(new XrpcError(400, 'BlockedActor', ''))).toBe('blocked');
    expect(statusFromError(new Error('network'))).toBe('error');
  });
});
