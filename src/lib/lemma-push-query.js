/* E2E/dev URL-only opt-in: ask the browser to start a worker with its own enabled URL.
 * The normal app registration stays unchanged in production; the default SW stays inert. */
(function () {
  const flags = (new URLSearchParams(location.search).get('flags') ?? '').split(',').map(s => s.trim());
  if (!flags.includes('notificationsPush') || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    void navigator.serviceWorker.ready.then(function () {
      return navigator.serviceWorker.register('/lemma/sw.js?flags=notificationsPush', {scope:'/lemma/'});
    }).catch(function () { /* Normal offline service worker is still available. */ });
  });
})();
