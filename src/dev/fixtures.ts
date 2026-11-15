/**
 * Development only (never in the production bundle): `?fixture=<name>` puts
 * the page in a fixed state with made-up accounts, for screenshots and
 * manual checks. Names: loading, results, confirm. No request is made.
 */
import type { OAuthSession } from '../lib/oauth';
import type { ScanProgress } from '../lib/scan';
import type { Account } from '../lib/types';

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

const SAMPLE: Account[] = [
  { did: 'did:plc:ex1', handle: 'arquivo-mudo.example', displayName: 'Arquivo Mudo', status: 'deactivated' },
  { did: 'did:plc:ex2', handle: 'nunca-poste.example', displayName: 'Nunca Poste', status: 'active', feed: { complete: true } },
  {
    did: 'did:plc:ex3',
    handle: 'velho-diario.example',
    displayName: 'Velho Diário',
    status: 'active',
    feed: { lastPost: ago(812), complete: true },
  },
  {
    did: 'did:plc:ex4',
    handle: 'radio-calada.example',
    displayName: 'Rádio Calada',
    status: 'active',
    feed: { lastPost: ago(400), lastRepost: ago(20), complete: true },
  },
  {
    did: 'did:plc:ex5',
    handle: 'so-respostas.example',
    displayName: 'Só Respostas',
    status: 'active',
    feed: { lastReply: ago(3), oldestSeen: ago(240), complete: false },
  },
  { did: 'did:plc:ex6', handle: 'ferias-longas.example', displayName: 'Férias Longas', status: 'active', feed: { lastPost: ago(190), complete: true } },
  { did: 'did:plc:ex7', handle: 'cafe-frio.example', displayName: 'Café Frio', status: 'active', feed: { lastPost: ago(121), complete: true } },
  { did: 'did:plc:ex8', handle: 'sempre-aqui.example', displayName: 'Sempre Aqui', status: 'active', feed: { lastPost: ago(1), complete: true } },
  { did: 'did:plc:ex9', handle: 'banida.example', status: 'takendown' },
];

interface Hooks {
  state: {
    subject: { did: string; handle: string; followsCount?: number } | null;
    accounts: Account[];
    owned: boolean;
    abort: AbortController | null;
    progress: ScanProgress | null;
    status: { key: string; params?: Record<string, string | number> };
    session: OAuthSession | null;
    sessionProfile: { handle: string; displayName?: string; avatar?: string } | null;
    selection: { markAll(dids: Iterable<string>): void };
  };
  renderAll(): void;
  openConfirm(): void;
  showWait(ms: number): void;
}

export function install(hooks: Hooks): void {
  const params = new URLSearchParams(location.search);
  // ?theme= and ?lang= set the stored preferences first, for screenshots.
  let reload = false;
  for (const key of ['theme', 'lang'] as const) {
    const value = params.get(key);
    if (value && localStorage.getItem(key) !== value) {
      localStorage.setItem(key, value);
      reload = true;
    }
  }
  if (reload) return location.reload();
  const name = params.get('fixture');
  if (!name || name === 'empty') return;
  const { state } = hooks;
  const owner = name === 'confirm';
  const subject = { did: 'did:plc:you', handle: 'voce.example', followsCount: name === 'loading' ? 2140 : SAMPLE.length };
  (document.getElementById('actor') as HTMLInputElement).value = subject.handle;
  state.subject = subject;

  if (owner) {
    state.session = { sub: subject.did, fetchHandler: () => Promise.reject(new Error('fixture')) } as unknown as OAuthSession;
    state.sessionProfile = { handle: subject.handle, displayName: 'Você' };
    state.owned = true;
  }

  if (name === 'loading') {
    state.abort = new AbortController();
    state.accounts = SAMPLE.slice(0, 4).map((a) => structuredClone(a));
    state.progress = { phase: 'feeds', done: 812, total: 2140 };
    hooks.renderAll();
    hooks.showWait(42_000);
    return;
  }

  state.accounts = SAMPLE.map((a) => structuredClone(a));
  state.status = { key: 'status.done', params: { count: SAMPLE.length } };
  hooks.renderAll();
  if (owner) {
    state.selection.markAll(['did:plc:ex1', 'did:plc:ex2', 'did:plc:ex3', 'did:plc:ex4']);
    hooks.renderAll();
    hooks.openConfirm();
  }
}
