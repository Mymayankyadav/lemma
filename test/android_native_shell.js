'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/native_shell.js', 'utf8');

function run({ native = true, available = true, browserAvailable = true, browserReject = false, wakeReject = false, sheet = false, view = 'home', launchUrl = null } = {}) {
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
  const cap = {
    isNativePlatform: () => native,
    isPluginAvailable: name => {
      if (name === 'App') return available;
      if (name === 'Browser') return browserAvailable;
      throw new Error('Unexpected Capacitor plugin');
    },
    registerPlugin: name => {
      if (name === 'App') { actions.push('register'); return plugin; }
      if (name === 'Browser') { actions.push('register:Browser'); return browser; }
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
  return { events, actions, browserUrls, state, enabled: ctx.nativeShell.enabled, onAuthCallback: ctx.nativeShell.onAuthCallback, openAuthBrowser: ctx.nativeShell.openAuthBrowser, closeAuthBrowser: ctx.nativeShell.closeAuthBrowser };
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
  console.log('ok: Android native Back/resume foreground wake, scoped PKCE deep links, validated system-browser launch and web isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
