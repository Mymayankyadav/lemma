'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/native_shell.js', 'utf8');

function run({ native = true, available = true, browserAvailable = true, browserReject = false, wakeReject = false, sheet = false, view = 'home', launchUrl = null, notificationsAvailable = true, notificationPermission = 'granted', notificationRequestPermission = 'granted', permissionFail = false, notificationFail = false, pendingReminders = [] } = {}) {
  const events = {}, actions = [], browserUrls = [], state = { view, sheet };
  const plugin = {
    addListener(name, handler) { events[name] = handler; actions.push('listen:' + name); return Promise.resolve({ remove() {} }); },
    exitApp() { actions.push('exit'); return Promise.resolve(); },
    getLaunchUrl() { return Promise.resolve({ url: launchUrl }); },
  };
  const browser = {
    async open({ url }) {
      browserUrls.push(url);
      actions.push('browser.open');
      if (browserReject) throw new Error('code=PRIVATE-TOKEN-DO-NOT-LOG');
    },
    async close() { actions.push('browser.close'); }
  };
  const pendingNotifications = pendingReminders.map(n => ({ ...n }));
  const notificationPlugin = {
    addListener(name, handler) {
      events[name] = handler;
      actions.push('notify.listen:' + name);
      return Promise.resolve({ remove() {} });
    },
    async requestPermissions() {
      actions.push('notify.request');
      if (permissionFail) throw new Error('PRIVATE-PERMISSION-ERROR');
      return { display: notificationRequestPermission };
    },
    async getPending() {
      actions.push('notify.pending');
      if (notificationFail) throw new Error('PRIVATE-NOTIFICATION-ERROR');
      return { notifications: pendingNotifications.map(n => ({ ...n })) };
    },
    async cancel({ notifications }) {
      actions.push('notify.cancel');
      for (const { id } of notifications) {
        for (let i = pendingNotifications.length - 1; i >= 0; i--)
          if (pendingNotifications[i].id === id) pendingNotifications.splice(i, 1);
      }
    },
    async checkPermissions() {
      actions.push('notify.check');
      if (permissionFail) throw new Error('PRIVATE-PERMISSION-ERROR');
      return { display: notificationPermission };
    },
    async createChannel(channel) { actions.push('notify.channel'); assert.equal(channel.importance, 2); assert.equal(channel.vibration, false); },
    async schedule({ notifications }) { actions.push('notify.schedule'); pendingNotifications.push(...notifications); }
  };
  const cap = {
    isNativePlatform: () => native,
    isPluginAvailable: name => {
      if (name === 'App') return available;
      if (name === 'Browser') return browserAvailable;
      if (name === 'LocalNotifications') return notificationsAvailable;
      throw new Error('Unexpected Capacitor plugin');
    },
    registerPlugin: name => {
      if (name === 'App') { actions.push('register'); return plugin; }
      if (name === 'Browser') { actions.push('register:Browser'); return browser; }
      if (name === 'LocalNotifications') { actions.push('register:LocalNotifications'); return notificationPlugin; }
      throw new Error('Unexpected Capacitor plugin');
    },
  };
  const ctx = {
    URL,
    window: { Capacitor: cap, LEMMA_CONFIG: { url: 'https://yemqnhnztlbyxmjxidis.supabase.co' }, history: { back() { actions.push('history.back'); } }, dispatchEvent(event) { if (wakeReject) throw new Error('secret=PRIVATE-DO-NOT-LOG'); actions.push('event:' + event.type); return true; } },
    Event: class { constructor(type) { this.type = type; } },
    Sheets: { closeTop() { if (!state.sheet) return false; state.sheet = false; actions.push('closeSheet'); return true; } },
    App: { get view() { return state.view; }, go(v) { state.view = v; actions.push('go:' + v); } },
    console: { warn(...x) { actions.push('warn:' + x.join(' ')); }, info(...x) { actions.push('info:' + x.join(' ')); } },
  };
  vm.runInNewContext(source + '\nthis.nativeShell = NativeShell;', ctx);
  return { events, actions, browserUrls, state, enabled: ctx.nativeShell.enabled, onAuthCallback: ctx.nativeShell.onAuthCallback, openAuthBrowser: ctx.nativeShell.openAuthBrowser, closeAuthBrowser: ctx.nativeShell.closeAuthBrowser, planDueReminder: ctx.nativeShell.planDueReminder, reconcileDueReminder: ctx.nativeShell.reconcileDueReminder,
    onDueReminderTap: ctx.nativeShell.onDueReminderTap,
    checkDueReminderPermission: ctx.nativeShell.checkDueReminderPermission,
    requestDueReminderPermission: ctx.nativeShell.requestDueReminderPermission, pendingNotifications };
}

