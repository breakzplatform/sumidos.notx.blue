/**
 * Handle/DID input parsing and DID document resolution.
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

export interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: { id: string; type: string; serviceEndpoint: string | Record<string, unknown> }[];
}

export function didDocumentUrl(did: string, plcDirectory = 'https://plc.directory'): string {
  if (did.startsWith('did:plc:')) return `${plcDirectory}/${encodeURIComponent(did)}`;
  if (did.startsWith('did:web:')) {
    const host = decodeURIComponent(did.slice('did:web:'.length));
    if (host.includes(':') || host.includes('/')) throw new Error(`Unsupported did:web: ${did}`);
    return `https://${host}/.well-known/did.json`;
  }
  throw new Error(`Unsupported DID method: ${did}`);
}

export async function resolveDidDocument(
  did: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
  signal?: AbortSignal,
): Promise<DidDocument> {
  const res = await fetchImpl(didDocumentUrl(did), { signal: signal ?? null });
  if (!res.ok) throw new Error(`Could not resolve ${did} (HTTP ${res.status})`);
  const doc = (await res.json()) as DidDocument;
  if (doc.id !== did) throw new Error(`DID document mismatch for ${did}`);
  return doc;
}

/** The account's PDS URL from its DID document. */
export function pdsEndpoint(doc: DidDocument): string | undefined {
  const svc = doc.service?.find(
    (s) => (s.id === '#atproto_pds' || s.id === `${doc.id}#atproto_pds`) && s.type === 'AtprotoPersonalDataServer',
  );
  return typeof svc?.serviceEndpoint === 'string' ? svc.serviceEndpoint : undefined;
}
