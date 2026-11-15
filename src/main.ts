import './styles.css';

import { DEFAULT_COUNT_RULES } from './lib/activity';
import { AppViewReader, PdsRepoClient, PUBLIC_APPVIEW, type RepoClient } from './lib/bsky';
import { rowsToCsv } from './lib/csv';
import { I18n, isLocale, type Locale } from './lib/i18n';
import { normalizeActorInput } from './lib/identity';
import { DEFAULT_MIN_DAYS, isMinDays, visibleRows, type Filters, type Row } from './lib/inactivity';
import type { OAuthSession } from './lib/oauth';
import { allowedHosts, oauthTarget, parseHostList } from './lib/oauth-metadata';
import { ActorError, LARGE_LIST, resumeFeeds, scan, type ScanPhase, type ScanProgress, type ScanSubject } from './lib/scan';
import { Selection } from './lib/selection';
import { localeForHost, siteNameFor } from './lib/site';
import type { Account } from './lib/types';
import {
  indexFollowRecords,
  keepForUndo,
  planRefollow,
  planUnfollow,
  runBatches,
  type BatchProgress,
  type StoredFollow,
} from './lib/unfollow';
import { serviceFetchHandler, XrpcClient } from './lib/xrpc';
import { byId, debounce, download, h, safeStorage } from './ui/dom';
import { rowText } from './ui/format';
import { cycleTheme, getTheme, nextTheme, onRemoteThemeChange, type Theme } from './ui/theme';

// ---------------------------------------------------------------------------
// Setup

const PAGE = 200;
const LANG_KEY = 'lang';
const BUG_FORM = { en: 'https://q.joseli.to/forms/notx-blue-bugs', 'pt-BR': 'https://q.joseli.to/forms/notx-blue-bugs-pt' };

const storage = safeStorage();
const host = location.hostname;
const i18n = new I18n(initialLocale());
const t = i18n.t;
const oauth = oauthTarget(location, allowedHosts(parseHostList(import.meta.env.VITE_OAUTH_EXTRA_HOSTS)));

const appview = new XrpcClient(serviceFetchHandler(PUBLIC_APPVIEW), {
  onRetry: (e) => {
    if (e.status === 429) showWait(e.delayMs);
  },
});
const reader = new AppViewReader(appview);

function initialLocale(): Locale {
  const saved = storage?.getItem(LANG_KEY);
  return isLocale(saved) ? saved : localeForHost(host);
}

// ---------------------------------------------------------------------------
// State

type StatusKey = { key: string; params?: Record<string, string | number> };

const state = {
  subject: null as ScanSubject | null,
  accounts: [] as Account[],
  /** The scan ran logged in as the account whose list it is. */
  owned: false,
  lastPhase: null as ScanPhase | null,
  lastActor: '',
  abort: null as AbortController | null,
  stopped: false,
  progress: null as ScanProgress | null,
  status: { key: 'status.idle' } as StatusKey,
  session: null as OAuthSession | null,
  sessionHandle: '',
  shown: PAGE,
  selection: new Selection(),
  undo: new Map<string, StoredFollow[]>(),
  undoAccounts: new Map<string, Account>(),
  undoNote: null as StatusKey[] | null,
  busyWriting: false,
};

