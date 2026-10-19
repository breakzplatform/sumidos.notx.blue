import './styles.css';

import { Allowlist } from './lib/allowlist';
import { isAbortError } from './lib/backoff';
import { AppViewReader, PdsRepoClient, PUBLIC_APPVIEW, type RepoClient } from './lib/bsky';
import { createScanStore, DEFAULT_MAX_AGE_MS } from './lib/cache';
import { accountsToCsv, profileUrl } from './lib/csv';
import { applyTranslations, I18n, LOCALES, pickLocale, type Locale } from './lib/i18n';
import { normalizeActorInput, pdsEndpoint, resolveDidDocument } from './lib/identity';
import { DEFAULT_FILTERS, filterAccounts, sortAccounts, type Filters, type SortDir, type SortKey } from './lib/inactivity';
import { DEFAULT_OAUTH_SCOPE, DEFAULT_PUBLIC_URL } from './lib/oauth-metadata';
import type { OAuthConfig, OAuthSession } from './lib/oauth';
import { ActorError, scan, type ScanProgress } from './lib/scan';
import type { Account, ActivityMode } from './lib/types';
import { runUnfollow, type UnfollowEvent } from './lib/unfollow';
import { RateGate, serviceFetchHandler, XrpcClient } from './lib/xrpc';
import { byId, debounce, download, h, safeStorage } from './ui/dom';
import { activityText, badgesFor } from './ui/format';

// ---------------------------------------------------------------------------
// Configuration

const oauthConfig: OAuthConfig = {
  publicUrl: import.meta.env.VITE_PUBLIC_URL || DEFAULT_PUBLIC_URL,
  scope: import.meta.env.VITE_OAUTH_SCOPE || DEFAULT_OAUTH_SCOPE,
};
const PAGE_SIZE = 100;
const MIN_DAYS_PRESETS = [0, 30, 90, 180, 365];
const UNFOLLOW_INTERVAL_MS = 750;
const SESSION_FLAG = 'quiet.hasSession';

// ---------------------------------------------------------------------------
// State

const storage = safeStorage();
const i18n = new I18n(initialLocale());
const t = i18n.t;
const allowlist = new Allowlist(storage);
const store = createScanStore();

interface Loaded {
  did: string;
  handle: string;
  accounts: Account[];
  scannedAt: number;
}

const state = {
  result: null as Loaded | null,
  filters: { ...DEFAULT_FILTERS } as Filters,
  customDays: false,
  sortKey: 'inactivity' as SortKey,
  sortDir: 'desc' as SortDir,
  selection: new Set<string>(),
  visible: PAGE_SIZE,
  session: null as OAuthSession | null,
  sessionHandle: '',
  scanAbort: null as AbortController | null,
  runAbort: null as AbortController | null,
  running: false,
  lastStatus: null as null | (() => string),
};

let retryText = '';
const appview = new XrpcClient(serviceFetchHandler(PUBLIC_APPVIEW), {
  gate: new RateGate(5),
  onRetry: (e) => {
    retryText = t('scan.retrying', { seconds: Math.ceil(e.delayMs / 1000) });
    byId('progress-retry').textContent = retryText;
  },
});
const reader = new AppViewReader(appview);

function initialLocale(): Locale {
  const saved = storage?.getItem('quiet.lang');
  if (saved && saved in LOCALES) return saved as Locale;
  return pickLocale(navigator.languages ?? [navigator.language]);
}

/** Repo client for reading someone's PDS without logging in. */
async function publicRepoFor(did: string, signal?: AbortSignal): Promise<RepoClient> {
  const doc = await resolveDidDocument(did, undefined, signal);
  const pds = pdsEndpoint(doc);
  if (!pds) throw new Error(`No PDS found for ${did}`);
  return new PdsRepoClient(new XrpcClient(serviceFetchHandler(pds)));
}

function isOwner(): boolean {
  return Boolean(state.session && state.result && state.session.sub === state.result.did);
}

// ---------------------------------------------------------------------------
// Static text, language and theme

