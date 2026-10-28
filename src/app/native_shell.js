/* ---------- Native Android shell; inert in web browsers ---------- */
const NativeShell = (() => {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return { enabled: false };
  if (typeof cap.registerPlugin !== 'function' || !cap.isPluginAvailable?.('App')) {
    console.warn('[Lemma] Capacitor App plugin unavailable');
    return { enabled: false };
  }
  const nativeApp = cap.registerPlugin('App');

  // Native App URLs are delivered only to an explicit authentication owner.
  // This bridge does not exchange PKCE codes or activate an account itself.
  const authListeners = new Set();
  let pendingAuthUrl = null;
  let lastAuthUrl = null;

  function callbackUrl(raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'io.lemma.study:' || url.hostname !== 'auth-callback' ||
          url.port || url.username || url.password || url.hash ||
          (url.pathname && url.pathname !== '/')) return null;
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      // PKCE returns ?code; failed provider callbacks return ?error.
      // Never accept unscoped or token-fragment URLs as sign-in evidence.
      if (Boolean(code) === Boolean(error)) return null;
      return raw;
    } catch {
      return null;
    }
  }

  function deliverAuthUrl(url) {
    for (const callback of authListeners) {
      try { callback(url); }
      catch {
        // A callback may handle credentials; never log its URL or errors.
        console.warn('[Lemma] Native auth callback listener failed');
      }
    }
  }

  function onAppUrlOpen({ url } = {}) {
    const scoped = callbackUrl(url);
    if (!scoped || scoped === lastAuthUrl) return;
    lastAuthUrl = scoped;
    if (!authListeners.size) { pendingAuthUrl = scoped; return; }
    deliverAuthUrl(scoped);
  }

  function onAuthCallback(callback) {
    if (typeof callback !== 'function') throw new TypeError('Auth callback must be a function');
    authListeners.add(callback);
    if (pendingAuthUrl) {
      const pending = pendingAuthUrl;
      pendingAuthUrl = null;
      deliverAuthUrl(pending);
    }
    return () => authListeners.delete(callback);
  }

  function onBack({ canGoBack } = {}) {
    if (typeof Sheets !== 'undefined' && Sheets.closeTop()) return;
    // App.go switches screens without pushing browser history.
    if (typeof App !== 'undefined' && App.view !== 'home') {
      App.go('home');
      return;
    }
    if (canGoBack) {
      window.history.back();
      return;
    }
    Promise.resolve(nativeApp.exitApp()).catch(error => {
      console.warn('[Lemma] Android exit failed', error);
    });
  }

  function onResume() {
    // Preserve the existing foreground/sync logic; this is diagnostic only.
    console.info('[Lemma] Android resumed');
  }

  for (const [event, handler] of [['backButton', onBack], ['resume', onResume], ['appUrlOpen', onAppUrlOpen]]) {
    try {
      Promise.resolve(nativeApp.addListener(event, handler)).catch(error => {
        console.warn('[Lemma] Android listener failed: ' + event, error);
      });
    } catch (error) {
      console.warn('[Lemma] Android listener failed: ' + event, error);
    }
  }
  return { enabled: true, onAuthCallback };
})();