const el = {
  actor: byId<HTMLInputElement>('actor'),
  run: byId<HTMLButtonElement>('run'),
  stop: byId<HTMLButtonElement>('stop'),
  minDays: byId<HTMLSelectElement>('min-days'),
  replies: byId<HTMLInputElement>('count-replies'),
  reposts: byId<HTMLInputElement>('count-reposts'),
  status: byId('status'),
  progress: byId('progress'),
  progressCount: byId('progress-count'),
  progressPhase: byId('progress-phase'),
  progressBar: byId<HTMLProgressElement>('progress-bar'),
  largeList: byId('large-list'),
  largeListText: byId('large-list-text'),
  wait: byId('wait'),
  results: byId('results'),
  resultsOwner: byId('results-owner'),
  resultsCount: byId('results-count'),
  resultsMeta: byId('results-meta'),
  resultsNote: byId('results-note'),
  search: byId<HTMLInputElement>('search'),
  list: byId<HTMLOListElement>('list'),
  empty: byId('empty'),
  moreBox: byId('more-box'),
  more: byId<HTMLButtonElement>('more'),
  ownerBar: byId('owner-bar'),
  markAll: byId<HTMLButtonElement>('mark-all'),
  markNone: byId<HTMLButtonElement>('mark-none'),
  unfollow: byId<HTMLButtonElement>('unfollow'),
  undoBar: byId('undo-bar'),
  undoText: byId('undo-text'),
  undoProgress: byId<HTMLProgressElement>('undo-bar-progress'),
  undo: byId<HTMLButtonElement>('undo'),
  accountBox: byId('account-box'),
  authOut: byId('auth-out'),
  authIn: byId('auth-in'),
  authWho: byId('auth-who'),
  authError: byId('auth-error'),
  signIn: byId<HTMLButtonElement>('sign-in'),
  signOut: byId<HTMLButtonElement>('sign-out'),
  privacy: byId('privacy-line'),
  language: byId<HTMLButtonElement>('language'),
  theme: byId<HTMLButtonElement>('theme'),
  dialog: byId<HTMLDialogElement>('confirm'),
  confirmTitle: byId('confirm-title'),
  confirmText: byId('confirm-text'),
  confirmList: byId<HTMLOListElement>('confirm-list'),
  confirmRun: byId('confirm-run'),
  confirmPhase: byId('confirm-phase'),
  confirmProgress: byId<HTMLProgressElement>('confirm-progress'),
  confirmGo: byId<HTMLButtonElement>('confirm-go'),
  confirmCancel: byId<HTMLButtonElement>('confirm-cancel'),
};

function filters(): Filters {
  return {
    rules: { replies: el.replies.checked, reposts: el.reposts.checked },
    minDays: isMinDays(el.minDays.value) ? (Number(el.minDays.value) as Filters['minDays']) : DEFAULT_MIN_DAYS,
    search: el.search.value,
  };
}

function isOwner(): boolean {
  return Boolean(state.owned && state.session && state.subject && state.session.sub === state.subject.did);
}

function rows(): Row[] {
  return visibleRows(state.accounts, filters(), Date.now());
}

// ---------------------------------------------------------------------------
// Static text, language, theme

const THEME_KEYS: Record<Theme, string> = { light: 'theme.light', dark: 'theme.dark', terminal: 'theme.terminal' };

function syncTheme(): void {
  const current = getTheme();
  const next = nextTheme(current);
  el.theme.textContent = t(THEME_KEYS[next]);
  el.theme.setAttribute('aria-label', t('theme.aria', { current: t(THEME_KEYS[current]), next: t(THEME_KEYS[next]) }));
}

function siteName(): string {
  return siteNameFor(host, i18n.locale);
}

function applyStatic(): void {
  const name = siteName();
  document.documentElement.lang = i18n.locale;
  document.title = t('appTitle', { host: `${name}.notx.blue` });
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'));
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n!);
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder!));
  }
  for (const option of el.minDays.options) option.textContent = t('rules.days', { count: Number(option.value) });
  byId('wordmark-name').textContent = name;
  byId('wordmark').setAttribute('aria-label', `${name}.notx.blue`);
  const other: Locale = i18n.locale === 'en' ? 'pt-BR' : 'en';
  el.language.textContent = other === 'en' ? 'english' : 'português';
  el.language.lang = other;
  byId<HTMLAnchorElement>('bug').href = BUG_FORM[i18n.locale];
  syncTheme();
  renderAll();
}

// ---------------------------------------------------------------------------
// Rendering

let frame = 0;
function scheduleRender(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderResults();
  });
}

function renderAll(): void {
  renderStatus();
  renderAuth();
  renderProgress();
  renderResults();
  renderUndo();
}

