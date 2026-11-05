/* Classic Workbox importScripts companion. URL-only flags select a separate SW URL. */
(function () {
  const scope = self;
  // Decide at startup, so push handlers are never registered in flag-off workers.
  const url = new URL(scope.location.href);
  const queryFlagOn = scope.__lemmaPushAllowUrlOverride === true &&
    url.pathname === '/lemma/sw.js' &&
    (new URLSearchParams(url.search).get('flags') ?? '').split(',').map(s => s.trim()).includes('notificationsPush');
  if (scope.__lemmaPushAutoStart !== true && !queryFlagOn) return;
  const safeLink = (value) => {
    if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) return null;
    if (value.startsWith('#/')) return '/lemma/' + value;
    if (value.startsWith('/lemma/#/')) return value;
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' && ['chatgpt.com', 'claude.ai'].includes(url.hostname)) return url.href;
      if (url.protocol === 'https:' && url.hostname === 'mymayankyadav.github.io' && url.pathname.startsWith('/lemma/') && url.hash.startsWith('#/')) return url.href;
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/lemma/')) return url.href;
    } catch { /* reject */ }
    return null;
  };
  const kinds = new Set(['due','deadline','behind','resume','tutor','digest','plan','rhythm','confirm','test']);
  const parse = (raw) => {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 3072) return null;
    try {
      const x = JSON.parse(raw);
      if (!x || typeof x !== 'object' || Array.isArray(x) || x.v !== 1 ||
        !(typeof x.id === 'number' ? Number.isSafeInteger(x.id) && x.id > 0 :
          typeof x.id === 'string' && /^[1-9]\d{0,18}$/.test(x.id) && BigInt(x.id) <= 9223372036854775807n) ||
        !kinds.has(x.kind) || typeof x.tag !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(x.tag) ||
        typeof x.title !== 'string' || !x.title.trim() || x.title.length > 1000 ||
        typeof x.body !== 'string' || x.body.length > 2000 || !safeLink(x.url) ||
        !Number.isSafeInteger(x.ts) || x.ts <= 0 || !Array.isArray(x.actions) || x.actions.length > 2) return null;
      for (const a of x.actions) {
        if (!a || typeof a !== 'object' || typeof a.action !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(a.action) ||
          typeof a.title !== 'string' || !a.title.trim() || a.title.length > 1000 ||
          (a.url !== undefined && !safeLink(a.url)) ||
          (a.token !== undefined && (typeof a.token !== 'string' || a.token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(a.token)))) return null;
      }
      return x;
    } catch { return null; }
  };
  scope.addEventListener('push', (event) => {
    event.waitUntil((async () => {
      const notice = parse(event.data?.text() ?? '');
      if (!notice) return;
      const actions = notice.actions.map(a => ({action:a.action, title:a.title}));
      await scope.registration.showNotification(notice.title, {
        body:notice.body, tag:notice.tag, actions,
        data:{url:safeLink(notice.url), actions:notice.actions.map(a=>({action:a.action,url:a.url ? safeLink(a.url) : undefined}))},
      });
    })());
  });
  scope.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      const data = event.notification.data;
      const target = safeLink(data?.actions?.find(a => a.action === event.action)?.url ?? data?.url);
      if (!target) return;
      // External URLs accepted by notify/payload.ts open separately, rather than navigating away from the app.
      if (target.startsWith('https:') && ['chatgpt.com','claude.ai'].includes(new URL(target).hostname)) {
        await scope.clients.openWindow(target);
        return;
      }
      const windows = await scope.clients.matchAll({type:'window',includeUncontrolled:true});
      const existing = windows.find(w => {
        try {
          const u = new URL(w.url);
          return u.origin === scope.location.origin && u.pathname.startsWith('/lemma/');
        } catch { return false; }
      });
      if (existing) {
        if (existing.navigate) await existing.navigate(target);
        await existing.focus();
      } else await scope.clients.openWindow(target);
    })());
  });
})();
