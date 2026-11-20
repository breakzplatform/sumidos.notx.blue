# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Renamed to sumidos.notx.blue (Portuguese); crickets.notx.blue is the English
  alias of the same site. One OAuth client per origin.
- New look in the notx.blue family: violet ink, light, dark and terminal
  themes, the shared header and footer.
- Activity is read once per account; "count replies" (on by default),
  "count reposts" (off) and the 30/90/180/365-day threshold (90 by default)
  only re-filter.
- The list shows when the read ends, in pages, with filters by kind and day
  range; from 500 follows the page warns that it takes a while and shows the
  429 wait.
- Unfollowing uses `com.atproto.repo.applyWrites` in batches of 200, with no
  cap on how many, and can be undone while the tab is open.
- A login session stays in the tab that logged in.
- License text aligned with the family: GPL-3.0-only with a NOTICE.
- Node 24.

### Fixed

- Unfollow controls only appear on the logged-in account's own list.
- Without a session, only public AppView data for the typed handle is read;
  no other account's repo is read.
- A `Retry-After: 0` or a reset already in the past no longer burns every
  retry at once: the backoff is the floor.

### Removed

- The "ghost" badge and its heuristics.
- The scan cache, saved scans and the keep list. Only the last list and the
  accounts unfollowed here stay in the browser, so they can be followed again
  later.
- Mutual detection (`getRelationships`).