function renderStatus(): void {
  el.status.textContent = t(state.status.key, state.status.params);
  // While a scan runs, the progress panel says where it is.
  el.status.hidden = Boolean(state.abort) && state.subject !== null;
  const running = Boolean(state.abort);
  el.stop.disabled = !running;
  el.run.disabled = running || state.busyWriting;
  el.run.textContent = canContinue() ? t('search.continue') : t('search.run');
}

function canContinue(): boolean {
  if (!state.subject || state.abort) return false;
  if (normalizeActorInput(el.actor.value) !== state.lastActor) return false;
  return state.stopped || state.accounts.some((a) => a.status === 'error');
}

function renderAuth(): void {
  el.privacy.textContent = t(state.session ? 'privacy.session' : 'privacy.public');
  el.accountBox.hidden = oauth.kind === 'none';
  el.authOut.hidden = Boolean(state.session);
  el.authIn.hidden = !state.session;
  if (state.session) el.authWho.textContent = t('auth.who', { handle: state.sessionHandle || state.session.sub });
}

function setAuthError(key: string | null, params?: Record<string, string>): void {
  el.authError.hidden = !key;
  el.authError.textContent = key ? t(key, params) : '';
}

function renderProgress(): void {
  const p = state.progress;
  el.progress.hidden = !p || !state.abort;
  if (!p) return;
  const handle = state.subject?.handle ?? '';
  const phaseText: Record<ScanPhase, string> = {
    resolve: t('progress.resolve'),
    follows: t('progress.follows', { handle, done: p.done, total: p.total || p.done }),
    records: t('progress.records', { done: p.done }),
    profiles: t('progress.profiles', { done: p.done, total: p.total }),
    feeds: t('progress.feeds', { done: p.done, total: p.total }),
  };
  el.progressPhase.textContent = phaseText[p.phase];
  el.progressBar.max = Math.max(1, p.total || p.done);
  el.progressBar.value = p.done;
  el.progressCount.textContent = p.total ? t('progress.count', { done: p.done, total: p.total }) : '';
  const follows = state.subject?.followsCount ?? 0;
  el.largeList.hidden = follows < LARGE_LIST;
  el.largeListText.textContent = t('progress.large', { count: follows });
}

