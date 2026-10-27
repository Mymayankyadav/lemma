/* ---------- app shell, routing, boot ---------- */
const App = (() => {
  const VIEWS = { home: HomeView, browse: BrowseView, stats: StatsView, settings: SettingsView, review: ReviewView };
  const PASSIVE = new Set(['home', 'stats']);
  let view = 'home';
  let params = {};
  let lastSync = '';
  let workspaceBlocked = false;
  let workspaceRevision = 0;
  let workspaceController = null;
  const workspacePref = 'lemma-account-workspace-v1';
  let activatingRemembered = false;
  function savedWorkspaceId() {
    try { return window.localStorage.getItem(workspacePref); }
    catch (_) { return null; }
  }
  function rememberAccountWorkspace(id) {
    try {
      if (id) window.localStorage.setItem(workspacePref, id);
      else window.localStorage.removeItem(workspacePref);
    } catch (_) { /* persistence unavailable: explicit switch still works */ }
  }
  async function activateRemembered() {
    if (activatingRemembered || !workspaceController || Store.mode !== 'local' ||
        !workspaceIdle() || !LemmaAccount.user?.id ||
        savedWorkspaceId() !== LemmaAccount.user.id) return;
    const status = LemmaSync.status;
    if (status.userId !== LemmaAccount.user.id ||
        !(status.phase === 'offline' || (status.phase === 'ready' && !status.pending))) return;
    activatingRemembered = true;
    try {
      await workspaceController.activate();
      go('home');
    } catch (_) {
      // Keep the opt-in but never replace or enroll anonymous data on failure.
    } finally { activatingRemembered = false; }
  }

  function buildShell() {
    const nav = [['home', 'Today', 'decks'], ['browse', 'Cards', 'list'], ['settings', 'Settings', 'sliders']];
    const top = h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('button', { class: 'brand', type: 'button', onclick: () => go('home'), 'aria-label': 'Lemma, home' }, h('span', { class: 'brand-mark', text: 'Lemma' })),
        h('nav', { class: 'tabs', 'aria-label': 'Sections' }, nav.map(([v, l]) => h('button', { type: 'button', class: 'tab', dataset: { go: v }, text: l, onclick: () => go(v) }))),
        h('div', { class: 'sync', id: 'sync', role: 'status' }),
        h('button', { class: 'icon-btn icon-accent btn-new', type: 'button', 'aria-label': 'New card', title: 'New card (N)', html: icon('plus', 20), onclick: () => newCard() })));
    const tabBtn = ([v, l, ic]) => h('button', { type: 'button', class: 'tb', dataset: { go: v }, 'aria-label': l, title: l, html: `<span class="tb-ico">${icon(ic, 22)}</span>`, onclick: () => go(v) });
    const bottom = h('nav', { class: 'tabbar', 'aria-label': 'Sections' },
      nav.slice(0, 2).map(tabBtn),
      h('button', { type: 'button', class: 'tb tb-add', 'aria-label': 'New card', title: 'New card', html: icon('plus', 24), onclick: () => newCard() }),
      nav.slice(2).map(tabBtn));
    const app = $('#app');
    fill(app, top, h('main', { id: 'main', class: 'main', tabindex: '-1' }), bottom);
  }

  function drawSync() {
    const el = $('#sync');
    if (!el) return;
    const st = Store.status();
    let ic, text, cls = '';
    if (App.loading && st.mode === 'loading') { ic = 'clock'; text = 'Loading'; cls = 'pending'; }
    else if (st.mode === 'cloud') {
      if (st.offline) { ic = 'cloud'; text = 'Offline · will retry'; cls = 'warn'; }
      else if (st.pending) { ic = 'cloud'; text = 'Saving'; cls = 'pending'; }
      else { ic = 'cloud'; text = 'Saved to your account'; }
    } else if (st.mode === 'account') {
      const accountStatus = LemmaSync.status;
      ic = 'cloud';
      if (st.failed) { text = 'Could not save to device · export a backup'; cls = 'warn'; }
      else if (st.pending) { text = 'Saving to device'; cls = 'pending'; }
      else if (accountStatus.phase === 'conflict') { text = 'Account conflict · review needed'; cls = 'warn'; }
      else if (accountStatus.phase === 'error') { text = 'Sync failed · local changes retained'; cls = 'warn'; }
      else if (accountStatus.phase === 'offline') { text = 'Offline · changes queued on device'; cls = 'pending'; }
      else if (accountStatus.pending) { text = 'Saved on device · queued for cloud'; cls = 'pending'; }
      else if (accountStatus.phase === 'ready') { text = 'Saved to cloud'; }
      else { text = 'Saved on device · checking cloud'; cls = 'pending'; }
    } else if (st.mode === 'local') {
      ic = 'device';
      if (st.failed) { text = 'Not saved · export a backup'; cls = 'warn'; }
      else if (st.pending) { text = 'Saving on device'; cls = 'pending'; }
      else text = 'Saved on device · cloud sync not enabled';
    }
    else if (st.mode === 'memory') { ic = 'device'; text = 'Not saved'; cls = 'warn'; }
    else { ic = 'clock'; text = 'Loading'; cls = 'pending'; }
    const key = ic + text + cls;
    if (key === lastSync) return;
    lastSync = key;
    el.className = 'sync ' + cls;
    el.title = text;
    el.innerHTML = icon(ic, 18) + '<span class="sr-only"></span>';
    el.lastChild.textContent = text;
  }

  function go(v, p = {}) {
    if (workspaceBlocked) return;
    if (!VIEWS[v]) v = 'home';
    if (view === 'review' && v !== 'review') Scratch.close();
    view = v;
    params = p;
    render();
    window.scrollTo(0, 0);
    const main = $('#main');
    if (main && v !== 'review') try { main.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    // Apply any cloud invalidation held while reviewing or editing as soon
    // as the workspace becomes safe to reconcile.
    if (Store.mode === 'account' && workspaceIdle()) LemmaSync.kick();
  }
  function render() {
    const main = $('#main');
    if (!main) return;
    if (workspaceBlocked) {
      fill(main, h('div', { class: 'empty-state', role: 'status',
        text: 'Securing workspace · account data is hidden while local cards are restored.' }));
      return;
    }
    const y = window.scrollY;
    document.body.classList.toggle('in-review', view === 'review');
    const node = VIEWS[view].render(params);
    fill(main, node);
    for (const b of $$('[data-go]')) {
      const on = b.dataset.go === view;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (view !== 'review') window.scrollTo(0, y);
    drawSync();
  }
  const refresh = debounce(() => {
    if (PASSIVE.has(view)) render();
    else if (view === 'browse') BrowseView.refresh();
  }, 120);

  function startSession(session) {
    if (!workspaceBlocked) ReviewView.start(session);
  }
  function newCard(preset) {
    if (!workspaceBlocked) EditorSheet.open(null, () => refresh(), preset || {});
  }
  function workspaceIdle() {
    return !workspaceBlocked && view !== 'review' && !ReviewView.active &&
      !Sheets.count && !Scratch.isOpen();
  }
  function lockWorkspace(blocked) {
    workspaceBlocked = !!blocked;
    if (blocked) {
      workspaceRevision++;
      ReviewView.discardForWorkspaceChange();
      Scratch.close();
      while (Sheets.count) Sheets.closeTop();
    } else {
      view = 'home';
      params = {};
    }
    render();
  }
  async function migrateLeftovers() {
    const list = App.leftovers;
    App.leftovers = [];
    let n = 0;
    for (const raw of list) {
      if (!raw || !raw.id || Model.notes.has(raw.id)) continue;
      const note = Model.sanitizeNote(clone(raw));
      Model.notes.set(note.id, note);
      Store.saveNote(note);
      n++;
    }
    Model.bump();
    // Keep the source copy: the legacy cloud queue does not provide durable
    // per-note acknowledgements, so deleting it here could lose the only copy.
    toast(`Copied ${plural(n, 'card')} · local backup retained`);
    render();
  }

  function onKey(e) {
    if (workspaceBlocked) { e.preventDefault(); return; }
    if (e.key === 'Escape' && Sheets.count) { Sheets.closeTop(); e.preventDefault(); return; }
    if (view === 'review') { ReviewView.onKey(e); return; }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (Sheets.count || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { newCard(); e.preventDefault(); }
    else if (e.key === '/') { e.preventDefault(); go('browse'); setTimeout(() => { const q = $('#browse-q'); if (q) q.focus(); }, 30); }
    else if ((e.key === ' ' || e.key === 'Enter') && view === 'home' && e.target === document.body) {
      const c = Model.counts(null);
      if (c.new + c.learn + c.review) { e.preventDefault(); startSession(new Session({})); }
    }
  }

  function onRefClick(e) {
    const a = e.target.closest && e.target.closest('a.ref');
    if (!a) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    const target = a.dataset.noteId ? Model.notes.get(a.dataset.noteId) : Model.resolveTarget(a.dataset.ref);
    if (target) NoteDetail.peek(target.id);
    else toast(`No card “${a.dataset.ref}”`, { action: { label: 'Create', fn: () => newCard({ title: a.dataset.ref, front: '' }) } });
  }

  async function boot() {
    buildShell();
    App.loading = true;
    render();
    Render.setPreamble(DEFAULT_SETTINGS.preamble);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onRefClick, true);
    document.addEventListener('keydown', (e) => { if (e.target && e.target.classList && e.target.classList.contains('ref')) onRefClick(e); }, true);
    AI.onChange(() => { refresh(); ReviewView.refreshTools(); });
    AI.init();
    LemmaAccount.init();
    let data;
    try {
      data = await Store.init({
        notes: (changes) => Model.applyRemote(changes),
        profile: (p) => {
          if (JSON.stringify(p.settings || {}) === JSON.stringify(Model.settings) && JSON.stringify(p.decks || []) === JSON.stringify(Model.profile().decks)) return;
          Model.loadProfile(p);
        },
        status: () => drawSync(),
        snapshotAll: () => ({ notes: [...Model.notes.values()], profile: Model.profile() }),
      });
    } catch (e) {
      data = { notes: new Map(), profile: null, mode: 'memory' };
    }
    Model.loadProfile(data.profile);
    Model.replaceAll(data.notes);
    // Warm only the signed-in account cache; never merge it into the anonymous Model.
    LemmaSync.init();
    workspaceController = LemmaWorkspace.fromApp();
    workspaceController.init();
    LemmaSync.onChange(() => { drawSync(); activateRemembered().catch(() => {}); });
    App.loading = false;
    Model.onChange(() => refresh());
    if (data.mode === 'cloud') {
      Store.localLeftovers().then((list) => { if (list.length) { App.leftovers = list; refresh(); } });
    }
    const hash = (location.hash || '').replace('#', '');
    go(VIEWS[hash] && hash !== 'review' ? hash : 'home');
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { Model.bump(); } });
    setInterval(() => { if (view === 'home' && !document.hidden && !Sheets.count) render(); }, 60000);
    window.addEventListener('beforeunload', (e) => { if (Store.status().pending || Store.status().failed) { e.preventDefault(); e.returnValue = ''; } });
  }

  return {
    boot, go, render, refresh, startSession, newCard, migrateLeftovers,
    loading: true, leftovers: [],
    workspaceIdle, lockWorkspace, rememberAccountWorkspace,
    get workspaceController() { return workspaceController; },
    get workspaceBlocked() { return workspaceBlocked; },
    get workspaceRevision() { return workspaceRevision; },
    get view() { return view; },
  };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
else App.boot();

