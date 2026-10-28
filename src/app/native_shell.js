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
      if (url.searchParams.getAll('code').length > 1 ||
          url.searchParams.getAll('error').length > 1) return null;
      // PKCE returns ?code; failed provider callbacks return ?error.
      // Never accept unscoped or token-fragment URLs as sign-in evidence.
      if (Boolean(code) === Boolean(error)) return null;
      return raw;
    } catch {
      return null;
    }
  }

  // System-browser OAuth launch is intentionally unavailable until the native
  // @capacitor/browser plugin is actually installed in this APK. The web app
  // must never use this helper or fall back to OAuth inside the WebView.
  function trustedAuthUrl(raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return null;
    try {
      const config = new URL(window.LEMMA_CONFIG?.url || '');
      const target = new URL(raw);
      if (config.protocol !== 'https:' || config.username || config.password ||
          config.search || config.hash || config.pathname !== '/' ||
          target.origin !== config.origin || target.pathname !== '/auth/v1/authorize' ||
          target.username || target.password || target.hash) return null;
      const params = target.searchParams;
      if (params.getAll('provider').length !== 1 || params.get('provider') !== 'google' ||
          params.getAll('redirect_to').length !== 1 ||
          params.get('redirect_to') !== 'io.lemma.study://auth-callback' ||
          params.getAll('code_challenge').length !== 1 ||
          !/^[A-Za-z0-9_-]{43,128}$/.test(params.get('code_challenge') || '') ||
          params.getAll('code_challenge_method').length !== 1 ||
          params.get('code_challenge_method') !== 's256') return null;
      // Authorization URL may carry provider-specific parameters, but it must
      // not already contain login credentials, codes or bearer tokens.
      for (const name of params.keys()) {
        if (/^(access_token|refresh_token|id_token|token|code|client_secret)$/i.test(name))
          return null;
      }
      return target.href;
    } catch { return null; }
  }

  async function openAuthBrowser(url) {
    const safeUrl = trustedAuthUrl(url);
    if (!safeUrl) throw new Error('Invalid native Google sign-in request');
    if (!cap.isPluginAvailable?.('Browser'))
      throw new Error('Native sign-in browser unavailable; update the Android app');
    try {
      const browser = cap.registerPlugin('Browser');
      if (!browser || typeof browser.open !== 'function')
        throw new Error('missing native browser');
      await browser.open({ url: safeUrl });
    } catch {
      // Plugin exceptions may include URLs and PKCE values; never relay them.
      throw new Error('Could not open the native sign-in browser');
    }
  }

  async function closeAuthBrowser() {
    if (!cap.isPluginAvailable?.('Browser')) return;
    try {
      const browser = cap.registerPlugin('Browser');
      if (typeof browser?.close === 'function') await browser.close();
    } catch {
      // Android Custom Tabs may be closed by the system rather than the API.
      // This must never prevent callback processing or disclose an auth URL.
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

  // N3a policy only: compute a single generic reminder intent. This never
  // asks for permission or schedules anything on the OS. The later N3b bridge
  // must cancel/replace the fixed ID whenever consent, account, due state or
  // configured time changes, and cancel it when this function returns null.
  function planDueReminder({ optedIn, permission, localTime, earliestDueAt, now } = {}) {
    if (optedIn !== true || permission !== 'granted' ||
        typeof localTime !== 'string' ||
        !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(localTime) ||
        !Number.isSafeInteger(now) || now < 0 ||
        !Number.isSafeInteger(earliestDueAt) || earliestDueAt < 0) return null;
    // A scheduled reminder is never placed in the past or before a card is
    // due. Respect the student's chosen local clock time, not UTC, including
    // across daylight-saving transitions. No card content enters the intent.
    const threshold = Math.max(now + 60_000, earliestDueAt);
    if (!Number.isSafeInteger(threshold)) return null;
    const date = new Date(threshold);
    if (!Number.isFinite(date.getTime())) return null;
    const [hour, minute] = localTime.split(':').map(Number);
    date.setHours(hour, minute, 0, 0);
    if (date.getTime() < threshold) date.setDate(date.getDate() + 1);
    const at = date.getTime();
    // Avoid far-future stale OS alarms; later scheduling can refresh this.
    if (!Number.isSafeInteger(at) || at < threshold ||
        at - now > 366 * 86_400_000) return null;
    return Object.freeze({
      id: 24001, at, title: 'Review cards',
      body: 'Your Lemma review is ready', route: 'review'
    });
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
    // Android may resume its WebView without emitting a browser focus event.
    // Reuse account_sync's existing guarded focus listener: it coalesces
    // refreshes, respects the current identity and keeps offline edits queued.
    // Do not invent an online event or force account/workspace enrollment.
    console.info('[Lemma] Android resumed');
    try {
      window.dispatchEvent(new Event('focus'));
    } catch {
      // The native shell must not prevent foregrounding if a WebView's
      // event dispatch is unavailable. Never include account data in logs.
      console.warn('[Lemma] Native foreground wake unavailable');
    }
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
  // Android may launch a stopped process with a deep link before listeners run.
  // Reuse the same validation/deduplication as warm appUrlOpen events.
  if (typeof nativeApp.getLaunchUrl === 'function') {
    Promise.resolve().then(() => nativeApp.getLaunchUrl()).then(onAppUrlOpen).catch(() => {
      console.warn('[Lemma] Native launch URL unavailable');
    });
  }
  return { enabled: true, onAuthCallback, openAuthBrowser, closeAuthBrowser, planDueReminder };
})();
