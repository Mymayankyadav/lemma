/* Sign-in is optional. Anonymous IndexedDB data is never uploaded implicitly. */
const LemmaAccount = (() => {
  let client = null;
  let user = null;
  const subscribers = new Set();
  let authGeneration = 0;
  // Subscribers may query Supabase; run outside the auth client's locked callback.
  const notify = () => setTimeout(() => subscribers.forEach(fn => fn(user)), 0);
  function init() {
    if (client) return true;
    const cfg = window.LEMMA_CONFIG || {};
    if (!cfg.url || !cfg.publishableKey || !window.LemmaSupabase) return false;
    client = window.LemmaSupabase.createClient(cfg.url, cfg.publishableKey);
    client.auth.onAuthStateChange((event, session) => {
      authGeneration++;
      const incoming = session ? session.user : null;
      if ((incoming && incoming.id) !== (user && user.id)) {
        user = incoming;
        notify();
      }
    });
    const generation = authGeneration;
    client.auth.getUser().then(({ data, error }) => {
      if (generation === authGeneration && !error && data && data.user && (!user || user.id !== data.user.id)) {
        user = data.user;
        notify();
      }
    }).catch(() => {});
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