function initials(a: Account): string {
  const name = (a.displayName || a.handle).trim();
  const parts = name.split(/[\s.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function profileHref(a: Account): string {
  const id = a.handle && a.handle !== 'handle.invalid' && !a.handle.startsWith('did:') ? a.handle : a.did;
  return `https://bsky.app/profile/${encodeURIComponent(id)}`;
}

function rowNode(row: Row, owner: boolean): HTMLLIElement {
  const a = row.account;
  const text = rowText(row, i18n);
  const name = a.displayName?.trim() || a.handle;
  const li = h('li', { class: owner ? 'account has-check' : 'account', 'data-tone': text.tone });
  if (owner) {
    const box = h('input', { type: 'checkbox', 'data-did': a.did, 'aria-label': t('row.mark', { name }) });
    box.checked = state.selection.has(a.did);
    li.append(h('label', { class: 'check' }, box));
  }
  li.append(
    a.avatar
      ? h('img', { class: 'avatar', src: a.avatar, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' })
      : h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(a)),
    h(
      'span',
      { class: 'who' },
      h('a', { href: profileHref(a), target: '_blank', rel: 'noopener noreferrer', title: t('results.profile', { name }) }, name),
      h('span', { class: 'handle' }, a.handle.startsWith('did:') ? a.handle : `@${a.handle}`),
      h('span', { class: 'when' }, text.when),
    ),
    h('span', { class: `badge badge-${text.tone}` }, text.badge),
  );
  return li;
}

function renderResults(): void {
  const subject = state.subject;
  el.results.hidden = !subject || state.accounts.length === 0;
  if (!subject || el.results.hidden) return;

  const owner = isOwner();
  const all = rows();
  const total = state.abort ? Math.max(state.accounts.length, subject.followsCount ?? 0) : state.accounts.length;
  el.resultsOwner.textContent = t(owner ? 'results.mine' : 'results.public', { handle: subject.handle });
  el.resultsCount.textContent = t('progress.count', { done: all.length, total });
  const failed = state.accounts.filter((a) => a.status === 'error').length;
  el.resultsMeta.textContent = t('results.meta', { shown: all.length, count: total });
  const notes: string[] = [];
  if (!owner) notes.push(t('results.metaPublic', { handle: subject.handle }));
  if (failed > 0 && !state.abort) notes.push(t('results.failed', { count: failed }));
  el.resultsNote.textContent = notes.join(' ');
  el.resultsNote.hidden = notes.length === 0;

  const page = all.slice(0, state.shown);
  el.list.replaceChildren(...page.map((r) => rowNode(r, owner)));
  el.empty.hidden = all.length > 0 || Boolean(state.abort);
  el.moreBox.hidden = all.length <= page.length;
  el.more.textContent = t('results.more', { count: Math.min(PAGE, all.length - page.length) });

  el.ownerBar.hidden = !owner;
  if (owner) {
    const dids = all.map((r) => r.account.did);
    const picked = state.selection.pick(dids).length;
    el.markAll.textContent = t('owner.markAll', { count: dids.length });
    el.markAll.disabled = dids.length === 0 || state.selection.coversAll(dids);
    el.markNone.disabled = picked === 0;
    el.unfollow.textContent = t('owner.unfollow', { count: picked });
    el.unfollow.disabled = picked === 0 || state.busyWriting || Boolean(state.abort);
  }
}

function renderUndo(): void {
  const show = Boolean(state.undoNote) && isOwner();
  el.undoBar.hidden = !show;
  if (!show) return;
  el.undoText.textContent = state.undoNote!.map((n) => t(n.key, n.params)).join(' ');
  el.undo.hidden = state.undo.size === 0;
  el.undo.disabled = state.busyWriting;
}

function setStatus(key: string, params?: StatusKey['params']): void {
  state.status = params ? { key, params } : { key };
  renderStatus();
}

// ---------------------------------------------------------------------------
// 429 wait banner

let waitTimer = 0;
let waitUntil = 0;
function showWait(ms: number): void {
  waitUntil = Math.max(waitUntil, Date.now() + ms);
  const tick = () => {
    const left = Math.ceil((waitUntil - Date.now()) / 1000);
    el.wait.hidden = left <= 0;
    el.wait.textContent = t('progress.wait', { seconds: Math.max(0, left) });
    if (left <= 0) {
      clearInterval(waitTimer);
      waitTimer = 0;
    }
  };
  tick();
  if (!waitTimer) waitTimer = window.setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// Scan

function ownRepoFor(did: string): RepoClient | undefined {
  const session = state.session;
  if (!session || session.sub !== did) return undefined;
  return sessionRepo(session);
}

function sessionRepo(session: OAuthSession): RepoClient {
  return new PdsRepoClient(new XrpcClient((path, init) => session.fetchHandler(path, init)));
}

function onProgress(p: ScanProgress): void {
  state.progress = p;
  state.lastPhase = p.phase;
  renderProgress();
}

async function startScan(): Promise<void> {
  const actor = normalizeActorInput(el.actor.value);
  if (!actor) {
    setStatus('status.invalid');
    el.actor.focus();
    return;
  }
  if (canContinue()) return continueScan();

  state.abort?.abort();
  const controller = new AbortController();
  Object.assign(state, {
    abort: controller,
    subject: null,
    accounts: [],
    owned: false,
    stopped: false,
    lastActor: actor,
    lastPhase: null,
    progress: { phase: 'resolve', done: 0, total: 1 },
    shown: PAGE,
  });
  state.selection.clear();
  state.undo.clear();
  state.undoAccounts.clear();
  state.undoNote = null;
  setStatus('status.resolving', { handle: actor.replace(/^@/, '') });
  renderAll();

  const streamed = new Set<string>();
  try {
    const res = await scan(
      { reader, ownRepoFor },
      {
        actor,
        signal: controller.signal,
        onSubject: (subject) => {
          state.subject = subject;
          state.owned = Boolean(state.session && state.session.sub === subject.did);
          renderStatus();
          renderProgress();
        },
        onProgress,
        onAccount: (a) => {
          if (!streamed.has(a.did)) {
            streamed.add(a.did);
            state.accounts.push(a);
          }
          scheduleRender();
        },
      },
    );
    state.accounts = res.accounts;
    finishScan(res.cancelled);
  } catch (err) {
    state.abort = null;
    if (err instanceof ActorError) {
      setStatus(`status.${err.code}`, { handle: actor.replace(/^@/, '') });
    } else {
      setStatus('status.error', { message: err instanceof Error ? err.message : String(err) });
    }
    renderAll();
  }
}

function finishScan(cancelled: boolean): void {
  state.abort = null;
  state.stopped = cancelled;
  el.wait.hidden = true;
  const total = state.accounts.length;
  const read = state.accounts.filter((a) => a.feed || a.status !== 'active').length;
  if (cancelled) setStatus('status.stopped', { done: read, total });
  else if (total === 0) setStatus('status.none', { handle: state.subject?.handle ?? '' });
  else setStatus('status.done', { count: total });
  renderAll();
}

async function continueScan(): Promise<void> {
  if (state.lastPhase !== 'feeds' && state.stopped) {
    // Stopped before the list was complete: start over.
    state.stopped = false;
    state.subject = null;
    return startScan();
  }
  const controller = new AbortController();
  state.abort = controller;
  state.stopped = false;
  setStatus('progress.feeds', { done: 0, total: 0 });
  renderAll();
  const { cancelled } = await resumeFeeds({ reader }, state.accounts, {
    signal: controller.signal,
    onProgress,
    onAccount: scheduleRender,
  });
  finishScan(cancelled);
}

// ---------------------------------------------------------------------------
// Unfollow and undo

let lastOpener: HTMLElement | null = null;
let writeAbort: AbortController | null = null;

function openConfirm(): void {
  if (!isOwner() || !state.subject) return;
  const targets = state.selection.pick(rows().map((r) => r.account.did));
  if (targets.length === 0) return;
  const byDid = new Map(state.accounts.map((a) => [a.did, a]));
  el.confirmTitle.textContent = t('confirm.title', { count: targets.length });
  el.confirmText.textContent = t('confirm.text', { handle: state.subject.handle });
  el.confirmList.replaceChildren(
    ...targets.map((did) => {
      const a = byDid.get(did);
      return h('li', {}, a && !a.handle.startsWith('did:') ? `@${a.handle}` : did);
    }),
  );
  el.confirmGo.textContent = t('confirm.go', { count: targets.length });
  el.confirmGo.disabled = false;
  el.confirmGo.hidden = false;
  el.confirmCancel.textContent = t('confirm.cancel');
  el.confirmRun.hidden = true;
  el.confirmGo.onclick = () => void runUnfollow(targets);
  lastOpener = el.unfollow;
  el.dialog.showModal();
  el.confirmCancel.focus();
}

function closeConfirm(): void {
  if (el.dialog.open) el.dialog.close();
  lastOpener?.focus();
}

function confirmProgress(p: BatchProgress): void {
  el.confirmPhase.textContent = t('confirm.running', { done: p.done + p.failed, total: p.total });
  el.confirmProgress.max = Math.max(1, p.total);
  el.confirmProgress.value = p.done + p.failed;
}

async function runUnfollow(targets: string[]): Promise<void> {
  const session = state.session;
  if (!session || !isOwner()) return closeConfirm();
  const owner = session.sub;
  const repo = sessionRepo(session);
  writeAbort = new AbortController();
  state.busyWriting = true;
  el.confirmGo.hidden = true;
  el.confirmCancel.textContent = t('confirm.stop');
  el.confirmRun.hidden = false;
  el.confirmPhase.textContent = t('confirm.indexing', { count: 0 });
  el.confirmProgress.removeAttribute('value');
  renderResults();

  try {
    const index = await indexFollowRecords(repo, owner, writeAbort.signal, (count) => {
      el.confirmPhase.textContent = t('confirm.indexing', { count });
    });
    const plan = planUnfollow(targets, index);
    confirmProgress({ done: 0, failed: 0, total: plan.batches.reduce((n, b) => n + b.subjects.length, 0) });
    const run = await runBatches({ owner, repo, batches: plan.batches, signal: writeAbort.signal, onProgress: confirmProgress });

    for (const [did, records] of keepForUndo(plan, run.done)) state.undo.set(did, records);
    const gone = new Set(run.done);
    for (const a of state.accounts) if (gone.has(a.did)) state.undoAccounts.set(a.did, a);
    state.accounts = state.accounts.filter((a) => !gone.has(a.did));
    state.selection.forget(run.done);
    state.selection.forget(plan.notFollowing);

    const note: StatusKey[] = [{ key: 'undo.text', params: { count: run.done.length } }];
    if (run.failed.length) note.push({ key: 'undo.failed', params: { count: run.failed.length } });
    if (plan.notFollowing.length) note.push({ key: 'undo.missing', params: { count: plan.notFollowing.length } });
    state.undoNote = note;
  } catch (err) {
    state.undoNote = [{ key: 'confirm.error', params: { message: err instanceof Error ? err.message : String(err) } }];
  } finally {
    state.busyWriting = false;
    writeAbort = null;
    closeConfirm();
    renderAll();
  }
}

async function runUndo(): Promise<void> {
  const session = state.session;
  if (!session || !isOwner() || state.undo.size === 0) return;
  state.busyWriting = true;
  renderAll();
  el.undoProgress.hidden = false;
  const batches = planRefollow(state.undo);
  const onProgress = (p: BatchProgress) => {
    el.undoText.textContent = t('undo.running', { done: p.done + p.failed, total: p.total });
    el.undoProgress.max = Math.max(1, p.total);
    el.undoProgress.value = p.done + p.failed;
  };
  onProgress({ done: 0, failed: 0, total: state.undo.size });
  const run = await runBatches({ owner: session.sub, repo: sessionRepo(session), batches, onProgress });
  for (const did of run.done) {
    state.undo.delete(did);
    const a = state.undoAccounts.get(did);
    if (a) state.accounts.push(a);
    state.undoAccounts.delete(did);
  }
  const note: StatusKey[] = [{ key: 'undo.done', params: { count: run.done.length } }];
  if (run.failed.length) note.push({ key: 'undo.failed', params: { count: run.failed.length } });
  state.undoNote = note;
  state.busyWriting = false;
  el.undoProgress.hidden = true;
  renderAll();
}

// ---------------------------------------------------------------------------
// Login

async function loadSession(): Promise<void> {
  if (oauth.kind === 'none') return;
  const hasCallback = /[#&](state)=/.test(location.hash);
  let tabSession = false;
  try {
    tabSession = Boolean(sessionStorage.getItem('sumidos.session'));
  } catch {
    // No sessionStorage.
  }
  const leftover = storage?.getItem('@@atproto/oauth-client-browser(sub)');
  // Only download the OAuth code when there is something to do with it.
  if (!hasCallback && !tabSession && !leftover) return;
  try {
    const { initSession } = await import('./lib/oauth');
    const session = await initSession(oauth);
    if (session) await onSession(session);
  } catch (err) {
    setAuthError('auth.failed', { message: err instanceof Error ? err.message : String(err) });
  }
}

async function onSession(session: OAuthSession): Promise<void> {
  state.session = session;
  try {
    state.sessionHandle = (await reader.getProfile(session.sub)).handle;
  } catch {
    state.sessionHandle = '';
  }
  if (!el.actor.value) el.actor.value = state.sessionHandle || session.sub;
  renderAll();
}

async function signIn(): Promise<void> {
  if (oauth.kind === 'none') return setAuthError('auth.unavailable');
  const handle = normalizeActorInput(el.actor.value);
  if (!handle) {
    setAuthError('auth.needHandle');
    el.actor.focus();
    return;
  }
  setAuthError('auth.redirecting');
  el.signIn.disabled = true;
  try {
    const { signIn: redirect } = await import('./lib/oauth');
    await redirect(oauth, handle);
  } catch (err) {
    el.signIn.disabled = false;
    setAuthError('auth.failed', { message: err instanceof Error ? err.message : String(err) });
  }
}

async function signOut(): Promise<void> {
  const session = state.session;
  if (!session || oauth.kind === 'none') return;
  const { signOut: end } = await import('./lib/oauth');
  await end(oauth, session).catch(() => {});
  Object.assign(state, { session: null, sessionHandle: '', owned: false, undoNote: null });
  state.undo.clear();
  state.undoAccounts.clear();
  state.selection.clear();
  renderAll();
}

// ---------------------------------------------------------------------------
// Events

byId<HTMLFormElement>('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  void startScan();
});
el.stop.addEventListener('click', () => state.abort?.abort());
el.actor.addEventListener('input', () => {
  setAuthError(null);
  renderStatus();
});
for (const control of [el.minDays, el.replies, el.reposts]) {
  control.addEventListener('change', () => {
    state.shown = PAGE;
    renderResults();
  });
}
el.search.addEventListener(
  'input',
  debounce(() => {
    state.shown = PAGE;
    renderResults();
  }, 120),
);
el.more.addEventListener('click', () => {
  state.shown += PAGE;
  renderResults();
});
el.list.addEventListener('change', (e) => {
  const box = e.target;
  if (!(box instanceof HTMLInputElement) || !box.dataset.did) return;
  state.selection.set(box.dataset.did, box.checked);
  renderResults();
});
el.markAll.addEventListener('click', () => {
  state.selection.markAll(rows().map((r) => r.account.did));
  renderResults();
});
el.markNone.addEventListener('click', () => {
  state.selection.clear();
  renderResults();
});
el.unfollow.addEventListener('click', openConfirm);
el.confirmCancel.addEventListener('click', () => {
  if (writeAbort) writeAbort.abort();
  else closeConfirm();
});
el.dialog.addEventListener('cancel', (e) => {
  // Esc while writing stops the run instead of hiding its progress.
  if (writeAbort) {
    e.preventDefault();
    writeAbort.abort();
  }
});
el.dialog.addEventListener('close', () => lastOpener?.focus());
el.undo.addEventListener('click', () => void runUndo());
byId('csv').addEventListener('click', () => {
  const handle = state.subject?.handle ?? 'list';
  const date = new Date().toISOString().slice(0, 10);
  download(`${siteName()}-${handle}-${date}.csv`, rowsToCsv(rows()), 'text/csv;charset=utf-8');
});
el.signIn.addEventListener('click', () => void signIn());
el.signOut.addEventListener('click', () => void signOut());
el.language.addEventListener('click', () => {
  const next: Locale = i18n.locale === 'en' ? 'pt-BR' : 'en';
  i18n.setLocale(next);
  try {
    storage?.setItem(LANG_KEY, next);
  } catch {
    // The choice lasts for this page view.
  }
  applyStatic();
});
el.theme.addEventListener('click', () => {
  cycleTheme();
  syncTheme();
});
onRemoteThemeChange(syncTheme);

// ---------------------------------------------------------------------------
// Start

// ?handle= only fills the field; it never starts a lookup by itself.
const fromUrl = new URLSearchParams(location.search).get('handle');
if (fromUrl) el.actor.value = fromUrl;
el.replies.checked = DEFAULT_COUNT_RULES.replies;
el.reposts.checked = DEFAULT_COUNT_RULES.reposts;
el.minDays.value = String(DEFAULT_MIN_DAYS);
applyStatic();
void loadSession();

if (import.meta.env.DEV) {
  void import('./dev/fixtures').then((m) => m.install({ state, renderAll, openConfirm, showWait }));
}
