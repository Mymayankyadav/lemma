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
  // Native-only Google PKCE return. The callback's code is a short-lived
  // one-time credential handled by supabase-js, never by local workspace sync.
  const nativeRedirect = 'io.lemma.study://auth-callback';
  const nativePendingKey = 'lemma-native-google-pkce-pending-v1';
  const nativePendingMaxAgeMs = 10 * 60 * 1000;
  const seenNativeCodes = new Set();
  let nativeExchanging = false;
  let nativeIntentEpoch = 0;
  const onNativePlatform = () => !!window.Capacitor?.isNativePlatform?.();
  const nativeEnabled = () => typeof NativeShell !== 'undefined' &&
    NativeShell.enabled === true &&
    typeof NativeShell.onAuthCallback === 'function' &&
    typeof NativeShell.openAuthBrowser === 'function';
  function clearNativePending() {
    try { window.localStorage?.removeItem(nativePendingKey); } catch (_) {}
  }
  function readNativePending() {
    try {
      const raw = window.localStorage?.getItem(nativePendingKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data?.v !== 1 || data.identity !== null ||
          !Number.isSafeInteger(data.at) ||
          Date.now() - data.at < 0 || Date.now() - data.at > nativePendingMaxAgeMs) {
        clearNativePending();
        return null;
      }
      return data;
    } catch (_) { clearNativePending(); return null; }
  }
  function writeNativePending() {
    const data = { v: 1, at: Date.now(), identity: null };
    try {
      if (!window.localStorage) throw new Error('no durable storage');
      window.localStorage.setItem(nativePendingKey, JSON.stringify(data));
      return !!readNativePending();
    } catch (_) { return false; }
  }
  function nativeCallback(raw) {
    if (!nativeEnabled() || !client) return;
    let code = null, failed = false;
    try {
      if (typeof raw !== 'string' || raw.length > 4096) return;
      const link = new URL(raw);
      if (link.protocol !== 'io.lemma.study:' || link.hostname !== 'auth-callback' ||
          link.port || link.username || link.password || link.hash ||
          (link.pathname && link.pathname !== '/') ||
          link.searchParams.getAll('code').length > 1 ||
          link.searchParams.getAll('error').length > 1) return;
      code = link.searchParams.get('code');
      failed = !!link.searchParams.get('error');
      if (!!code === failed) return;
      for (const key of link.searchParams.keys()) {
        if (/^(access_token|refresh_token|id_token|token|client_secret)$/i.test(key)) return;
      }
      if (code && !/^[A-Za-z0-9._~-]{6,2048}$/.test(code)) return;
    } catch (_) { return; }
    // A second deep-link dispatch, even with reordered URL query keys, must
    // never retry a consumed authorization code or overwrite a successful UI.
    if (code && seenNativeCodes.has(code)) return;
    if (!readNativePending() || user?.id || nativeExchanging) {
      // No auth action is ever taken for unsolicited, expired or stale links.
      if (!user?.id && !nativeExchanging) lastAuthError = 'Google sign-in request expired. Start again.';
      return;
    }
    clearNativePending();
    if (failed) {
      lastAuthError = 'Google sign-in was cancelled or could not be completed.';
      Promise.resolve(NativeShell.closeAuthBrowser?.()).catch(() => {});
      return;
    }
    seenNativeCodes.add(code);
    if (seenNativeCodes.size > 32) seenNativeCodes.delete(seenNativeCodes.values().next().value);
    const epoch = nativeIntentEpoch;
    nativeExchanging = true;
    Promise.resolve().then(async () => {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data?.user?.id) throw new Error('native exchange failed');
      // Supabase fires SIGNED_IN; do not activate, move or upload anonymous
      // learning data here. Explicit workspace choice stays with App.
      if (epoch !== nativeIntentEpoch) {
        await client.auth.signOut();
        throw new Error('native exchange superseded');
      }
    }).catch(() => {
      lastAuthError = 'Could not complete Google sign-in. Try again.';
    }).finally(() => {
      nativeExchanging = false;
      Promise.resolve(NativeShell.closeAuthBrowser?.()).catch(() => {});
    });
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
      if (incoming?.id && nativeEnabled()) clearNativePending();
      if ((incoming && incoming.id) !== (user && user.id)) {
        setUser(incoming);
      }
    });
    if (nativeEnabled()) NativeShell.onAuthCallback(nativeCallback);
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
    if (onNativePlatform() && !nativeEnabled()) {
      lastAuthError = 'Native sign-in is unavailable; update the Android app.';
      throw new Error(lastAuthError);
    }
    if (nativeEnabled()) {
      if (user?.id || nativeExchanging) throw new Error('Finish the current account action first');
      const epoch = ++nativeIntentEpoch;
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: nativeRedirect, skipBrowserRedirect: true }
      });
      if (error) {
        lastAuthError = 'Could not start Google sign-in. Try again.';
        throw new Error(lastAuthError);
      }
      if (epoch !== nativeIntentEpoch || user?.id || !data?.url || !writeNativePending()) {
        lastAuthError = 'Cannot safely start native Google sign-in.';
        throw new Error(lastAuthError);
      }
      try { await NativeShell.openAuthBrowser(data.url); }
      catch (_) {
        clearNativePending();
        lastAuthError = 'Could not open Google sign-in on this device.';
        throw new Error(lastAuthError);
      }
      return;
    }
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
    ++nativeIntentEpoch;
    clearNativePending();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  return { init, signIn, signInWithGoogle, signOut, get lastAuthError() {return lastAuthError;}, get client() { return client; }, get user() { return user; },
    onIdentityChange(fn) { identitySubscribers.add(fn); return () => identitySubscribers.delete(fn); },
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
})();

