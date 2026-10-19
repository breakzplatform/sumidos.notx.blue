/**
 * The subset of Bluesky response shapes this app relies on. The contract
 * test (test/contract) checks these against the live public API.
 */

export interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  createdAt?: string;
  indexedAt?: string;
  labels?: { val: string; src: string }[];
}

export interface ProfileViewDetailed extends ProfileView {
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

export interface GetFollowsResponse {
  subject: ProfileView;
  follows: ProfileView[];
  cursor?: string;
}

export interface GetProfilesResponse {
  profiles: ProfileViewDetailed[];
}

export interface Relationship {
  $type?: string;
  did?: string;
  actor?: string;
  notFound?: boolean;
  /** at-uri of the actor's follow record for this account. */
  following?: string;
  /** at-uri of this account's follow record for the actor. */
  followedBy?: string;
}

export interface GetRelationshipsResponse {
  actor?: string;
  relationships: Relationship[];
}

export interface FeedViewPost {
  post: {
    uri: string;
    indexedAt: string;
    author: { did: string };
    record: { createdAt?: string; reply?: unknown; [k: string]: unknown };
  };
  reply?: unknown;
  reason?: { $type?: string; indexedAt?: string; by?: { did: string } };
}

export interface GetAuthorFeedResponse {
  feed: FeedViewPost[];
  cursor?: string;
}

export interface ListRecordsResponse<V> {
  records: { uri: string; cid: string; value: V }[];
  cursor?: string;
}

export interface FollowRecord {
  subject: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Domain types

/** Which activity counts as "posting". */
export type ActivityMode = 'posts' | 'posts_replies' | 'all';

export type AccountStatus =
  | 'active'
  | 'deactivated'
  | 'takendown'
  | 'notfound'
  | 'blocked'
  | 'error';

export interface LastActivity {
  at: string;
  kind: 'post' | 'reply' | 'repost';
  uri: string;
}

export interface Account {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  /** When the account was created, per its profile. */
  createdAt?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  status: AccountStatus;
  /** Follows the scanned account back. `undefined` when unknown. */
  mutual?: boolean;
  /** at-uri of the scanned account's follow record, if known. */
  followUri?: string;
  /** Most recent matching activity; `null` when none was found. */
  lastActivity?: LastActivity | null;
  /**
   * Set when the feed was only partially read and nothing matching was
   * found: there is no matching activity newer than this date.
   */
  quietSince?: string;
  /** True when the result is a guess (quick scan, limited depth). */
  approximate?: boolean;
  /** Mode the activity was checked with. */
  activityMode?: ActivityMode;
  /** Epoch ms when activity was last checked; absent if never checked. */
  checkedAt?: number;
  errorMessage?: string;
}
