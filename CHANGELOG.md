# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### 0.1.0 (unreleased)

#### Added

- Scan the follows of any public Bluesky handle or DID through the public
  AppView, and find each account's last activity (posts only, posts and
  replies, or including reposts).
- Results table sorted by inactivity, with counts, links to bsky.app and badges
  for mutual / not mutual, never posted, deactivated, taken down, not found and
  likely ghosts.
- Filters for minimum inactivity (30/90/180/365 days or custom), non-mutuals,
  never posted, likely ghosts, keep list, and search; sortable columns.
- CSV export of the current view.
- IndexedDB cache per scanned account with incremental rescans; cancelled scans
  keep their progress.
- Full scan (also reads follow records from the PDS and pages deeper) and quick
  scan (one request per account, optional random sample).
- Bounded concurrency (4 by default), exponential backoff, and rate-limit header
  handling.
- Login with atproto OAuth (`@atproto/oauth-client-browser`), with
  `client-metadata.json` generated at build time and the loopback client for
  local development.
- Bulk unfollow for the logged-in owner: confirmation, paced deletes, live log,
  stop button and summary; dry-run mode; exportable keep list.
- English and Brazilian Portuguese UI, light and dark themes, keyboard and
  screen-reader friendly markup, responsive layout.
- Unit tests and an opt-in contract test against the public API.
