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
  async function signIn(email) {
    if (!client) throw new Error('Cloud is not configured');
    const { error } = await client.auth.signInWithOtp({
      email, options: { emailRedirectTo: new URL('./', location.href).href }
    });
    if (error) throw error;
  }
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  return { init, signIn, signOut, get client() { return client; }, get user() { return user; },
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
})();