const web = run({ native: false });
assert.equal(web.enabled, false);
assert.deepEqual(web.actions, []);
const absent = run({ available: false });
assert.equal(absent.enabled, false);
assert.match(absent.actions[0], /unavailable/);
const a = run({ sheet: true, view: 'review' });
assert.equal(a.enabled, true);
assert.deepEqual(Object.keys(a.events).sort(), ['appUrlOpen','backButton','localNotificationActionPerformed','resume']);
a.events.backButton({ canGoBack: true });
assert.equal(a.actions.at(-1), 'closeSheet');
assert.equal(a.state.view, 'review');
a.events.backButton({ canGoBack: false });
assert.equal(a.actions.at(-1), 'go:home');
a.events.backButton({ canGoBack: true });
assert.equal(a.actions.at(-1), 'history.back');
a.events.backButton({ canGoBack: false });
assert.equal(a.actions.at(-1), 'exit');
a.events.resume();
assert.deepEqual(a.actions.slice(-2), ['info:[Lemma] Android resumed', 'event:focus']);
// A-owned account_sync already listens for window focus and coalesces pulls.
// Native resume should use that guarded path, not forge a network-online event.
const resumed = run();
resumed.events.resume();
resumed.events.resume();
assert.deepEqual(resumed.actions.filter(x => x === 'event:focus'), ['event:focus', 'event:focus']);
assert.equal(resumed.actions.some(x => x === 'event:online'), false);
const wakeFailure = run({ wakeReject: true });
wakeFailure.events.resume();
assert.equal(wakeFailure.actions.at(-1), 'warn:[Lemma] Native foreground wake unavailable');
assert.equal(wakeFailure.actions.some(x => x.includes('PRIVATE-DO-NOT-LOG')), false);
assert.equal(web.actions.some(x => x.startsWith('event:')), false, 'ordinary web remains inert');
const secondary = run({ view: 'browse' });
secondary.events.backButton({ canGoBack: false });
assert.equal(secondary.actions.at(-1), 'go:home');
assert.equal(secondary.actions.includes('exit'), false);
const root = run();
root.events.backButton();
assert.equal(root.actions.at(-1), 'exit');

// N3a is a pure native-only policy, NOT an OS notification or a permission
// prompt. A later bridge must replace/cancel this stable ID on every change.
assert.equal(web.planDueReminder, undefined, 'no reminder surface in ordinary web');
const reminders = run();
const morning = new Date(2026, 9, 28, 7, 0, 0).getTime();
const due = new Date(2026, 9, 28, 8, 0, 0).getTime();
const desired = { optedIn: true, permission: 'granted', localTime: '08:30', earliestDueAt: due, now: morning };
const reminder = reminders.planDueReminder(desired);
assert.equal(reminder.id, 24001, 'one stable ID enables later cancel/replace');
assert.equal(reminder.at, new Date(2026, 9, 28, 8, 30, 0).getTime());
assert.equal(reminder.route, 'review');
assert.deepEqual(Object.keys(reminder).sort(), ['at', 'body', 'id', 'route', 'title']);
assert.equal(reminders.planDueReminder(desired).at, reminder.at, 'same state produces same reminder');
assert.equal(Object.isFrozen(reminder), true);
assert.equal(reminders.planDueReminder({ ...desired, optedIn: false }), null);
assert.equal(reminders.planDueReminder({ ...desired, optedIn: 1 }), null);
assert.equal(reminders.planDueReminder({ ...desired, permission: 'prompt' }), null);
assert.equal(reminders.planDueReminder({ ...desired, permission: 'denied' }), null);
assert.equal(reminders.planDueReminder({ ...desired, permission: undefined }), null);
for (const localTime of ['8:30', '24:00', '23:60', '08:3', '08:30:00', '08:30Z'])
  assert.equal(reminders.planDueReminder({ ...desired, localTime }), null);
