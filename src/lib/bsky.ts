/**
 * Typed wrappers for the handful of Bluesky/atproto endpoints we call.
 */
import type {
  FollowRecord,
  GetAuthorFeedResponse,
  GetFollowsResponse,
  GetProfilesResponse,
  GetRelationshipsResponse,
  ListRecordsResponse,
  ProfileViewDetailed,
} from './types';
import { XrpcClient, type CallOptions } from './xrpc';

export const PUBLIC_APPVIEW = 'https://public.api.bsky.app';
export const FOLLOW_COLLECTION = 'app.bsky.graph.follow';

/** Read-only AppView calls used by the scanner. */
export interface BskyReader {
  getProfile(actor: string, call?: CallOptions): Promise<ProfileViewDetailed>;
  getProfiles(actors: string[], call?: CallOptions): Promise<GetProfilesResponse>;
  getFollows(actor: string, cursor: string | undefined, call?: CallOptions): Promise<GetFollowsResponse>;
  getRelationships(actor: string, others: string[], call?: CallOptions): Promise<GetRelationshipsResponse>;
  getAuthorFeed(
    params: { actor: string; limit: number; filter: string; cursor?: string },
    call?: CallOptions,
  ): Promise<GetAuthorFeedResponse>;
}

export class AppViewReader implements BskyReader {
  constructor(private readonly client: XrpcClient) {}

  getProfile(actor: string, call?: CallOptions) {
    return this.client.query<ProfileViewDetailed>('app.bsky.actor.getProfile', { actor }, call);
  }

  getProfiles(actors: string[], call?: CallOptions) {
    return this.client.query<GetProfilesResponse>('app.bsky.actor.getProfiles', { actors }, call);
  }

  getFollows(actor: string, cursor: string | undefined, call?: CallOptions) {
    return this.client.query<GetFollowsResponse>(
      'app.bsky.graph.getFollows',
      { actor, limit: 100, cursor },
      call,
    );
  }

  getRelationships(actor: string, others: string[], call?: CallOptions) {
    return this.client.query<GetRelationshipsResponse>(
      'app.bsky.graph.getRelationships',
      { actor, others },
      call,
    );
  }

  getAuthorFeed(params: { actor: string; limit: number; filter: string; cursor?: string }, call?: CallOptions) {
    return this.client.query<GetAuthorFeedResponse>(
      'app.bsky.feed.getAuthorFeed',
      { ...params, includePins: false },
      call,
    );
  }
}

/** Repository calls against a PDS. Reads are public; deletes need auth. */
export interface RepoClient {
  listFollows(repo: string, cursor: string | undefined, call?: CallOptions): Promise<ListRecordsResponse<FollowRecord>>;
  deleteRecord(repo: string, collection: string, rkey: string, call?: CallOptions): Promise<void>;
}

export class PdsRepoClient implements RepoClient {
  constructor(private readonly client: XrpcClient) {}

  listFollows(repo: string, cursor: string | undefined, call?: CallOptions) {
    return this.client.query<ListRecordsResponse<FollowRecord>>(
      'com.atproto.repo.listRecords',
      { repo, collection: FOLLOW_COLLECTION, limit: 100, cursor },
      call,
    );
  }

  async deleteRecord(repo: string, collection: string, rkey: string, call?: CallOptions) {
    await this.client.procedure('com.atproto.repo.deleteRecord', { repo, collection, rkey }, call);
  }
}

/** Splits an at-uri into its parts. */
export function parseAtUri(uri: string): { repo: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(uri);
  if (!m) return null;
  return { repo: m[1]!, collection: m[2]!, rkey: m[3]! };
}
