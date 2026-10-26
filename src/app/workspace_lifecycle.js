/* Internal account workspace lifecycle (SYNC-01).
 * Reuses Store, Model and existing account cache. No public activation UI.
 * The visible deck must NEVER remain from user A after account B signs in.
 */
const LemmaWorkspace = (() => {
  function create(deps) {
    const { store, model, account, sync, idle, lock, notify = () => {} } = deps;
    let activeId = null;
    let inFlightId = null;
    let epoch = 0;
    let transition = null;
    let recovery = null;
    let suspended = false;
    const publish = value => { suspended = value; lock(value); };
    const identity = () => account.user?.id || null;
    const restore = snapshot => {
      model.loadProfile(snapshot.profile);
      model.replaceAll(snapshot.notes);
    };
    async function recover() {
      if (recovery) return recovery;
      // These actions run synchronously before the first await: the next
      // JavaScript event cannot render user A's cards to user B.
      ++epoch;
      publish(true);
      model.loadProfile(null);
      model.replaceAll(new Map());
      const previousTransition = transition;
      recovery = (async () => {
        let restored = false;
        try {
          if (previousTransition) await previousTransition.catch(() => {});
          const snapshot = store.mode === 'account'
            ? await store.emergencyExitAccount() : await store.localSnapshot();
          restore(snapshot);
          activeId = null;
          inFlightId = null;
          restored = true;
          return snapshot;
        } catch (err) {
          // Keep account data erased. Do not reactivate or guess data if the
          // anonymous IndexedDB read fails. Surface a blocked state.
          notify('Could not restore local workspace: ' + (err.message || err));
          throw err;
        } finally {
          // If recovery failed, keep interaction locked until restart/repair.
          if (restored && store.mode === 'local') publish(false);
          recovery = null;
        }
      })();
      return recovery;
    }
    async function activate() {
      if (suspended || transition || activeId || store.mode !== 'local')
        throw new Error('Workspace is not idle');
      if (!idle()) throw new Error('Close the review, editor and open sheets before switching');
      const userId = identity();
      if (!userId || sync.status.userId !== userId || sync.status.phase !== 'ready' ||
          sync.status.pending) throw new Error('Refresh the authenticated account before switching');
      const handle = sync.accountHandle();
      if (!handle || handle.userId !== userId)
        throw new Error('Account cache does not match signed-in identity');
      const startEpoch = epoch;
      inFlightId = userId;
      publish(true);
      transition = (async () => {
        try {
          const snapshot = await store.activateAccount(handle);
          if (epoch !== startEpoch || identity() !== userId ||
              sync.accountHandle() !== handle)
            throw new Error('Account changed during workspace activation');
          restore(snapshot);
          activeId = userId;
          return snapshot;
        } catch (err) {
          // Restore the existing anonymous workspace after any failure.
          // If identity switched, the synchronous auth handler has already
          // scrubbed the Model and scheduled recovery.
          if (epoch === startEpoch) {
            const snapshot = store.mode === 'account'
              ? await store.emergencyExitAccount() : await store.localSnapshot();
            restore(snapshot);
          }
          throw err;
        } finally {
          if (epoch === startEpoch) {
            inFlightId = null;
            publish(false);
          }
        }
      })();
      try { return await transition; }
      finally { transition = null; }
    }
    async function deactivate() {
      if (suspended || transition || !activeId || store.mode !== 'account')
        throw new Error('No idle account workspace to close');
      if (!idle()) throw new Error('Finish reviewing and close editors before switching');
      const startEpoch = epoch;
      publish(true);
      transition = (async () => {
        try {
          const snapshot = await store.deactivateAccount();
          if (epoch !== startEpoch) return;
          restore(snapshot);
          activeId = null;
          return snapshot;
        } finally {
          if (epoch === startEpoch) publish(false);
        }
      })();
      try { return await transition; }
      finally { transition = null; }
    }
    function authChanged(user) {
      const nextId = user?.id || null;
      if ((activeId && nextId !== activeId) ||
          (inFlightId && nextId !== inFlightId)) {
        // Deliberately no await: scrub data immediately during this callback.
        recover().catch(() => {});
      }
    }
    function init() { account.onChange(authChanged); }
    return { init, activate, deactivate, authChanged, recover,
      get activeId() { return activeId; },
      get blocked() { return suspended; },
      get recovery() { return recovery; } };
  }
  function fromApp() {
    return create({
      store: Store, model: Model, account: LemmaAccount, sync: LemmaSync,
      idle: () => App.workspaceIdle(),
      lock: blocked => App.lockWorkspace(blocked),
      notify: message => toast(message, { kind: 'error' })
    });
  }
  return { create, fromApp };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaWorkspace;