function applyStatic(): void {
  document.documentElement.lang = i18n.locale;
  applyTranslations(document, t);
  const sortLabels: Record<SortKey, string> = {
    name: t('col.account'),
    inactivity: t('col.lastActivity'),
    followers: t('col.followers'),
    following: t('col.following'),
    posts: t('col.posts'),
  };
  for (const th of document.querySelectorAll<HTMLTableCellElement>('th[data-sort]')) {
    const key = th.dataset.sort as SortKey;
    const active = state.sortKey === key;
    th.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    const arrow = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    th.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'sort', 'data-sort-key': key, title: t('col.sortBy', { column: sortLabels[key] }) },
        sortLabels[key],
        arrow ? h('span', { 'aria-hidden': 'true' }, arrow) : null,
      ),
    );
  }
  renderMinDaysOptions();
}

function setupLanguageAndTheme(): void {
  const lang = byId<HTMLSelectElement>('lang-select');
  for (const [code, { label }] of Object.entries(LOCALES)) {
    lang.append(h('option', { value: code, lang: code }, label));
  }
  lang.value = i18n.locale;
  lang.addEventListener('change', () => {
    i18n.setLocale(lang.value as Locale);
    storage?.setItem('quiet.lang', lang.value);
  });
  i18n.onChange(() => {
    applyStatic();
    renderAll();
  });

  const theme = byId<HTMLSelectElement>('theme-select');
  theme.value = document.documentElement.dataset.theme ?? 'auto';
  theme.addEventListener('change', () => {
    if (theme.value === 'auto') {
      delete document.documentElement.dataset.theme;
      storage?.removeItem('quiet.theme');
    } else {
      document.documentElement.dataset.theme = theme.value;
      storage?.setItem('quiet.theme', theme.value);
    }
  });
}

// ---------------------------------------------------------------------------
// Scanning

function setStatus(id: string, text: (() => string) | null, isError = false): void {
  const el = byId(id);
  el.textContent = text ? text() : '';
  el.classList.toggle('error', isError);
  if (id === 'scan-status') state.lastStatus = text;
}

function showProgress(p: ScanProgress): void {
  const label = byId('progress-label');
  const bar = byId<HTMLProgressElement>('progress-bar');
  const count = byId('progress-count');
  label.textContent = t(`phase.${p.phase}`);
  if (p.total > 0) {
    bar.max = p.total;
    bar.value = Math.min(p.done, p.total);
    count.textContent = t('progress.count', { done: p.done, total: p.total });
  } else {
    bar.removeAttribute('value');
    count.textContent = p.done > 0 ? t('progress.countOpen', { done: p.done }) : '';
  }
  bar.setAttribute('aria-label', label.textContent);
  if (retryText) {
    retryText = '';
    byId('progress-retry').textContent = '';
  }
}

function readScanForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const concurrency = Math.min(8, Math.max(1, Number(data.get('concurrency')) || 4));
  const maxAgeHours = Number(data.get('maxAge'));
  const sample = Number(data.get('sample'));
  return {
    mode: (data.get('mode') as ActivityMode) ?? 'posts',
    scanType: data.get('scanType') === 'quick' ? ('quick' as const) : ('full' as const),
    concurrency,
    maxAgeMs: Number.isFinite(maxAgeHours) && maxAgeHours >= 0 ? maxAgeHours * 3_600_000 : DEFAULT_MAX_AGE_MS,
    ...(sample > 0 ? { sampleSize: Math.floor(sample) } : {}),
    force: data.get('force') === 'on',
  };
}

