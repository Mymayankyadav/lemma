'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/native_shell.js', 'utf8');

function run({ native = true, available = true, sheet = false, view = 'home' } = {}) {
  const events = {}, actions = [], state = { view, sheet };
  const plugin = {
    addListener(name, handler) { events[name] = handler; actions.push('listen:' + name); return Promise.resolve({ remove() {} }); },
    exitApp() { actions.push('exit'); return Promise.resolve(); },
  };
  const cap = {
    isNativePlatform: () => native,
    isPluginAvailable: name => { assert.equal(name, 'App'); return available; },
    registerPlugin: name => { assert.equal(name, 'App'); actions.push('register'); return plugin; },
  };
  const ctx = {
    window: { Capacitor: cap, history: { back() { actions.push('history.back'); } } },
    Sheets: { closeTop() { if (!state.sheet) return false; state.sheet = false; actions.push('closeSheet'); return true; } },
    App: { get view() { return state.view; }, go(v) { state.view = v; actions.push('go:' + v); } },
    console: { warn(...x) { actions.push('warn:' + x.join(' ')); }, info(...x) { actions.push('info:' + x.join(' ')); } },
  };
  vm.runInNewContext(source + '\nthis.enabled = NativeShell.enabled;', ctx);
  return { events, actions, state, enabled: ctx.enabled };
}

const web = run({ native: false });
assert.equal(web.enabled, false);
assert.deepEqual(web.actions, []);
const absent = run({ available: false });
assert.equal(absent.enabled, false);
assert.match(absent.actions[0], /unavailable/);
const a = run({ sheet: true, view: 'review' });
assert.equal(a.enabled, true);
assert.deepEqual(Object.keys(a.events).sort(), ['backButton','resume']);
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
console.log('ok: Android native Back/resume and web isolation');
