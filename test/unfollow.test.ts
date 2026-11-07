import { describe, expect, it } from 'vitest';
import { MAX_WRITES_PER_CALL, type RepoClient, type RepoWrite } from '../src/lib/bsky';
import type { FollowRecord } from '../src/lib/types';
import {
  indexFollowRecords,
  keepForUndo,
  packBatches,
  planRefollow,
  planUnfollow,
  runBatches,
  type FollowIndex,
} from '../src/lib/unfollow';
import { fakeSleep } from './helpers';

const ME = 'did:plc:me';

/** A repo of follow records that applies writes like a PDS would. */
class FakeRepo implements RepoClient {
  records = new Map<string, FollowRecord>();
  calls: RepoWrite[][] = [];
  failCall?: number;

  constructor(subjects: string[], extra: Array<[string, FollowRecord]> = []) {
    subjects.forEach((s, i) => this.records.set(`k${i}`, { subject: s, createdAt: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }));
    for (const [k, v] of extra) this.records.set(k, v);
  }

  async listFollows(repo: string, cursor: string | undefined) {
    const all = [...this.records].map(([rkey, value]) => ({ uri: `at://${repo}/app.bsky.graph.follow/${rkey}`, cid: 'c', value }));
    const start = cursor ? Number(cursor) : 0;
    const next = start + 100;
    return { records: all.slice(start, next), ...(next < all.length ? { cursor: String(next) } : {}) };
  }

  async applyWrites(_repo: string, writes: RepoWrite[]) {
    this.calls.push(writes);
    if (this.failCall === this.calls.length) throw new Error('InvalidRequest');
    if (writes.length > MAX_WRITES_PER_CALL) throw new Error('too many writes');
    for (const w of writes) {
      if (w.$type === 'com.atproto.repo.applyWrites#delete') this.records.delete(w.rkey);
      else this.records.set(w.rkey!, w.value as unknown as FollowRecord);
    }
  }
}

const dids = (n: number) => Array.from({ length: n }, (_, i) => `did:plc:${i}`);

function followed(repo: FakeRepo): string[] {
  return [...repo.records.values()].map((r) => r.subject).sort();
}

describe('indexFollowRecords', () => {
  it('maps every followed DID to its records, duplicates included', async () => {
    const repo = new FakeRepo(['did:plc:a', 'did:plc:b'], [['dup', { subject: 'did:plc:a', createdAt: 'x' }]]);
    const index = await indexFollowRecords(repo, ME);
    expect(index.get('did:plc:a')?.map((r) => r.rkey)).toEqual(['k0', 'dup']);
    expect(index.get('did:plc:b')).toHaveLength(1);
  });

  it('reads past the first page', async () => {
    const index = await indexFollowRecords(new FakeRepo(dids(250)), ME);
    expect(index.size).toBe(250);
  });
});

describe('packBatches', () => {
  const del = (rkey: string): RepoWrite => ({ $type: 'com.atproto.repo.applyWrites#delete', collection: 'c', rkey });

  it('fills calls up to the limit', () => {
    const groups = dids(450).map((subject) => ({ subject, writes: [del(subject)] }));
    const batches = packBatches(groups);
    expect(batches.map((b) => b.writes.length)).toEqual([200, 200, 50]);
    expect(batches.flatMap((b) => b.subjects)).toHaveLength(450);
  });

  it("keeps an account's writes in one call", () => {
    const groups = [
      { subject: 'a', writes: [del('1'), del('2')] },
      { subject: 'b', writes: [del('3'), del('4')] },
    ];
    expect(packBatches(groups, 3).map((b) => b.subjects)).toEqual([['a'], ['b']]);
  });
});