function setActorError(message: string | null): void {
  const input = byId<HTMLInputElement>('actor-input');
  const err = byId('actor-error');
  err.hidden = !message;
  err.textContent = message ?? '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

async function startScan(form: HTMLFormElement): Promise<void> {
  const input = byId<HTMLInputElement>('actor-input');
  const actor = normalizeActorInput(input.value);
  if (!actor) {
    setActorError(t('scan.invalidHandle'));
    input.focus();
    return;
  }
  setActorError(null);
  const options = readScanForm(form);
  const ac = new AbortController();
  state.scanAbort = ac;

  const scanButton = byId<HTMLButtonElement>('scan-button');
  const cancelButton = byId<HTMLButtonElement>('cancel-button');
  scanButton.disabled = true;
  cancelButton.hidden = false;
  byId('progress').hidden = false;
  setStatus('scan-status', null);
  showProgress({ phase: 'resolve', done: 0, total: 1 });

  try {
    const res = await scan(
      { reader, store, repoFor: publicRepoFor },
      { actor, ...options, signal: ac.signal, onProgress: showProgress },
    );
    loadResult(res);
    const s = res.stats;
    setStatus('scan-status', () =>
      res.cancelled
        ? t('scan.cancelled')
        : t('scan.done', {
            follows: s.follows,
            fetched: s.fetched,
            cached: s.fromCache,
            skipped: s.skipped,
            failed: s.failed,
          }),
    );
    const url = new URL(window.location.href);
    url.searchParams.set('actor', res.handle);
    history.replaceState(null, '', url);
  } catch (err) {
    if (isAbortError(err)) {
      setStatus('scan-status', () => t('scan.cancelled'));
    } else if (err instanceof ActorError) {
      const code = err.code === 'invalid' ? 'notfound' : err.code;
      setStatus('scan-status', () => t(`scan.error.${code}`, { actor }), true);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('scan-status', () => t('scan.error.generic', { message }), true);
    }
  } finally {
    state.scanAbort = null;
    scanButton.disabled = false;
    cancelButton.hidden = true;
    byId('progress').hidden = true;
    void renderCacheList();
  }
}

function loadResult(r: Loaded): void {
  state.result = { did: r.did, handle: r.handle, accounts: r.accounts, scannedAt: r.scannedAt };
  state.selection.clear();
  state.visible = PAGE_SIZE;
  renderResults();
  byId('results').hidden = false;
}

function setupScanForm(): void {
  const form = byId<HTMLFormElement>('scan-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.scanAbort) void startScan(form);
  });
  byId('cancel-button').addEventListener('click', () => state.scanAbort?.abort());
  const sample = byId<HTMLInputElement>('sample-input');
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="scanType"]')) {
    radio.addEventListener('change', () => {
      sample.disabled = form.querySelector<HTMLInputElement>('input[name="scanType"]:checked')?.value !== 'quick';
    });
  }
  byId('actor-input').addEventListener('input', () => setActorError(null));
}

// ---------------------------------------------------------------------------
// Results

function currentView(): Account[] {
  if (!state.result) return [];
  const now = Date.now();
  const filtered = filterAccounts(state.result.accounts, state.filters, now, allowlist.dids());
  return sortAccounts(filtered, state.sortKey, state.sortDir, now);
}

function renderMinDaysOptions(): void {
  const select = byId<HTMLSelectElement>('min-days');
  select.replaceChildren(
    ...MIN_DAYS_PRESETS.map((d) => h('option', { value: d }, d === 0 ? t('filter.any') : t('filter.days', { count: d }))),
    h('option', { value: 'custom' }, t('filter.custom')),
  );
  select.value = state.customDays ? 'custom' : String(state.filters.minDays);
  byId('custom-days').hidden = !state.customDays;
}

