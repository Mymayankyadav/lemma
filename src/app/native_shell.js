/* ---------- Native Android shell; inert in web browsers ---------- */
const NativeShell = (() => {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return { enabled: false };
  if (typeof cap.registerPlugin !== 'function' || !cap.isPluginAvailable?.('App')) {
    console.warn('[Lemma] Capacitor App plugin unavailable');
    return { enabled: false };
  }
  const nativeApp = cap.registerPlugin('App');

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

  for (const [event, handler] of [['backButton', onBack], ['resume', onResume]]) {
    try {
      Promise.resolve(nativeApp.addListener(event, handler)).catch(error => {
        console.warn('[Lemma] Android listener failed: ' + event, error);
      });
    } catch (error) {
      console.warn('[Lemma] Android listener failed: ' + event, error);
    }
  }
  return { enabled: true };
})();
