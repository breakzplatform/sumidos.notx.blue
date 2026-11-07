/**
 * Handle/DID input parsing.
 */

const HANDLE_RE =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const DID_RE = /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;

export function isDid(value: string): boolean {
  return DID_RE.test(value);
}

export function isHandle(value: string): boolean {
  return value.length <= 253 && HANDLE_RE.test(value);
}

/**
 * Accepts "@alice.bsky.social", "alice.bsky.social", a DID, or a bsky.app
 * profile URL, and returns a normalized handle or DID. Returns null when
 * the input is neither.
 */
export function normalizeActorInput(input: string): string | null {
  let value = input.trim();
  const url = /^https?:\/\/(?:[^/]+)\/profile\/([^/?#]+)/i.exec(value);
  if (url) value = decodeURIComponent(url[1]!);
  value = value.replace(/^@/, '');
  if (isDid(value)) return value;
  value = value.toLowerCase();
  if (isHandle(value)) return value;
  return null;
}
