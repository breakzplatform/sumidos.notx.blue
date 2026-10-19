# quiet.notx.blue

See which Bluesky accounts you follow have gone quiet: accounts that post
rarely, stopped posting, never posted, or no longer exist. If you log in, you
can unfollow them in bulk.

Part of the notx.blue family of small Bluesky tools.

## What it does

- **Scan any public account.** Type a handle (`alice.bsky.social`), a DID, or a
  `bsky.app` profile link. The app lists everyone that account follows, using
  the public Bluesky API (`app.bsky.graph.getFollows`).
- **Find the last activity** of each followed account with
  `app.bsky.feed.getAuthorFeed`. You choose what counts as activity:
  - posts only,
  - posts and replies,
  - posts, replies and reposts.
- **Sorted by inactivity**, with avatar, name, handle, "last post N days ago"
  and the date, follower/following/post counts, and badges:
  - mutual / not mutual (follows the scanned account back or not),
  - never posted,
  - deactivated, taken down, not found,
  - likely ghost: a hint based on simple signals (no avatar, no display name or
    one equal to the handle, account younger than 30 days, zero posts, almost
    no followers; three or more signals make a "likely ghost").
- **Filters:** inactive for more than 30/90/180/365 days or a custom number,
  only accounts that don't follow back, only accounts that never posted, only
  likely ghosts, hide the keep list, and search by name or handle. Columns can
  be sorted.
- **Export the current view as CSV.** Every row links to the profile on
  bsky.app.
- **Local cache.** Results are saved in IndexedDB per scanned account, with a
  timestamp per followed account. Scanning again only re-checks entries older
  than the cache window (24 hours by default). Cancelling a scan keeps what
  was already checked.
- **Full scan or quick scan.**
  - *Full scan* also reads the follow records from the account's own PDS,
    which finds follows of deleted or suspended accounts that the AppView no
    longer lists, and reads a few extra pages of a feed when the newest item
    doesn't count (for example a repost in "posts only" mode).
  - *Quick scan* makes at most one feed request per account, so some results
    are lower bounds ("nothing in at least N days", marked as an estimate),
    and can check only a random sample of N accounts. It is meant for very
    large follow lists.

### Logged-in owner

- **Log in with Bluesky** (atproto OAuth, no passwords; the app only asks for
  permission to delete follow records).
- When you are logged in as the account you scanned, select rows (one by one
  or "select all in current filter") and **unfollow in bulk**. The app deletes
  your `app.bsky.graph.follow` records on your PDS, one at a time and paced
  (one every 0.75 s, with backoff when the server asks), after a confirmation
  dialog with the count. A live log shows each step, there is a stop button,
  and a summary at the end.
- **Dry run** (on by default) shows exactly what would be unfollowed without
  changing anything. It also works without logging in.
- **Keep list:** mark accounts you never want suggested for unfollowing. They
  can't be selected and are always skipped. The list is stored in your browser
  and can be exported and imported as JSON.

### Being polite to the API

- 4 parallel requests by default (adjustable from 1 to 8 under "Advanced").
- Exponential backoff with jitter on 429 and 5xx responses and network errors.
- `retry-after` and `ratelimit-*` headers are honored: when the rate-limit
  window is nearly used up, every request waits until it resets.
- A fresh cache means a rescan only asks for what changed.
- Accounts with zero posts are not fetched in modes where reposts don't count.

## Privacy

Everything runs in your browser. There is no backend.

- Requests go straight from your browser to the Bluesky public API
  (`public.api.bsky.app`). Full scans and unfollowing also talk to the PLC
  directory (`plc.directory`) and the scanned account's PDS. Logging in talks
  to your own PDS / authorization server.
- Nothing is sent to any server of ours. No analytics, no tracking, no
  third-party scripts or fonts.
- Scan results, the keep list and your preferences stay in this browser
  (IndexedDB and localStorage). You can delete saved scans from the page.
- OAuth tokens are managed by `@atproto/oauth-client-browser` and stored in
  your browser's IndexedDB. The OAuth code is only downloaded when you log in.

## Running locally

Requirements: Node.js 20 or newer.

```sh
npm install
npm run dev
```

Then open <http://127.0.0.1:5173/>. Use `127.0.0.1`, not `localhost`: atproto
OAuth requires a loopback IP for local development (visiting `localhost`
redirects automatically). On `127.0.0.1` the app uses the OAuth *loopback
client*, so logging in works locally without hosting `client-metadata.json`.

## Tests

```sh
npm test               # unit tests (Vitest)
npm run typecheck      # TypeScript
npm run test:contract  # opt-in contract test against the real public API
```

The unit tests cover pagination, the concurrency pool, backoff and rate-limit
handling, last-activity computation for each mode, inactivity sorting and
filtering, ghost heuristics, CSV export, cache staleness and IndexedDB storage,
the scan itself (incremental rescans, quick scans, cancelling), the unfollow
queue against a fake PDS, the keep list, i18n, and the OAuth client metadata.

The contract test is skipped unless `QUIET_CONTRACT=1` is set. It makes about a
dozen requests to check that the response fields the app relies on still exist.
Set `QUIET_CONTRACT_ACTOR` to use an account other than `bsky.app`.

## Building

```sh
npm run build
```

This writes a static site to `dist/`, with relative asset paths, so it works
from any static host and any sub-path. See [DEPLOY.md](DEPLOY.md) for hosting
and for where `client-metadata.json` must live.

Build-time settings (environment variables or a `.env.local` file):

| Variable           | Default                                            | Purpose                                  |
| ------------------ | -------------------------------------------------- | ---------------------------------------- |
| `VITE_PUBLIC_URL`  | `https://quiet.notx.blue/`                         | Public URL of the site, used for OAuth.  |
| `VITE_OAUTH_SCOPE` | `atproto repo:app.bsky.graph.follow?action=delete` | OAuth scope requested at login.          |

## Languages

English and Portuguese (Brazil). The app picks the browser language and you can
switch from the header. Strings live in `src/locales/`; a test checks that every
English key has a Portuguese translation with the same placeholders.

## Theming

The look is intentionally plain for now: system font, neutral colors, light and
dark themes (following the system, or chosen from the header). Every color is
a CSS custom property at the top of `src/styles.css`, so the design can be
changed without touching the rest.

## Project layout

```
src/lib/       API clients, scan logic, cache, unfollow queue (no DOM)
src/ui/        DOM helpers and row formatting
src/locales/   English and Portuguese strings
src/main.ts    wires the page together
test/          unit tests; test/contract has the opt-in live API test
public/        static files copied as-is (_headers, favicon)
```

## License

[GPL-3.0](LICENSE).
