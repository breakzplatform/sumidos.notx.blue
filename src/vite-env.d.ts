/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated extra hosts allowed to log in, e.g. a preview deploy. */
  readonly VITE_OAUTH_EXTRA_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
