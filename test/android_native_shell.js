'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/native_shell.js', 'utf8');

function run({ native = true, available = true, sheet = false, view = 'home', launchUrl = null } = {}) {
  const events = {}, actions = [], state = { view, sheet };
  const plugin = {
    addListener(name, handler) { events[name] = handler; actions.push('listen:' + name); return Promise.resolve({ remove() {} }); },
    exitApp() { actions.push('exit'); return Promise.resolve(); },
    getLaunchUrl() { return Promise.resolve({ url: launchUrl }); },
  };
  const cap = {
    isNativePlatform: () => native,
    isPluginAvailable: name => { assert.equal(name, 'App'); return available; },
    registerPlugin: name => { assert.equal(name, 'App'); actions.push('register'); return plugin; },
  };
  const ctx = {
    URL,
    window: { Capacitor: cap, history: { back() { actions.push('history.back'); } } },
    Sheets: { closeTop() { if (!state.sheet) return false; state.sheet = false; actions.push('closeSheet'); return true; } },
    App: { get view() { return state.view; }, go(v) { state.view = v; actions.push('go:' + v); } },
    console: { warn(...x) { actions.push('warn:' + x.join(' ')); }, info(...x) { actions.push('info:' + x.join(' ')); } },
  };
  vm.runInNewContext(source + '\nthis.nativeShell = NativeShell;', ctx);
  return { events, actions, state, enabled: ctx.nativeShell.enabled, onAuthCallback: ctx.nativeShell.onAuthCallback };
}

const web = run({ native: false });
assert.equal(web.enabled, false);
assert.deepEqual(web.actions, []);
const absent = run({ available: false });
assert.equal(absent.enabled, false);
assert.match(absent.actions[0], /unavailable/);
const a = run({ sheet: true, view: 'review' });
assert.equal(a.enabled, true);
assert.deepEqual(Object.keys(a.events).sort(), ['appUrlOpen','backButton','resume']);
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
assert.equal(a.actions.at(-1), 'info:[Lemma] Android resumed');
const secondary = run({ view: 'browse' });
secondary.events.backButton({ canGoBack: false });
assert.equal(secondary.actions.at(-1), 'go:home');
assert.equal(secondary.actions.includes('exit'), false);
const root = run();
root.events.backButton();
assert.equal(root.actions.at(-1), 'exit');

// Deep link registration is C-owned; only a later explicit A auth subscriber
// can exchange a PKCE code. No cloud session or user data is changed here.
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert.match(manifest, /<action android:name="android.intent.action.VIEW"\s*\/>/);
assert.match(manifest, /<category android:name="android.intent.category.BROWSABLE"\s*\/>/);
assert.match(manifest, /<data android:scheme="io\.lemma\.study" android:host="auth-callback"\s*\/>/);
assert.match(manifest, /android:launchMode="singleTask"/);
assert.equal(web.onAuthCallback, undefined);
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
  console.log('ok: Android native Back/resume, cold/warm scoped PKCE deep links and web isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
