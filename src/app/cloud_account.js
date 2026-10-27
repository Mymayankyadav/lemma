/* Sign-in is optional. Anonymous IndexedDB data is never uploaded implicitly. */
const LemmaAccount = (() => {
  let client = null;
  let user = null;
  const subscribers = new Set();
  const identitySubscribers = new Set();
  let authGeneration = 0;
  let lastAuthError = '';
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
    // OAuth errors are returned to the application URL. Leave successful PKCE
    // ?code callbacks untouched for supabase-js to exchange automatically.
    const callback = new URL(location.href);
    if (callback.searchParams.has('error') || callback.searchParams.has('error_description')) {
      lastAuthError = callback.searchParams.get('error_description') ||
        callback.searchParams.get('error') || 'Sign-in could not be completed.';
      for (const key of ['error','error_description','error_code']) callback.searchParams.delete(key);
      if (typeof history !== 'undefined' && history.replaceState)
        history.replaceState(history.state, '', callback.pathname + callback.search + callback.hash);
    }
    const cfg = window.LEMMA_CONFIG || {};
    if (!cfg.url || !cfg.publishableKey || !window.LemmaSupabase) return false;
    client = window.LemmaSupabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true }
    });
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
  async function signInWithGoogle() {
    if (!client) throw new Error('Cloud is not configured');
    lastAuthError = '';
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: new URL('./', location.href).href }
    });
    if (error) { lastAuthError = error.message || String(error); throw error; }
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
  return { init, signIn, signInWithGoogle, signOut, get lastAuthError() {return lastAuthError;}, get client() { return client; }, get user() { return user; },
    onIdentityChange(fn) { identitySubscribers.add(fn); return () => identitySubscribers.delete(fn); },
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
})();

