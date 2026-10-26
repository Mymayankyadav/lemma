/* Sign-in is optional. Anonymous IndexedDB data is never uploaded implicitly. */
const LemmaAccount = (() => {
  let client = null;
  let user = null;
  const subscribers = new Set();
  const notify = () => subscribers.forEach(fn => fn(user));
  function init() {
    const cfg = window.LEMMA_CONFIG || {};
    if (!cfg.url || !cfg.publishableKey || !window.LemmaSupabase) return false;
    client = window.LemmaSupabase.createClient(cfg.url, cfg.publishableKey);
    client.auth.onAuthStateChange((event, session) => {
      const incoming = session ? session.user : null;
      if ((incoming && incoming.id) !== (user && user.id)) {
        user = incoming;
        notify();
      }
    });
    return true;
  }
  return { init, get client() { return client; }, get user() { return user; },
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
})();
