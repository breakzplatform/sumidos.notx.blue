# Deploying

quiet.notx.blue is a static site. There is no server-side code.

## 1. Build for your URL

The public URL matters for login: the OAuth client ID and redirect URI are
derived from it.

```sh
VITE_PUBLIC_URL=https://quiet.notx.blue/ npm run build
```

`VITE_PUBLIC_URL` defaults to `https://quiet.notx.blue/`. If you host a copy
somewhere else, set it to that URL (sub-paths work, e.g.
`https://example.org/tools/quiet/`). Scanning works on any URL; only logging
in depends on this value being right.

The result is in `dist/`:

```
dist/
  index.html
  client-metadata.json   <- OAuth client metadata, generated from VITE_PUBLIC_URL
  theme-init.js
  favicon.svg
  _headers               <- security headers for Netlify / Cloudflare Pages
  assets/                <- hashed JS and CSS
```

## 2. Upload `dist/` to any static host

Netlify, Cloudflare Pages, GitHub Pages, S3, nginx, Caddy... anything that
serves files. The app is a single page with no client-side routes, so no
rewrite rules (`_redirects`) are needed.

## `client-metadata.json`

atproto OAuth identifies the app by the URL of its client metadata document.
For the production build that URL is:

```
https://quiet.notx.blue/client-metadata.json
```

Requirements:

- It must be served at exactly `<VITE_PUBLIC_URL>client-metadata.json`, over
  HTTPS, with status 200 and `Content-Type: application/json`.
- Its `client_id` field must equal its own URL, and `redirect_uris` must
  contain `VITE_PUBLIC_URL` itself. The build generates it this way, so don't
  edit it by hand; rebuild with the right `VITE_PUBLIC_URL` instead.
- It must not be behind a redirect (for example `http` to `https`, or a
  missing trailing slash on the page URL).

You can check it after deploying:

```sh
curl -i https://quiet.notx.blue/client-metadata.json
```

## Headers

`public/_headers` (copied to `dist/_headers`) is read by Netlify and
Cloudflare Pages. It sets:

- a Content-Security-Policy: scripts and styles only from the site itself;
  `connect-src https:` because the app talks to the Bluesky API, the PLC
  directory and each user's own PDS, which can be on any host;
  `img-src https:` for avatars;
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`;
- `Content-Type: application/json` for `client-metadata.json`;
- long-term caching for `assets/` (file names are content-hashed).

On other hosts, set equivalent headers in the server config. For nginx:

```nginx
location = /client-metadata.json {
  default_type application/json;
  add_header Access-Control-Allow-Origin *;
}
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
add_header Referrer-Policy no-referrer;
```

## Local testing of the production build

```sh
npm run build && npm run preview
```

then open <http://127.0.0.1:4173/>. On a loopback address the app uses the
atproto loopback OAuth client instead of `client-metadata.json`, so login works
locally too.
