# Deploying

A static site: `npm run build` writes `dist/`, which any static host can
serve. Netlify reads `netlify.toml` and `dist/_headers`.

## OAuth: one client per origin

The same build is served on every allowed host. Each host has its own client
metadata document, and its `client_id` is that document's own URL:

```
https://sumidos.notx.blue/oauth/sumidos.notx.blue.json
https://crickets.notx.blue/oauth/crickets.notx.blue.json
```

The redirect URI is the host's root (`https://<host>/`). At runtime the page
picks the document for `location.host`; any host outside the allowlist
(`SITE_HOSTS` in `src/lib/site.ts`, plus `VITE_OAUTH_EXTRA_HOSTS`) gets no
login button.

## Two names

`sumidos.notx.blue` (Portuguese) and `crickets.notx.blue` (English) are the
same build. The host picks the name in the wordmark and title and the opening
language (`src/lib/site.ts`); the language button still switches and is
remembered per browser. Any other host opens in Portuguese and is named after
the language showing. Both hosts must point at the same deploy (on Netlify:
one site, `crickets.notx.blue` as a domain alias).

Link previews don't run the app, so the build writes the `<head>` (title,
description, canonical, Open Graph and Twitter tags) per host:
`dist/index.html` for `sumidos.notx.blue` and `dist/index.en.html` for
`crickets.notx.blue`. `netlify.toml` rewrites `https://crickets.notx.blue/`
to `/index.en.html`; another host needs the same rewrite. Check it with:

```sh
curl -s https://crickets.notx.blue/ | grep og:site_name
``` Loopback addresses
(`npm run dev`, `npm run preview`) use the atproto loopback client.

To test login on another host, such as a deploy preview, add it at build
time:

```sh
VITE_OAUTH_EXTRA_HOSTS=preview--example.netlify.app npm run build
```

## Subpath builds

The app also runs under a subpath, e.g. a staging server at
`https://staging.joselito.dev/sumidos/`. Vite's `--base` sets the asset URLs,
the home link, the OAuth redirect URI and where the metadata documents live:

```sh
VITE_OAUTH_EXTRA_HOSTS=staging.joselito.dev npm run build -- --base=/sumidos/
```

That writes `dist/oauth/staging.joselito.dev.json` with
`client_id: https://staging.joselito.dev/sumidos/oauth/staging.joselito.dev.json`
and `redirect_uris: ["https://staging.joselito.dev/sumidos/"]`; copy `dist/`
to the server's `/sumidos/` and serve the JSON as `application/json`. Drop
`VITE_OAUTH_EXTRA_HOSTS` for a staging copy without login. The session lives
in the origin's storage, which other apps on the same staging host share.

Renaming a host invalidates its sessions, so the hosts above are the ones to
keep.

## Headers

`public/_headers`:

- CSP: scripts and styles only from the site; images from `cdn.bsky.app`;
  fonts from `static.joseli.to`; `connect-src 'self' https:` because a
  logged-in owner talks to their own PDS, which can be on any host;
- `Referrer-Policy: no-referrer`, so a handle in `?handle=` never leaks to
  the profile links;
- `Content-Type: application/json` and CORS for `/oauth/*`.

## Checks after a deploy

```sh
curl -sI https://sumidos.notx.blue/oauth/sumidos.notx.blue.json
curl -s  https://sumidos.notx.blue/oauth/sumidos.notx.blue.json | jq .client_id
```
