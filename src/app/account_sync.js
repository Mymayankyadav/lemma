/* Account-scoped cache refresh, not activation of the Model/Store.
 * Anonymous cards remain in the original browser database. */
const LemmaSync = (() => {
  let account = null, channel = null, epoch = 0, task = null, wake = null;
  let projectionWake = null, projectionVersion = 0;
  let state = { phase: 'signed-out', userId: null, pending: 0, error: '' };
  const listeners = new Set();
  const emit = patch => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn({ ...state });
  };
  function stop() {
    ++epoch;
    ++projectionVersion;
    if (wake) { clearTimeout(wake); wake = null; }
    if (projectionWake) { clearTimeout(projectionWake); projectionWake = null; }
    const old = account;
    account = null;
    if (old) old.close();
    if (channel && LemmaAccount.client) {
      LemmaAccount.client.removeChannel(channel).catch(() => {});
    }
    channel = null;
    emit({ phase: 'signed-out', userId: null, pending: 0, error: '' });
  }
  function schedule() {
    if (!account || wake) return;
    wake = setTimeout(() => { wake = null; refresh().catch(() => {}); }, 200);
  }
  // Remote cache pulls can finish while the editor, review, or a local write
  // is active. Keep the fetched tombstone in IndexedDB, then project it as
  // soon as the visible account workspace becomes safe; never force a write
  // or repeatedly fetch from the server just to wait for a sheet to close.
  function scheduleProjection(handle, generation) {
    if (projectionWake || account !== handle || epoch !== generation) return;
    projectionWake = setTimeout(() => {
      projectionWake = null;
      if (account !== handle || epoch !== generation) return;
      publishActive(handle, generation).catch(err => {
        if (account === handle && epoch === generation)
          emit({ phase: 'error', error: String(err.message || err) });
      });
    }, 500);
  }
  async function publishActive(handle, generation) {
    const ticket = ++projectionVersion;
    const active = () => account === handle && epoch === generation &&
      LemmaAccount.user?.id === handle.userId &&
      Store.mode === 'account' && App.workspaceController?.activeId === handle.userId;
    const safe = () => active() && App.workspaceIdle() &&
      !Store.status().pending && !Store.status().failed;
    const check = () => {
      // A more recent projection, a different identity, or a workspace switch
      // invalidates this asynchronous cache read before it can touch Model.
      if (ticket !== projectionVersion || !active()) return false;
      if (safe()) return true;
      if (!Store.status().failed) scheduleProjection(handle, generation);
      return false;
    };
    if (!check()) return;
    await Store.whenSaved();
    if (!check()) return;
    const [rows, profile] = await Promise.all([handle.storage.notes(), handle.storage.profile()]);
    if (!check()) return;
    const updates = [];
    for (const row of rows) {
      if (row.dirty) continue;
      const existing = Model.notes.get(row.id);
      if (row.deleted) {
        if (existing) updates.push({id:row.id,note:null});
      } else if (row.data && JSON.stringify(existing || null) !== JSON.stringify(row.data))
        updates.push({id:row.id,note:structuredClone(row.data)});
    }
    if (updates.length) Model.applyRemote(updates);
    if (profile?.data && !profile.dirty) {
      const shown = Model.profile(), incoming = profile.data;
      if (JSON.stringify({settings:shown.settings,decks:shown.decks,
        examplesHidden:shown.examplesHidden,lastDeck:shown.lastDeck}) !==
          JSON.stringify({settings:incoming.settings,decks:incoming.decks,
            examplesHidden:incoming.examplesHidden,lastDeck:incoming.lastDeck}))
        Model.loadProfile(structuredClone(incoming));
    }
  }
  async function refresh() {
    if (!account) return;
    if (task) { schedule(); return task; }
    const running = account, generation = epoch;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      emit({ phase: 'offline' });
      return;
    }
    task = (async () => {
      emit({ phase: 'refreshing', error: '' });
      running.outbox.online = true;
      await running.outbox.flush();
      await running.pull();
      if (epoch !== generation || account !== running) return;
      const pending = await running.outbox.pending();
      if (epoch !== generation || account !== running) return;
      emit({ phase: pending.some(x => x.state === 'conflict') ? 'conflict' : 'ready',
        pending: pending.length, error: '' });
      await publishActive(running, generation);
    })();
    try { await task; }
    catch (err) {
      if (epoch === generation && account === running)
        emit({ phase: 'error', error: String(err.message || err) });
      throw err;
    } finally { task = null; }
  }
  async function attach(user) {
    const id = user?.id || null;
    if (id === state.userId && account) return;
    stop();
    if (!id || !LemmaAccount.client) return;
    const generation = epoch;
    emit({ phase: 'connecting', userId: id });
    let opened;
    try {
      opened = await LemmaCloud.startAccount(LemmaAccount.client, id,
        () => { if (epoch === generation) schedule(); });
      if (epoch !== generation || LemmaAccount.user?.id !== id) {
        opened.close(); return;
      }
      account = opened;
      const client = LemmaAccount.client;
      channel = client.channel('lemma-cache-' + id);
      for (const table of ['notes', 'profiles', 'review_events', 'review_retractions']) {
        channel.on('postgres_changes',
          { event: '*', schema: 'public', table, filter: 'user_id=eq.' + id },
          () => { if (epoch === generation) schedule(); });
      }
      channel.subscribe(status => {
        if (epoch === generation && status === 'SUBSCRIBED') schedule();
      });
      schedule();
    } catch (err) {
      opened?.close();
      if (epoch === generation) emit({ phase: 'error', error: String(err.message || err) });
    }
  }
  async function compareLocal() {
    if (Store.mode !== 'local') throw new Error('Browser-local deck required');
    const handle = account, generation = epoch;
    const id = handle?.userId;
    if (!handle || id !== LemmaAccount.user?.id)
      throw new Error('Sign in to compare account and local cards');
    await Store.whenSaved();
    const local = [...Model.notes.values()].map(n => structuredClone(n));
    const counts = await handle.storage.inspectAgainst(local);
    if (account !== handle || epoch !== generation || id !== LemmaAccount.user?.id)
      throw new Error('Account changed during comparison');
    return { ...counts, localTotal: local.length, accountUserId: id,
      fresh: state.phase === 'ready' };
  }
  /* Explicit enrollment only. The existing anonymous notes are retained as
   * a backup. Legacy logs travel as a snapshot baseline; no review IDs are
   * fabricated, and no conflicting cloud notes are overwritten. */
  async function enrollMissingLocal() {
    if (Store.mode !== 'local') throw new Error('Only browser-local decks can be enrolled');
    if (!account || state.phase !== 'ready' || !navigator.onLine)
      throw new Error('Refresh your signed-in account cache online before enrolling');
    const handle = account, generation = epoch;
    const userId = handle.userId;
    if (LemmaAccount.user?.id !== userId) throw new Error('Account changed');
    await Store.whenSaved();
    const notes = [...Model.notes.values()].map(n => structuredClone(n));
    const cached = await handle.storage.notes();
    if (account !== handle || epoch !== generation || LemmaAccount.user?.id !== userId)
      throw new Error('Account changed during enrollment');
    // Tombstoned cloud IDs are deliberately treated as existing, not resurrected.
    const known = new Set(cached.map(n => n.id));
    let queued = 0, skipped = 0;
    for (const note of notes) {
      if (account !== handle || epoch !== generation || LemmaAccount.user?.id !== userId)
        throw new Error('Account changed during enrollment (previous queued writes are retained)');
      if (known.has(note.id)) { skipped++; continue; }
      if (!note.id || typeof note.front !== 'string' || typeof note.back !== 'string' ||
          !Array.isArray(note.log)) {
        throw new Error('Malformed source note; stopped after queuing ' + queued);
      }
      await handle.storage.stageNote(note, 0);
      known.add(note.id);
      queued++;
    }
    const pending = (await handle.outbox.pending()).length;
    if (account !== handle || epoch !== generation || LemmaAccount.user?.id !== userId)
      throw new Error('Account changed after enrollment (queued writes remain durable)');
    emit({ pending });
    schedule();
    return { queued, skipped, total: notes.length,
      message: 'Queue saved locally. Server confirmation and conflicts are tracked separately.' };
  }
  function init() {
    LemmaAccount.onChange(user => { attach(user).catch(() => {}); });
    window.addEventListener('online', schedule);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule();
    });
    setInterval(() => { if (!document.hidden) schedule(); }, 120000);
    attach(LemmaAccount.user).catch(() => {});
  }
  // Internal workspace transition only; never expose activation via login UI.
  function accountHandle() {
    return account && account.userId === LemmaAccount.user?.id ? account : null;
  }
  return { init, attach, stop, refresh, kick: schedule, enrollMissingLocal, compareLocal,
    accountHandle, get status() { return { ...state }; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
})();