describe('planUnfollow', () => {
  it('deletes every record of each selected account and notes the rest', async () => {
    const repo = new FakeRepo(['did:plc:a', 'did:plc:b'], [['dup', { subject: 'did:plc:a', createdAt: 'x' }]]);
    const index = await indexFollowRecords(repo, ME);
    const plan = planUnfollow(['did:plc:a', 'did:plc:a', 'did:plc:nope'], index);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]!.writes.map((w) => (w.$type.endsWith('#delete') ? w.rkey : ''))).toEqual(['k0', 'dup']);
    expect(plan.notFollowing).toEqual(['did:plc:nope']);
  });

  it('has no cap on how many accounts', () => {
    const index: FollowIndex = new Map(dids(1001).map((d, i) => [d, [{ rkey: `k${i}`, value: { subject: d, createdAt: 'x' } }]]));
    const plan = planUnfollow([...index.keys()], index);
    expect(plan.batches).toHaveLength(6);
    expect(plan.batches.every((b) => b.writes.length <= MAX_WRITES_PER_CALL)).toBe(true);
  });
});

describe('runBatches', () => {
  it('runs every batch, paced, and reports progress', async () => {
    const repo = new FakeRepo(dids(450));
    const plan = planUnfollow(dids(450), await indexFollowRecords(repo, ME));
    const sleep = fakeSleep();
    const clock = 0;
    const progress: number[] = [];
    const res = await runBatches({
      owner: ME,
      repo,
      batches: plan.batches,
      minIntervalMs: 1000,
      sleep: sleep.fn,
      now: () => clock,
      onProgress: (p) => progress.push(p.done),
    });
    expect(res.done).toHaveLength(450);
    expect(repo.calls).toHaveLength(3);
    expect(sleep.delays).toEqual([1000, 1000]);
    expect(progress).toEqual([200, 400, 450]);
    expect(repo.records.size).toBe(0);
  });

  it('marks the accounts of a failed call and goes on', async () => {
    const repo = new FakeRepo(dids(450));
    repo.failCall = 2;
    const plan = planUnfollow(dids(450), await indexFollowRecords(repo, ME));
    const res = await runBatches({ owner: ME, repo, batches: plan.batches, minIntervalMs: 0 });
    expect(res.done).toHaveLength(250);
    expect(res.failed).toHaveLength(200);
    expect(repo.records.size).toBe(200);
  });

  it('stops between calls when aborted', async () => {
    const repo = new FakeRepo(dids(450));
    const plan = planUnfollow(dids(450), await indexFollowRecords(repo, ME));
    const controller = new AbortController();
    const res = await runBatches({
      owner: ME,
      repo,
      batches: plan.batches,
      minIntervalMs: 0,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    expect(res.stopped).toBe(true);
    expect(res.done).toHaveLength(200);
    expect(repo.calls).toHaveLength(1);
  });
});

describe('undo', () => {
  it('writes the same records back, keys and dates included', async () => {
    const repo = new FakeRepo(dids(5));
    const before = new Map(repo.records);
    const plan = planUnfollow(dids(3), await indexFollowRecords(repo, ME));
    const run = await runBatches({ owner: ME, repo, batches: plan.batches, minIntervalMs: 0 });
    expect(followed(repo)).toEqual(['did:plc:3', 'did:plc:4']);

    const undo = await runBatches({ owner: ME, repo, batches: planRefollow(keepForUndo(plan, run.done)), minIntervalMs: 0 });
    expect(undo.done.sort()).toEqual(dids(3).sort());
    for (const [rkey, value] of before) expect(repo.records.get(rkey)).toMatchObject(value);
  });

  it('only restores accounts that were really unfollowed', async () => {
    const repo = new FakeRepo(dids(450));
    repo.failCall = 2;
    const plan = planUnfollow(dids(450), await indexFollowRecords(repo, ME));
    const run = await runBatches({ owner: ME, repo, batches: plan.batches, minIntervalMs: 0 });
    const kept = keepForUndo(plan, run.done);
    expect(kept.size).toBe(250);
    const batches = planRefollow(kept);
    expect(batches.map((b) => b.writes.length)).toEqual([200, 50]);
    expect(batches[0]!.writes[0]).toMatchObject({
      $type: 'com.atproto.repo.applyWrites#create',
      value: { $type: 'app.bsky.graph.follow' },
    });
  });
});
