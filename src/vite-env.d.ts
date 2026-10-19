/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL the site is served from, e.g. https://quiet.notx.blue/ */
  readonly VITE_PUBLIC_URL?: string;
  /** OAuth scope to request. */
  readonly VITE_OAUTH_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
