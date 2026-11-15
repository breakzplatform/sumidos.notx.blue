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
   (`app.bsky.feed.getAuthorFeed`, one item, a few more pages only when the
   newest item is a reply or a repost).
2. Results stream in while the scan runs, most quiet first: deactivated or
   suspended, never posted, then by days without posting. The threshold
   (30/90/180/365 days, default 90) and the "count replies" (on) and "count
   reposts" (off) toggles only re-filter what was already read.
3. From 500 follows the page warns that the scan takes a while. Four
   requests at a time; on a 429 every request waits together, and the wait
   is shown.

### Your own list

Logging in (atproto OAuth, scope
`atproto repo:app.bsky.graph.follow?action=create&action=delete`) unlocks
unfollowing, and only when the list on screen is the logged-in account's:

- the scan also lists your follow records from your PDS, which brings back
  accounts the public AppView hides (deactivated, suspended, deleted);
- mark accounts one by one or all in the current filter; the confirmation
  shows the total and every handle;
- deletes go through `com.atproto.repo.applyWrites`, 200 per call, paced;
- "Undo" writes the same records back (same keys, same dates) while the tab
  stays open.

Without a session, nothing but public AppView data for the typed handle is
read.

## Privacy

Nothing is stored or sent to our servers. The browser keeps the language and
theme. With login, the session belongs to the tab that logged in: other tabs
don't use it, logging out revokes it, and a session left behind by a closed
tab is revoked on the next visit.

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
