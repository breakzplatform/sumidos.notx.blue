import { describe, expect, it } from 'vitest';
import type { BskyReader, RepoClient } from '../src/lib/bsky';
import { ActorError, resumeFeeds, scan, statusFromError } from '../src/lib/scan';
import type { Account, FeedViewPost, ProfileViewDetailed } from '../src/lib/types';
import { XrpcError } from '../src/lib/xrpc';
import { post, reply } from './helpers';

const ME = 'did:plc:me';

interface FakeUser {
  profile: ProfileViewDetailed;
  feed: FeedViewPost[];
  /** Error code the AppView answers for this account; also hides it from getFollows. */
  error?: string;
  feedError?: string;
}

function user(name: string, extra: Partial<FakeUser> = {}): FakeUser {
  return {
    profile: { did: `did:plc:${name}`, handle: `${name}.test`, displayName: name, postsCount: 5 },
    feed: [],
    ...extra,
  };
}

class FakeAppView implements BskyReader {
  calls: Record<string, number> = {};
  constructor(
    private readonly users: FakeUser[],
    private readonly pageSize = 2,
  ) {}

  private count(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  private find(did: string) {
    return this.users.find((u) => u.profile.did === did);
  }

  async getProfile(actor: string) {
    this.count('getProfile');
    if (actor === ME || actor === 'me.test') return { did: ME, handle: 'me.test', followsCount: this.users.length };
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
    const next = start + this.pageSize;
    return {
      subject: { did: ME, handle: 'me.test' },
      follows: visible.slice(start, next).map((u) => u.profile),
      ...(next < visible.length ? { cursor: String(next) } : {}),
    };
  }

  async getAuthorFeed(params: { actor: string; limit: number; cursor?: string }) {
    this.count('getAuthorFeed');
    const u = this.find(params.actor)!;
    if (u.feedError) throw new XrpcError(500, u.feedError, 'boom');
    const start = params.cursor ? Number(params.cursor) : 0;
    const next = start + params.limit;
    return { feed: u.feed.slice(start, next), ...(next < u.feed.length ? { cursor: String(next) } : {}) };
  }
}

function ownRepo(subjects: string[]): RepoClient & { calls: number } {
  return {
    calls: 0,
    async listFollows(repo: string) {
      this.calls++;
      return {
        records: subjects.map((s, i) => ({
          uri: `at://${repo}/app.bsky.graph.follow/k${i}`,
          cid: 'c',
          value: { subject: s, createdAt: '2024-01-01T00:00:00.000Z' },
        })),
      };
    },
    async applyWrites() {},
  };
}

describe('scan', () => {
  it('lists follows and reads each feed', async () => {
    const reader = new FakeAppView([
      user('a', { feed: [post('2026-10-01T00:00:00.000Z')] }),
      user('b', { feed: [reply('2026-09-01T00:00:00.000Z'), post('2026-01-01T00:00:00.000Z')] }),
      user('c', { feed: [] }),
    ]);
    const seen: string[] = [];
    const res = await scan({ reader }, { actor: 'me.test', onAccount: (a) => seen.push(a.handle) });
    expect(res.subject).toEqual({ did: ME, handle: 'me.test', followsCount: 3 });
    expect(res.cancelled).toBe(false);
    const byHandle = Object.fromEntries(res.accounts.map((a) => [a.handle, a]));
    expect(byHandle['a.test']!.feed).toMatchObject({ lastPost: '2026-10-01T00:00:00.000Z', complete: true });
    expect(byHandle['b.test']!.feed).toMatchObject({
      lastReply: '2026-09-01T00:00:00.000Z',
      lastPost: '2026-01-01T00:00:00.000Z',
    });
    expect(byHandle['c.test']!.feed).toEqual({ complete: true });
    expect(seen.sort()).toEqual(['a.test', 'b.test', 'c.test']);
  });

  it('streams each account as soon as its feed is read', async () => {
    const reader = new FakeAppView([user('a'), user('b')]);
    const order: string[] = [];
    await scan(
      { reader },
      { actor: 'me.test', onAccount: (a) => order.push(`account:${a.handle}`), onProgress: (p) => order.push(p.phase) },
    );
    const firstAccount = order.findIndex((e) => e.startsWith('account:'));
    const lastFeedProgress = order.lastIndexOf('feeds');
    expect(firstAccount).toBeGreaterThan(-1);
    expect(firstAccount).toBeLessThan(lastFeedProgress);
  });

  it('never reads a repo without the owner client', async () => {
    const reader = new FakeAppView([user('a'), user('gone', { error: 'AccountDeactivated' })]);
    const res = await scan({ reader }, { actor: 'me.test' });
    expect(res.accounts.map((a) => a.handle)).toEqual(['a.test']);
  });

  it('on the own list, adds follows the AppView hides and learns why', async () => {
    const reader = new FakeAppView([user('a'), user('gone', { error: 'AccountDeactivated' })]);
    const repo = ownRepo(['did:plc:a', 'did:plc:gone']);
    const res = await scan({ reader, ownRepoFor: (did) => (did === ME ? repo : undefined) }, { actor: 'me.test' });
    expect(repo.calls).toBe(1);
    const gone = res.accounts.find((a) => a.did === 'did:plc:gone');
    expect(gone?.status).toBe('deactivated');
  });

  it('keeps a failed feed as an error and resumes it later', async () => {
    const flaky = user('flaky', { feedError: 'InternalServerError', feed: [post('2026-10-01T00:00:00.000Z')] });
    const reader = new FakeAppView([flaky]);
    const res = await scan({ reader }, { actor: 'me.test' });
    const a = res.accounts[0]!;
    expect(a.status).toBe('error');
    delete flaky.feedError;
    await resumeFeeds({ reader }, res.accounts, {});
    expect(a.status).toBe('active');
    expect(a.feed?.lastPost).toBe('2026-10-01T00:00:00.000Z');
  });

  it('stops when aborted and reports what it has', async () => {
    const reader = new FakeAppView([user('a'), user('b'), user('c')]);
    const controller = new AbortController();
    const res = await scan(
      { reader },
      {
        actor: 'me.test',
        concurrency: 1,
        signal: controller.signal,
        onAccount: () => controller.abort(),
      },
    );
    expect(res.cancelled).toBe(true);
    const read = res.accounts.filter((a: Account) => a.feed);
    expect(read.length).toBeGreaterThan(0);
    expect(read.length).toBeLessThan(3);
  });

  it('turns a missing actor into an ActorError', async () => {
    const reader = new FakeAppView([]);
    await expect(scan({ reader }, { actor: 'nobody.test' })).rejects.toBeInstanceOf(ActorError);
  });
});

describe('statusFromError', () => {
  it('maps AppView errors', () => {
    expect(statusFromError(new XrpcError(400, 'AccountDeactivated', ''))).toBe('deactivated');
    expect(statusFromError(new XrpcError(400, 'AccountTakedown', ''))).toBe('takendown');
    expect(statusFromError(new XrpcError(400, 'InvalidRequest', 'Profile not found'))).toBe('notfound');
    expect(statusFromError(new Error('x'))).toBe('error');
  });
});
