/* Account-scoped cache refresh, not activation of the Model/Store.
 * Anonymous cards remain in the original browser database. */
const LemmaSync = (() => {
  let account = null, channel = null, epoch = 0, task = null, wake = null;
  let state = { phase: 'signed-out', userId: null, pending: 0, error: '' };
  const listeners = new Set();
  const emit = patch => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn({ ...state });
  };
  function stop() {
    ++epoch;
    if (wake) { clearTimeout(wake); wake = null; }
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
      for (const table of ['notes', 'review_events', 'review_retractions']) {
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
  return { init, attach, stop, refresh, get status() { return { ...state }; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
})();