function rowFor(a: Account, now: number): HTMLTableRowElement {
  const kept = allowlist.has(a.did);
  const selected = state.selection.has(a.did);
  const name = a.displayName?.trim() || a.handle;
  const activity = activityText(a, now, t, (iso) => i18n.date(iso));
  const num = (n: number | undefined) => (n === undefined ? '–' : i18n.number(n));

  return h(
    'tr',
    { 'data-did': a.did, class: selected ? 'selected' : null },
    h(
      'td',
      { class: 'col-select' },
      h('input', {
        type: 'checkbox',
        class: 'select-row',
        checked: selected,
        disabled: kept,
        'aria-label': t('row.select', { handle: a.handle }),
      }),
    ),
    h(
      'td',
      {},
      h(
        'div',
        { class: 'account' },
        a.avatar
          ? h('img', { class: 'avatar', src: a.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', width: 36, height: 36 })
          : h('span', { class: 'avatar', 'aria-hidden': 'true' }),
        h(
          'div',
          {},
          h(
            'a',
            {
              class: 'account-name',
              href: profileUrl(a),
              target: '_blank',
              rel: 'noopener noreferrer',
              title: t('row.openProfile', { handle: a.handle }),
            },
            name,
          ),
          a.handle === a.did ? null : h('span', { class: 'account-handle' }, `@${a.handle}`),
        ),
      ),
    ),
    h(
      'td',
      { class: 'activity', title: activity.note ?? null },
      activity.primary,
      activity.secondary ? h('span', { class: 'activity-date' }, activity.secondary) : null,
    ),
    h('td', { class: 'num', 'data-label': t('col.followers') }, num(a.followersCount)),
    h('td', { class: 'num', 'data-label': t('col.following') }, num(a.followsCount)),
    h('td', { class: 'num', 'data-label': t('col.posts') }, num(a.postsCount)),
    h(
      'td',
      {},
      h(
        'div',
        { class: 'badges' },
        ...badgesFor(a, now, t, kept).map((b) => h('span', { class: `badge ${b.tone}`, title: b.title ?? null }, b.label)),
      ),
    ),
    h(
      'td',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'keep',
          'aria-pressed': kept ? 'true' : 'false',
          'aria-label': t('row.keep', { handle: a.handle }),
          title: t('row.keep', { handle: a.handle }),
        },
        t('col.keep'),
      ),
    ),
  );
}

function renderResults(): void {
  const r = state.result;
  if (!r) return;
  const now = Date.now();
  const view = currentView();
  byId('results-title').textContent = t('results.title', { handle: `@${r.handle}` });
  byId('results-summary').textContent = `${t('results.summary', { count: r.accounts.length })} ${i18n.dateTime(r.scannedAt)}`;

  const shown = view.slice(0, state.visible);
  const body = byId('results-body');
  const frag = document.createDocumentFragment();
  for (const a of shown) frag.append(rowFor(a, now));
  body.replaceChildren(frag);

  byId('results-empty').hidden = view.length > 0;
  byId('showing').textContent = t('results.showing', { shown: shown.length, total: view.length });
  byId('more-button').hidden = view.length <= state.visible;
  renderUnfollowBar();
}

function renderUnfollowBar(): void {
  const dry = byId<HTMLInputElement>('dry-run').checked;
  const count = state.selection.size;
  const button = byId<HTMLButtonElement>('unfollow-button');
  button.textContent = `${dry ? t('actions.preview') : t('actions.unfollow')} (${i18n.number(count)})`;
  button.classList.toggle('danger', !dry);
  button.disabled = count === 0 || state.running || (!dry && !isOwner());
  byId('selected-count').textContent = t('actions.selected', { count });
  byId('unfollow-hint').textContent =
    !dry && !isOwner() && state.result ? t('actions.needLogin', { handle: `@${state.result.handle}` }) : '';
}

function updateRow(did: string, focusSelector?: string): void {
  const r = state.result;
  const row = document.querySelector<HTMLTableRowElement>(`tr[data-did="${CSS.escape(did)}"]`);
  const account = r?.accounts.find((a) => a.did === did);
  if (!row || !account) return;
  const fresh = rowFor(account, Date.now());
  row.replaceWith(fresh);
  if (focusSelector) fresh.querySelector<HTMLElement>(focusSelector)?.focus();
}

