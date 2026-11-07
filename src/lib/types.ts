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

export type AccountStatus = 'active' | 'deactivated' | 'takendown' | 'notfound' | 'error';

/** What reading an account's author feed found, per kind of activity. */
export interface FeedSummary {
  lastPost?: string;
  lastReply?: string;
  lastRepost?: string;
  /** Oldest item read: a lower bound on quietness when `complete` is false. */
  oldestSeen?: string;
  /** True when a plain post was found or the whole feed was read. */
  complete: boolean;
}

export interface Account {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  postsCount?: number;
  status: AccountStatus;
  /** Absent until the feed was read (or when it could not be). */
  feed?: FeedSummary;
  errorMessage?: string;
}
