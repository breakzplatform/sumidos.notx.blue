import { describe, expect, it } from 'vitest';
import type { RepoClient } from '../src/lib/bsky';
import type { FollowRecord, ListRecordsResponse } from '../src/lib/types';
import { runUnfollow, type UnfollowEvent } from '../src/lib/unfollow';
import { XrpcError } from '../src/lib/xrpc';

const OWNER = 'did:plc:owner';

/** In-memory PDS holding the owner's follow records. */
class FakePds implements RepoClient {
  records = new Map<string, FollowRecord>();
  deletes: string[] = [];
  failOnce = new Set<string>();
  pageSize = 2;

  constructor(subjects: string[]) {
    subjects.forEach((s, i) => this.records.set(`rk${i}`, { subject: s, createdAt: '2024-01-01T00:00:00Z' }));
  }

  async listFollows(repo: string, cursor: string | undefined): Promise<ListRecordsResponse<FollowRecord>> {
    if (repo !== OWNER) throw new Error('wrong repo');
    const all = [...this.records.entries()];
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + this.pageSize);
    const next = start + this.pageSize;
    return {
      records: page.map(([rkey, value]) => ({ uri: `at://${OWNER}/app.bsky.graph.follow/${rkey}`, cid: 'c', value })),
      ...(next < all.length ? { cursor: String(next) } : {}),
    };
  }

  async deleteRecord(repo: string, collection: string, rkey: string): Promise<void> {
    if (repo !== OWNER || collection !== 'app.bsky.graph.follow') throw new Error('bad delete');
    if (this.failOnce.has(rkey)) {
      this.failOnce.delete(rkey);
      throw new XrpcError(500, 'InternalServerError', 'boom');
    }
    this.deletes.push(rkey);
    this.records.delete(rkey);
  }

  following(): string[] {
    return [...this.records.values()].map((r) => r.subject);
  }
}

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

describe('runUnfollow', () => {
  it('deletes the follow records for the selected accounts only', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:b', 'did:plc:c', 'did:plc:d', 'did:plc:e']);
    const c = clock();
    const summary = await runUnfollow({
      owner: OWNER,
      subjects: ['did:plc:b', 'did:plc:d'],
      repo: pds,
      dryRun: false,
      minIntervalMs: 500,
      ...c,
    });
    expect(summary).toMatchObject({ requested: 2, deleted: 2, failed: 0, stopped: false, done: ['did:plc:b', 'did:plc:d'] });
    expect(pds.following()).toEqual(['did:plc:a', 'did:plc:c', 'did:plc:e']);
  });

  it('paces deletes by minIntervalMs', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:b', 'did:plc:c']);
    const c = clock();
    await runUnfollow({ owner: OWNER, subjects: ['did:plc:a', 'did:plc:b', 'did:plc:c'], repo: pds, dryRun: false, minIntervalMs: 1000, ...c });
    expect(c.sleeps).toEqual([1000, 1000]);
  });

  it('dry run deletes nothing but reports what would happen', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:b']);
    const events: UnfollowEvent[] = [];
    const summary = await runUnfollow({
      owner: OWNER,
      subjects: ['did:plc:a', 'did:plc:zzz'],
      repo: pds,
      dryRun: true,
      minIntervalMs: 1000,
      onEvent: (e) => events.push(e),
      ...clock(),
    });
    expect(pds.deletes).toEqual([]);
    expect(summary).toMatchObject({ dryRun: true, wouldDelete: 1, notFollowing: 1, deleted: 0 });
    expect(events.map((e) => e.type)).toContain('would-delete');
  });

  it('never unfollows allowlisted accounts', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:b']);
    const summary = await runUnfollow({
      owner: OWNER,
      subjects: ['did:plc:a', 'did:plc:b'],
      repo: pds,
      allowlist: new Set(['did:plc:a']),
      dryRun: false,
      minIntervalMs: 0,
      ...clock(),
    });
    expect(summary).toMatchObject({ deleted: 1, allowlisted: 1 });
    expect(pds.following()).toEqual(['did:plc:a']);
  });

  it('removes duplicate follow records for the same account', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:a', 'did:plc:b']);
    const summary = await runUnfollow({ owner: OWNER, subjects: ['did:plc:a'], repo: pds, dryRun: false, minIntervalMs: 0, ...clock() });
    expect(summary.deleted).toBe(1);
    expect(pds.deletes).toEqual(['rk0', 'rk1']);
  });

  it('keeps going after a failure and reports it', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:b']);
    pds.failOnce.add('rk0');
    const events: UnfollowEvent[] = [];
    const summary = await runUnfollow({
      owner: OWNER,
      subjects: ['did:plc:a', 'did:plc:b'],
      repo: pds,
      dryRun: false,
      minIntervalMs: 0,
      onEvent: (e) => events.push(e),
      ...clock(),
    });
    expect(summary).toMatchObject({ deleted: 1, failed: 1, done: ['did:plc:b'] });
    expect(events.find((e) => e.type === 'failed')).toMatchObject({ subject: 'did:plc:a', error: 'boom' });
  });

  it('stops when the stop button aborts', async () => {
    const pds = new FakePds(['did:plc:a', 'did:plc:b', 'did:plc:c']);
    const ac = new AbortController();
    const summary = await runUnfollow({
      owner: OWNER,
      subjects: ['did:plc:a', 'did:plc:b', 'did:plc:c'],
      repo: pds,
      dryRun: false,
      minIntervalMs: 0,
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === 'deleted') ac.abort();
      },
      ...clock(),
    });
    expect(summary).toMatchObject({ deleted: 1, stopped: true });
    expect(pds.following()).toEqual(['did:plc:b', 'did:plc:c']);
  });

  it('ignores records that are not in the owner repo', async () => {
    const pds = new FakePds([]);
    pds.listFollows = async () => ({
      records: [{ uri: 'at://did:plc:someoneelse/app.bsky.graph.follow/x', cid: 'c', value: { subject: 'did:plc:a', createdAt: '' } }],
    });
    const summary = await runUnfollow({ owner: OWNER, subjects: ['did:plc:a'], repo: pds, dryRun: false, minIntervalMs: 0, ...clock() });
    expect(summary).toMatchObject({ deleted: 0, notFollowing: 1 });
  });
});