for (const earliestDueAt of [-1, NaN, Infinity, '0', 1.5])
  assert.equal(reminders.planDueReminder({ ...desired, earliestDueAt }), null);
for (const now of [-1, NaN, Infinity, '0', 1.5])
  assert.equal(reminders.planDueReminder({ ...desired, now }), null);
const afterTime = new Date(2026, 9, 28, 8, 31, 0).getTime();
assert.equal(reminders.planDueReminder({ ...desired, now: afterTime }).at,
  new Date(2026, 9, 29, 8, 30, 0).getTime(), 'past configured time rolls to tomorrow');
const tomorrowDue = new Date(2026, 9, 29, 9, 0, 0).getTime();
assert.equal(reminders.planDueReminder({ ...desired, earliestDueAt: tomorrowDue }).at,
  new Date(2026, 9, 30, 8, 30, 0).getTime(), 'never notify before cards are due');
assert.equal(reminders.actions.some(x => /notify\.(check|request|schedule|cancel|channel)/.test(x)), false,
  'planner never requests permission or schedules a notification');

// Deep link registration is C-owned; only a later explicit A auth subscriber
// can exchange a PKCE code. No cloud session or user data is changed here.
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert.match(manifest, /<action android:name="android.intent.action.VIEW"\s*\/>/);
assert.match(manifest, /<category android:name="android.intent.category.BROWSABLE"\s*\/>/);
assert.match(manifest, /<data android:scheme="io\.lemma\.study" android:host="auth-callback"\s*\/>/);
assert.match(manifest, /android:launchMode="singleTask"/);
// The IME must request a resized WebView, not pan over the editor/sheets.
// This is a manifest/build contract, not physical keyboard evidence.
assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
assert.doesNotMatch(manifest, /android:windowSoftInputMode="adjustPan"/);
assert.equal(web.onAuthCallback, undefined);
assert.equal(web.openAuthBrowser, undefined, 'web OAuth must not use native browser API');
const auth = run();
const received = [];
const invalid = [
  'https://example.com/?code=example', 'io.lemma.study://evil?code=example',
  'io.lemma.study://auth-callback/path?code=example',
  'io.lemma.study://auth-callback#access_token=secret',
  'io.lemma.study://auth-callback?code=x#access_token=secret',
  'io.lemma.study://auth-callback', 'io.lemma.study://auth-callback?code=x&error=y',
  'io.lemma.study://auth-callback?code=x&code=y', 'io.lemma.study://auth-callback?error=x&error=y',
  'io.lemma.study://name@auth-callback?code=x', 'io.lemma.study://auth-callback?code='
];
for (const url of invalid) auth.events.appUrlOpen({ url });
assert.equal(auth.actions.filter(x => x.includes('secret')).length, 0);
auth.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=early' });
const unsubscribe = auth.onAuthCallback(url => received.push(url));
assert.deepEqual(received, ['io.lemma.study://auth-callback?code=early']);
auth.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=early' });
assert.equal(received.length, 1, 'same callback is delivered once');
auth.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=fresh&state=test' });
assert.equal(received.length, 2);
auth.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?error=access_denied' });
assert.equal(received.length, 3, 'failed sign-in is an explicit callback, not silent success');
unsubscribe();
auth.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=after-unsubscribe' });
assert.equal(received.length, 3);
assert.throws(() => auth.onAuthCallback(null), /function/);
const second = run();
const success = [];
second.onAuthCallback(() => { throw new Error('credential=secret'); });
second.onAuthCallback(url => success.push(url));
second.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=secret' });
assert.equal(success.length, 1, 'one faulty subscriber does not starve another');
assert.equal(second.actions.some(x => x.includes('secret')), false, 'never log callback secrets');
second.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=' + 'x'.repeat(4096) });
assert.equal(success.length, 1, 'oversized callback rejected');
// A stopped Android app may receive the URL only via App.getLaunchUrl().
// The same callback may also arrive via appUrlOpen; neither route duplicates it.
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const cold = run({ launchUrl: 'io.lemma.study://auth-callback?code=cold' });
  const coldSeen = [];
  cold.onAuthCallback(url => coldSeen.push(url));
  await settle();
  assert.deepEqual(coldSeen, ['io.lemma.study://auth-callback?code=cold']);
  cold.events.appUrlOpen({ url: 'io.lemma.study://auth-callback?code=cold' });
  assert.equal(coldSeen.length, 1, 'cold and warm callback must dedupe');
  const delayed = run({ launchUrl: 'io.lemma.study://auth-callback?error=user_cancelled' });
  await settle();
  const lateSeen = [];
  delayed.onAuthCallback(url => lateSeen.push(url));
  assert.deepEqual(lateSeen, ['io.lemma.study://auth-callback?error=user_cancelled']);
  // The native launcher only accepts this exact project's Google PKCE
  // authorize URL. Never fall back into a WebView or leak redirect/code data.
  const authorize = 'https://yemqnhnztlbyxmjxidis.supabase.co/auth/v1/authorize?' +
    new URLSearchParams({ provider:'google', redirect_to:'io.lemma.study://auth-callback',
      code_challenge:'X'.repeat(43), code_challenge_method:'s256' });
  const launch = run();
  await launch.openAuthBrowser(authorize);
  assert.deepEqual(launch.browserUrls, [authorize]);
  assert.ok(launch.actions.includes('browser.open'));
  await launch.closeAuthBrowser();
  assert.ok(launch.actions.includes('browser.close'));
  for (const rejected of [
    'https://attacker.test/auth/v1/authorize?provider=google',
    authorize.replace('https:', 'http:'),
    authorize.replace('/auth/v1/authorize', '/auth/v1/token'),
    authorize.replace('provider=google', 'provider=github'),
    authorize.replace('code_challenge_method=s256', 'code_challenge_method=plain'),
    authorize.replace('io.lemma.study%3A%2F%2Fauth-callback', 'https%3A%2F%2Fevil.test'),
    authorize + '&provider=google', authorize + '&code=stolen',
    authorize + '#access_token=stolen', authorize.replace('code_challenge=' + 'X'.repeat(43), 'code_challenge=short')
  ]) await assert.rejects(launch.openAuthBrowser(rejected), /Invalid native Google sign-in request/);
  assert.equal(launch.browserUrls.length, 1, 'untrusted URLs never reach Browser.open');
  const unavailableBrowser = run({ browserAvailable:false });
  await assert.rejects(unavailableBrowser.openAuthBrowser(authorize), /update the Android app/);
  assert.equal(unavailableBrowser.actions.includes('register:Browser'), false);
  const failingBrowser = run({ browserReject:true });
  await assert.rejects(failingBrowser.openAuthBrowser(authorize), /Could not open the native sign-in browser/);
  assert.equal(failingBrowser.actions.some(x=>x.includes('PRIVATE-TOKEN')), false, 'browser error redacted');
  assert.equal(web.actions.includes('register:Browser'), false, 'ordinary web is always inert');
  // N3b must reconcile only its fixed reminder ID, never prompt, and never
  // touch a non-Lemma notification or leak plugin error details.
  assert.equal(web.reconcileDueReminder, undefined);
  const nativeReminder = run();
  const scheduled = await nativeReminder.reconcileDueReminder(desired);
  assert.equal(scheduled.scheduled, true);
  assert.equal(scheduled.unchanged, false);
  assert.equal(nativeReminder.pendingNotifications.length, 1);
  assert.equal(nativeReminder.pendingNotifications[0].id, 24001);
  assert.equal(nativeReminder.pendingNotifications[0].schedule.at.getTime(), reminder.at);
  assert.equal(nativeReminder.pendingNotifications[0].extra.route, 'review');
  assert.equal(nativeReminder.pendingNotifications[0].title, 'Review cards');
  assert.equal(nativeReminder.actions.includes('notify.channel'), true);
  assert.equal(nativeReminder.actions.includes('notify.schedule'), true);
  assert.equal(nativeReminder.actions.some(x => /requestPermissions/.test(x)), false);
  const repeat = await nativeReminder.reconcileDueReminder(desired);
  assert.equal(repeat.unchanged, true);
  assert.equal(nativeReminder.actions.filter(x => x === 'notify.schedule').length, 1);
  assert.equal(nativeReminder.pendingNotifications.length, 1);
  const moved = await nativeReminder.reconcileDueReminder({ ...desired, localTime: '09:00' });
  assert.equal(moved.unchanged, false);
  assert.equal(nativeReminder.actions.filter(x => x === 'notify.cancel').length, 1);
  assert.equal(nativeReminder.pendingNotifications.length, 1, 'replace without duplicate');
  await nativeReminder.reconcileDueReminder({ ...desired, optedIn: false });
  assert.equal(nativeReminder.pendingNotifications.length, 0, 'opt-out cancels pending reminder');
  assert.equal(nativeReminder.actions.filter(x => x === 'notify.check').length, 3,
    'opt-out does not check/request permission');
  const denied = run({ notificationPermission: 'denied', pendingReminders: [{ id: 24001 }] });
  assert.equal((await denied.reconcileDueReminder(desired)).scheduled, false);
  assert.equal(denied.pendingNotifications.length, 0, 'permission revocation cancels stale reminder');
  assert.equal(denied.actions.includes('notify.schedule'), false);
  const invalid = run({ pendingReminders: [{ id: 24001 }] });
  assert.equal((await invalid.reconcileDueReminder({ ...desired, localTime: '25:00' })).scheduled, false);
  assert.equal(invalid.pendingNotifications.length, 0);
  const unrelated = run({ pendingReminders: [{ id: 999, title: 'Other' }] });
  await unrelated.reconcileDueReminder({ ...desired, optedIn: false });
  assert.equal(unrelated.pendingNotifications.length, 1, 'never cancel other notification IDs');
  const noPlugin = run({ notificationsAvailable: false });
  assert.equal((await noPlugin.reconcileDueReminder({ optedIn: false })).scheduled, false);
  await assert.rejects(noPlugin.reconcileDueReminder(desired), /update the Android app/);
  assert.equal(noPlugin.actions.includes('register:LocalNotifications'), false);
  const failedNotifications = run({ notificationFail: true });
  await assert.rejects(failedNotifications.reconcileDueReminder(desired), /Could not update due reminders/);
  assert.equal(failedNotifications.actions.some(x => x.includes('PRIVATE-NOTIFICATION-ERROR')), false);
  assert.equal(web.actions.includes('register:LocalNotifications'), false);
  // N3c permission is inspected without a prompt; only the explicit B-owned
  // user action may invoke requestDueReminderPermission(). No consent is stored.
  assert.equal(web.onDueReminderTap, undefined);
  assert.equal(web.checkDueReminderPermission, undefined);
  assert.equal(web.requestDueReminderPermission, undefined);
  assert.equal(nativeReminder.actions.includes('notify.request'), false);
  assert.equal(await nativeReminder.checkDueReminderPermission(), 'granted');
  assert.equal(nativeReminder.actions.includes('notify.request'), false);
  const permissionDenied = run({ notificationPermission: 'denied', notificationRequestPermission: 'denied' });
  assert.equal(await permissionDenied.checkDueReminderPermission(), 'denied');
  assert.equal(permissionDenied.actions.includes('notify.request'), false);
  assert.equal(await permissionDenied.requestDueReminderPermission(), 'denied');
  assert.equal(permissionDenied.actions.filter(x => x === 'notify.request').length, 1);
  const permissionPrompt = run({ notificationPermission: 'prompt', notificationRequestPermission: 'granted' });
  assert.equal(await permissionPrompt.checkDueReminderPermission(), 'prompt');
  assert.equal(await permissionPrompt.requestDueReminderPermission(), 'granted');
  const missingPermissionPlugin = run({ notificationsAvailable: false });
  assert.equal(await missingPermissionPlugin.checkDueReminderPermission(), 'unavailable');
  await assert.rejects(missingPermissionPlugin.requestDueReminderPermission(), /update the Android app/);
  const permissionFailure = run({ permissionFail: true });
  await assert.rejects(permissionFailure.checkDueReminderPermission(), /Could not check notification permission/);
  await assert.rejects(permissionFailure.requestDueReminderPermission(), /Could not request notification permission/);
  assert.equal(permissionFailure.actions.some(x => x.includes('PRIVATE-PERMISSION-ERROR')), false);

  // Only the exact Lemma fixed-ID default tap and review route can reach a
  // subscriber. Cold taps are queued until the app's UI explicitly subscribes.
  const tapped = run();
  assert.equal(tapped.actions.includes('notify.request'), false);
  const validTap = { actionId: 'tap', notification: { id: 24001, extra: { route: 'review' } } };
  tapped.events.localNotificationActionPerformed(validTap);
  const tappedRoutes = [];
  const unsubscribeTap = tapped.onDueReminderTap(route => tappedRoutes.push(route));
  assert.deepEqual(tappedRoutes, ['review'], 'early tap delivered once after subscription');
  tapped.events.localNotificationActionPerformed(validTap);
  assert.deepEqual(tappedRoutes, ['review'], 'duplicate action object not replayed');
  for (const invalidTap of [
    { actionId: 'dismiss', notification: { id: 24001, extra: { route: 'review' } } },
    { actionId: 'tap', notification: { id: 999, extra: { route: 'review' } } },
    { actionId: 'tap', notification: { id: 24001, extra: { route: 'settings' } } },
    { actionId: 'tap', notification: { id: 24001 } },
    { actionId: 'tap', notification: { id: '24001', extra: { route: 'review' } } },
    null, {}, { actionId: 'tap', notification: null }
  ]) tapped.events.localNotificationActionPerformed(invalidTap);
  assert.deepEqual(tappedRoutes, ['review'], 'unrelated or malformed actions ignored');
  tapped.events.localNotificationActionPerformed({ ...validTap });
  assert.deepEqual(tappedRoutes, ['review', 'review'], 'new valid tap is delivered');
  unsubscribeTap();
  tapped.events.localNotificationActionPerformed({ ...validTap });
  assert.deepEqual(tappedRoutes, ['review', 'review'], 'unsubscribed listener is not called');
  const laterRoutes = [];
  tapped.onDueReminderTap(route => laterRoutes.push(route));
  assert.deepEqual(laterRoutes, ['review'], 'one pending tap is replayed to later subscriber');
  assert.throws(() => tapped.onDueReminderTap(null), /function/);
  const badSubscriber = run();
  badSubscriber.onDueReminderTap(() => { throw new Error('PRIVATE-NOTIFICATION-PAYLOAD'); });
  const goodRoutes = [];
  badSubscriber.onDueReminderTap(route => goodRoutes.push(route));
  badSubscriber.events.localNotificationActionPerformed({ ...validTap });
  assert.deepEqual(goodRoutes, ['review']);
  assert.equal(badSubscriber.actions.some(x => x.includes('PRIVATE-NOTIFICATION-PAYLOAD')), false);
  assert.equal(web.actions.includes('notify.listen:localNotificationActionPerformed'), false);
  assert.equal(missingPermissionPlugin.actions.some(x => x.startsWith('notify.listen:')), false);
  console.log('ok: Android native Back/resume, PKCE, guarded reminder permission, tap and reconciliation');
})().catch(error => { console.error(error); process.exitCode = 1; });
