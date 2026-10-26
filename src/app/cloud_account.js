/* Sign-in is optional. Anonymous IndexedDB data is never uploaded implicitly. */
const LemmaAccount = (() => {
  let client = null;
  let user = null;
  const subscribers = new Set();
  const identitySubscribers = new Set();
  let authGeneration = 0;
  // Subscribers may query Supabase; run outside the auth client's locked callback.
  const notify = () => {
    const identity = user;
    setTimeout(() => subscribers.forEach(fn => fn(identity)), 0);
  };
  function setUser(next) {
    user = next;
    // Invalidate visible account data before the auth callback returns. These
    // observers are local guards only; Supabase queries stay in deferred notify.
    for (const fn of identitySubscribers) fn(user);
    notify();
  }
  function init() {
    if (client) return true;
    const cfg = window.LEMMA_CONFIG || {};
    if (!cfg.url || !cfg.publishableKey || !window.LemmaSupabase) return false;
    client = window.LemmaSupabase.createClient(cfg.url, cfg.publishableKey);
    client.auth.onAuthStateChange((event, session) => {
      authGeneration++;
      const incoming = session ? session.user : null;
      if ((incoming && incoming.id) !== (user && user.id)) {
        setUser(incoming);
      }
    });
    const generation = authGeneration;
    client.auth.getUser().then(({ data, error }) => {
      if (generation === authGeneration && !error && data && data.user && (!user || user.id !== data.user.id)) {
        setUser(data.user);
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
    onIdentityChange(fn) { identitySubscribers.add(fn); return () => identitySubscribers.delete(fn); },
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
})();