function setupResults(): void {
  const minDays = byId<HTMLSelectElement>('min-days');
  const customDays = byId<HTMLInputElement>('custom-days');
  const rerender = () => {
    state.visible = PAGE_SIZE;
    renderResults();
  };

  minDays.addEventListener('change', () => {
    state.customDays = minDays.value === 'custom';
    customDays.hidden = !state.customDays;
    if (state.customDays) {
      customDays.value ||= String(state.filters.minDays || 60);
      state.filters.minDays = Number(customDays.value) || 0;
      customDays.focus();
    } else {
      state.filters.minDays = Number(minDays.value);
    }
    rerender();
  });
  customDays.addEventListener(
    'input',
    debounce(() => {
      state.filters.minDays = Math.max(0, Math.floor(Number(customDays.value) || 0));
      rerender();
    }, 200),
  );

  const checks: [string, keyof Filters][] = [
    ['only-nonmutual', 'onlyNonMutual'],
    ['only-never', 'onlyNeverPosted'],
    ['only-ghosts', 'onlyGhosts'],
    ['hide-kept', 'hideAllowlisted'],
  ];
  for (const [id, key] of checks) {
    const box = byId<HTMLInputElement>(id);
    box.checked = Boolean(state.filters[key]);
    box.addEventListener('change', () => {
      (state.filters as unknown as Record<string, boolean>)[key] = box.checked;
      rerender();
    });
  }
  byId('filters').addEventListener('submit', (e) => e.preventDefault());

  const search = byId<HTMLInputElement>('search-input');
  search.addEventListener(
    'input',
    debounce(() => {
      state.filters.search = search.value;
      rerender();
    }, 150),
  );

  byId('results-table').querySelector('thead')!.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-sort-key]');
    if (!button) return;
    const key = button.dataset.sortKey as SortKey;
    if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      state.sortKey = key;
      state.sortDir = key === 'name' ? 'asc' : 'desc';
    }
    applyStatic();
    renderResults();
    document.querySelector<HTMLElement>(`button[data-sort-key="${key}"]`)?.focus();
  });

  const body = byId('results-body');
  body.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.classList.contains('select-row')) return;
    const did = box.closest('tr')!.dataset.did!;
    if (box.checked) state.selection.add(did);
    else state.selection.delete(did);
    box.closest('tr')!.classList.toggle('selected', box.checked);
    renderUnfollowBar();
  });
  body.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button.keep');
    if (!button) return;
    const did = button.closest('tr')!.dataset.did!;
    const account = state.result?.accounts.find((a) => a.did === did);
    const nowKept = allowlist.toggle(did, account?.handle);
    if (nowKept) state.selection.delete(did);
    if (state.filters.hideAllowlisted) renderResults();
    else {
      updateRow(did, 'button.keep');
      renderUnfollowBar();
    }
  });

  byId('more-button').addEventListener('click', () => {
    const before = state.visible;
    state.visible += PAGE_SIZE;
    renderResults();
    // Move focus to the first newly shown row for keyboard users.
    byId('results-body').querySelectorAll('tr')[before]?.querySelector<HTMLElement>('a')?.focus();
  });

  byId('export-button').addEventListener('click', () => {
    if (!state.result) return;
    const csv = accountsToCsv(currentView(), Date.now(), allowlist.dids());
    const date = new Date().toISOString().slice(0, 10);
    download(`quiet-${state.result.handle}-${date}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
  });

  byId('select-all-button').addEventListener('click', () => {
    for (const a of currentView()) if (!allowlist.has(a.did)) state.selection.add(a.did);
    renderResults();
  });
  byId('clear-selection-button').addEventListener('click', () => {
    state.selection.clear();
    renderResults();
  });
  byId('dry-run').addEventListener('change', renderUnfollowBar);
  byId('unfollow-button').addEventListener('click', openConfirm);
}

// ---------------------------------------------------------------------------
// Unfollowing

function openConfirm(): void {
  const r = state.result;
  if (!r || state.selection.size === 0) return;
  const dry = byId<HTMLInputElement>('dry-run').checked;
  if (!dry && !isOwner()) return;
  const selected = [...state.selection];
  const kept = selected.filter((d) => allowlist.has(d)).length;
  const count = selected.length - kept;
  byId('confirm-title').textContent = dry ? t('confirm.titleDry') : t('confirm.title');
  byId('confirm-body').textContent = dry
    ? t('confirm.bodyDry', { count })
    : t('confirm.body', { count, handle: `@${r.handle}` });
  byId('confirm-kept').textContent = kept ? t('confirm.kept', { count: kept }) : '';
  const go = byId<HTMLButtonElement>('confirm-go');
  go.textContent = dry ? t('confirm.goDry') : t('confirm.go');
  go.classList.toggle('danger', !dry);
  go.classList.toggle('primary', dry);
  const dialog = byId<HTMLDialogElement>('confirm-dialog');
  dialog.returnValue = '';
  dialog.showModal();
  dialog.addEventListener(
    'close',
    () => {
      if (dialog.returnValue === 'go') void runUnfollowDialog(selected, dry);
    },
    { once: true },
  );
}

async function runUnfollowDialog(subjects: string[], dryRun: boolean): Promise<void> {
  const r = state.result;
  if (!r) return;
  const dialog = byId<HTMLDialogElement>('run-dialog');
  const log = byId('run-log');
  const summaryEl = byId('run-summary');
  const progress = byId<HTMLProgressElement>('run-progress');
  const stop = byId<HTMLButtonElement>('run-stop');
  const close = byId<HTMLButtonElement>('run-close');
  const handles = new Map(r.accounts.map((a) => [a.did, `@${a.handle}`]));
  const name = (did: string) => handles.get(did) ?? did;

  byId('run-title').textContent = dryRun ? t('run.titleDry') : t('run.title');
  log.replaceChildren();
  summaryEl.textContent = '';
  progress.max = subjects.length;
  progress.value = 0;
  stop.hidden = false;
  stop.disabled = false;
  close.hidden = true;
  state.running = true;
  renderUnfollowBar();
  const ac = new AbortController();
  state.runAbort = ac;
  const preventClose = (e: Event) => {
    if (state.running) e.preventDefault();
  };
  dialog.addEventListener('cancel', preventClose);
  dialog.showModal();
  stop.focus();

  let processed = 0;
  let indexingLine: HTMLLIElement | null = null;
  const line = (text: string, cls = '') => {
    const li = h('li', { class: cls || null }, text);
    log.append(li);
    log.scrollTop = log.scrollHeight;
    return li;
  };
  const onEvent = (e: UnfollowEvent) => {
    switch (e.type) {
      case 'indexing':
        indexingLine ??= line('', 'skip');
        indexingLine.textContent = t('run.indexing', { records: e.records });
        return;
      case 'deleted':
        line(t('run.deleted', { handle: name(e.subject) }), 'ok');
        break;
      case 'would-delete':
        line(t('run.wouldDelete', { handle: name(e.subject) }), 'ok');
        break;
      case 'skipped':
        line(
          t(e.reason === 'allowlisted' ? 'run.skippedKept' : 'run.skippedNotFollowing', { handle: name(e.subject) }),
          'skip',
        );
        break;
      case 'failed':
        line(t('run.failed', { handle: name(e.subject), error: e.error }), 'fail');
        break;
      case 'stopped':
        line(t('run.stopped'), 'fail');
        return;
    }
    processed++;
    progress.value = processed;
  };

  try {
    let repo: RepoClient;
    let owner: string;
    if (!dryRun) {
      const session = state.session;
      if (!session || session.sub !== r.did) throw new Error('Not logged in as the scanned account');
      repo = new PdsRepoClient(new XrpcClient((path, init) => session.fetchHandler(path, init)));
      owner = session.sub;
    } else {
      repo = await publicRepoFor(r.did, ac.signal);
      owner = r.did;
    }
    const summary = await runUnfollow({
      owner,
      subjects,
      repo,
      allowlist: allowlist.dids(),
      dryRun,
      minIntervalMs: UNFOLLOW_INTERVAL_MS,
      signal: ac.signal,
      onEvent,
    });
    const text = dryRun
      ? t('run.summaryDry', { wouldDelete: summary.wouldDelete, kept: summary.allowlisted, notFollowing: summary.notFollowing })
      : t('run.summary', {
          deleted: summary.deleted,
          failed: summary.failed,
          kept: summary.allowlisted,
          notFollowing: summary.notFollowing,
        });
    summaryEl.textContent = summary.stopped ? `${t('run.summaryStopped')} ${text}` : text;

    if (!dryRun && summary.done.length > 0) {
      const gone = new Set(summary.done);
      r.accounts = r.accounts.filter((a) => !gone.has(a.did));
      for (const d of gone) state.selection.delete(d);
      const saved = await store.get(r.did);
      if (saved) await store.put({ ...saved, accounts: saved.accounts.filter((a) => !gone.has(a.did)) });
    }
  } catch (err) {
    if (!isAbortError(err)) {
      summaryEl.textContent = t('run.error', { message: err instanceof Error ? err.message : String(err) });
    } else {
      summaryEl.textContent = t('run.stopped');
    }
  } finally {
    state.running = false;
    state.runAbort = null;
    dialog.removeEventListener('cancel', preventClose);
    stop.hidden = true;
    close.hidden = false;
    close.focus();
    renderResults();
    void renderCacheList();
  }
}

function setupRunDialog(): void {
  byId('run-stop').addEventListener('click', () => {
    state.runAbort?.abort();
    byId<HTMLButtonElement>('run-stop').disabled = true;
  });
  byId('run-close').addEventListener('click', () => {
    byId<HTMLDialogElement>('run-dialog').close();
    byId('unfollow-button').focus();
  });
}

// ---------------------------------------------------------------------------
// Keep list

function renderKeepList(): void {
  byId('keep-count').textContent = t('keep.count', { count: allowlist.size });
}

function setupKeepList(): void {
  allowlist.onChange(renderKeepList);
  byId('keep-export').addEventListener('click', () => {
    const date = new Date().toISOString().slice(0, 10);
    download(`quiet-keep-list-${date}.json`, JSON.stringify(allowlist.export(), null, 2), 'application/json');
  });
  const input = byId<HTMLInputElement>('keep-import');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const added = allowlist.import(JSON.parse(await file.text()));
      setStatus('keep-status', () => t('keep.imported', { count: added }));
      renderResults();
    } catch {
      setStatus('keep-status', () => t('keep.importError'), true);
    } finally {
      input.value = '';
    }
  });
  byId('keep-clear').addEventListener('click', () => {
    if (allowlist.size > 0 && confirm(t('keep.confirmClear'))) {
      allowlist.clear();
      renderResults();
    }
  });
}

// ---------------------------------------------------------------------------
// Saved scans

async function renderCacheList(): Promise<void> {
  const list = byId('cache-list');
  const datalist = byId('recent-scans');
  let scans: Awaited<ReturnType<typeof store.list>> = [];
  try {
    scans = await store.list();
  } catch {
    // storage unavailable
  }
  datalist.replaceChildren(...scans.map((s) => h('option', { value: s.handle })));
  byId<HTMLButtonElement>('cache-clear').disabled = scans.length === 0;
  if (scans.length === 0) {
    list.replaceChildren(h('li', { class: 'empty-item' }, t('cache.empty')));
    return;
  }
  list.replaceChildren(
    ...scans.map((s) =>
      h(
        'li',
        {},
        h('span', {}, t('cache.entry', { handle: `@${s.handle}`, count: s.count, date: i18n.dateTime(s.scannedAt) })),
        h(
          'span',
          { class: 'button-row' },
          h('button', { type: 'button', 'data-open': s.did }, t('cache.open')),
          h('button', { type: 'button', 'data-delete': s.did }, t('cache.delete')),
        ),
      ),
    ),
  );
}

async function openCached(did: string): Promise<boolean> {
  const rec = await store.get(did).catch(() => undefined);
  if (!rec) return false;
  loadResult(rec);
  byId<HTMLInputElement>('actor-input').value = rec.handle;
  const modeRadio = document.querySelector<HTMLInputElement>(`input[name="mode"][value="${rec.mode}"]`);
  if (modeRadio) modeRadio.checked = true;
  setStatus('scan-status', () => t('scan.loadedFromCache', { date: i18n.dateTime(rec.scannedAt) }));
  return true;
}

function setupCacheList(): void {
  byId('cache-list').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const open = target.closest<HTMLElement>('[data-open]')?.dataset.open;
    const del = target.closest<HTMLElement>('[data-delete]')?.dataset.delete;
    if (open) {
      if (await openCached(open)) byId('results').scrollIntoView({ block: 'start' });
    } else if (del) {
      await store.delete(del);
      if (state.result?.did === del) {
        state.result = null;
        byId('results').hidden = true;
      }
      await renderCacheList();
    }
  });
  byId('cache-clear').addEventListener('click', async () => {
    if (!confirm(t('cache.confirmClear'))) return;
    await store.clear();
    state.result = null;
    byId('results').hidden = true;
    await renderCacheList();
  });
}

// ---------------------------------------------------------------------------
// Login

function renderAuth(): void {
  byId('auth-out').hidden = Boolean(state.session);
  byId('auth-in').hidden = !state.session;
  if (state.session) {
    byId('auth-who').textContent = t('auth.loggedInAs', { handle: `@${state.sessionHandle || state.session.sub}` });
  }
  renderUnfollowBar();
}

function hasOAuthCallback(): boolean {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  return params.has('state') && (params.has('code') || params.has('error'));
}

async function initAuth(): Promise<void> {
  if (!hasOAuthCallback() && storage?.getItem(SESSION_FLAG) !== '1') return;
  setStatus('auth-status', () => t('auth.loading'));
  try {
    const oauth = await import('./lib/oauth');
    const session = await oauth.initSession(oauthConfig);
    if (session) await onSession(session);
    else storage?.removeItem(SESSION_FLAG);
    setStatus('auth-status', null);
  } catch (err) {
    storage?.removeItem(SESSION_FLAG);
    const message = err instanceof Error ? err.message : String(err);
    setStatus('auth-status', () => t('auth.error', { message }), true);
  }
}

async function onSession(session: OAuthSession): Promise<void> {
  state.session = session;
  storage?.setItem(SESSION_FLAG, '1');
  try {
    state.sessionHandle = (await reader.getProfile(session.sub)).handle;
  } catch {
    state.sessionHandle = '';
  }
  const actor = byId<HTMLInputElement>('actor-input');
  if (!actor.value) actor.value = state.sessionHandle || session.sub;
  if (!state.result) await openCached(session.sub);
  renderAuth();
}

function setupAuth(): void {
  byId('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = byId<HTMLInputElement>('login-input');
    const handle = normalizeActorInput(input.value);
    if (!handle) {
      input.setAttribute('aria-invalid', 'true');
      setStatus('auth-status', () => t('scan.invalidHandle'), true);
      return;
    }
    input.removeAttribute('aria-invalid');
    setStatus('auth-status', () => t('auth.redirecting'));
    try {
      const oauth = await import('./lib/oauth');
      storage?.setItem(SESSION_FLAG, '1');
      await oauth.signIn(oauthConfig, handle);
    } catch (err) {
      storage?.removeItem(SESSION_FLAG);
      const message = err instanceof Error ? err.message : String(err);
      setStatus('auth-status', () => t('auth.error', { message }), true);
    }
  });
  byId('logout-button').addEventListener('click', async () => {
    const session = state.session;
    if (!session) return;
    const oauth = await import('./lib/oauth');
    await oauth.signOut(oauthConfig, session).catch(() => {});
    state.session = null;
    state.sessionHandle = '';
    storage?.removeItem(SESSION_FLAG);
    renderAuth();
  });
}

// ---------------------------------------------------------------------------
// Boot

function renderAll(): void {
  renderResults();
  renderKeepList();
  renderAuth();
  void renderCacheList();
  if (state.lastStatus) byId('scan-status').textContent = state.lastStatus();
}

async function boot(): Promise<void> {
  // The OAuth loopback client must run on 127.0.0.1, not "localhost".
  if (window.location.hostname === 'localhost') {
    window.location.hostname = '127.0.0.1';
    return;
  }
  setupLanguageAndTheme();
  applyStatic();
  setupScanForm();
  setupResults();
  setupRunDialog();
  setupKeepList();
  setupCacheList();
  setupAuth();
  renderAll();

  const fromUrl = new URLSearchParams(window.location.search).get('actor');
  const actor = fromUrl ? normalizeActorInput(fromUrl) : null;
  if (actor) {
    byId<HTMLInputElement>('actor-input').value = actor;
    const scans = await store.list().catch(() => []);
    const match = scans.find((s) => s.handle === actor || s.did === actor);
    if (match) await openCached(match.did);
  }
  await initAuth();
}

void boot();
