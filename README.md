# sumidos.notx.blue

Find out who a Bluesky account follows that stopped posting. Log in to
unfollow them from your own list, in bulk, with an undo.

- `sumidos.notx.blue` is the site, in Brazilian Portuguese.
- `crickets.notx.blue` is the same site, in English.

Part of [notx.blue](https://notx.blue).

## How it works

Everything runs in the browser. There is no server of ours.

1. Type any public handle. The page lists who it follows (public AppView,
   `app.bsky.graph.getFollows`) and reads each account's latest activity
   (`app.bsky.feed.getAuthorFeed`).
2. When the read ends, the list shows most quiet first. Filters (kind, day
   range, replies and reposts) only re-filter what was already read. The
   current view exports to CSV.

### Your own list

Logging in (atproto OAuth, scope
`atproto repo:app.bsky.graph.follow?action=create&action=delete`) unlocks
unfollowing on the logged-in account's own list. The scan also reads your
follow records from your PDS, so deactivated or deleted accounts show up.
Deletes go through `com.atproto.repo.applyWrites`, 200 per call. "Undo"
works while the tab is open; after that, the "Unfollowed" panel follows them
again with the original date.

Without a session, nothing but public AppView data for the typed handle is
read.

## Privacy

Nothing is sent to our servers. This browser keeps the language, the theme,
the last list read and the accounts unfollowed here. With login, the session
belongs to the tab that logged in: other tabs don't use it, logging out
revokes it, and a session left behind by a closed tab is revoked on the next
visit.

The full policy, shared by every notx.blue app, is at
<https://notx.blue/privacy>.

## Development

Node 24.

```sh
npm ci
npm run dev        # http://127.0.0.1:5173/ (loopback OAuth client)
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run dev` also serves fixed states for screenshots, with made-up
accounts and no requests: `?fixture=loading`, `?fixture=results`,
`?fixture=confirm`, plus `&theme=dark|terminal` and `&lang=en|pt-BR`. The
fixtures are never part of the production build.

`npm run test:contract` checks the fields this app depends on against the
live public API (a dozen requests).

See [DEPLOY.md](DEPLOY.md) for hosting and OAuth details.

## License

[GPL-3.0-only](LICENSE). See [NOTICE](NOTICE).
