// ANDROID-02 N3-B1: pure coordinator checks, no Android device or permission prompt.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/view_settings.js'), 'utf8');
const begin = source.indexOf('/* Device-local Android reminder preference.');
const end = source.indexOf('const SettingsView = (() => {');
assert(begin >= 0 && end > begin, 'ReminderSettings module must precede SettingsView');

function harness({ native = true, permission = 'prompt', requestResult = 'granted',
  storageBroken = false } = {}) {
  const data = new Map();
  const calls = { request: 0, check: 0, reconcile: [], listeners: [], started: 0, routes: [] };
  let tap = null;
  let modelChange = null;
  let cards = [];
  let dueCounts = { learn: 0, review: 0 };
  let busy = false;
  let blocked = false;
  const localStorage = {
    getItem(key) { if (storageBroken) throw new Error('storage'); return data.get(key) || null; },
    setItem(key, value) { if (storageBroken) throw new Error('storage'); data.set(key, value); },
  };
  const shell = {
    enabled: native,
    async checkDueReminderPermission() { calls.check++; return permission; },
    async requestDueReminderPermission() { calls.request++; return requestResult; },
    async reconcileDueReminder(args) {
      calls.reconcile.push({ ...args });
      return { scheduled: !!args.optedIn };
    },
    onDueReminderTap(fn) { tap = fn; return () => { tap = null; }; },
  };
  const app = {
    loading: false,
    get workspaceBlocked() { return blocked; },
    workspaceIdle() { return !busy; },
    startSession() { calls.started++; },
    go(route) { calls.routes.push(route); },
  };
  const model = {
    cardRefs() { return cards; },
    isBuried(c, now) { return !!c.bury && c.bury > now; },
    counts() { return dueCounts; },
    onChange(fn) { modelChange = fn; return () => {}; },
  };
  const ctx = {
    NativeShell: shell, App: app, Model: model, Session: class {},
    window: { localStorage, addEventListener(name) { calls.listeners.push(name); } },
    document: { hidden: false, addEventListener(name) { calls.listeners.push(name); } },
    Date, Promise, JSON, Number, Math,
  };
  vm.runInNewContext(source.slice(begin, end) + '\nthis.reminders = ReminderSettings;', ctx);
  return {
    reminders: ctx.reminders, calls, data,
    setPermission(value) { permission = value; },
    setCards(value) { cards = value; },
    setDueCounts(value) { dueCounts = value; },
    setBusy(value) { busy = value; },
    setBlocked(value) { blocked = value; },
    tap(route) { assert(tap); tap(route); },
    changed() { assert(modelChange); modelChange(); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const web = harness({ native: false });
  web.reminders.init();
  assert.equal(web.reminders.read().optedIn, false);
  assert.equal((await web.reminders.enable('09:00')).ok, false);
  assert.equal(web.calls.check, 0);
  assert.equal(web.calls.request, 0);
  assert.equal(web.calls.reconcile.length, 0);
  assert.deepEqual(web.calls.listeners, []);

  const native = harness();
  native.reminders.init();
  native.reminders.init(); // only one tap and model listener registration
  await settle();
  assert.equal(native.calls.reconcile.length, 1);
  assert.equal(native.calls.reconcile[0].optedIn, false);
  assert.equal(native.calls.request, 0);
  assert.equal(native.reminders.read().localTime, '09:00');
  assert.equal(native.reminders.earliestDueAt(), null);

  const now = Date.now();
  native.setCards([
    { c: { st: 0, due: 0 } },
    { c: { st: 2, due: now - 60000, susp: true } },
    { c: { st: 2, due: now + 300000, bury: now + 3600000 } },
    { c: { st: 2, due: now + 7200000 } },
    { c: { st: 1, due: now - 30000 } },
  ]);
  assert.equal(native.reminders.earliestDueAt(), now - 30000);
  native.setCards([{ c: { st: 2, due: now - 60000, bury: now + 3600000 } }]);
  assert.equal(native.reminders.earliestDueAt(), now + 3600000,
    'a buried review becomes eligible after unbury rather than disappearing');
  native.setCards([{ c: { st: 1, due: now - 30000 } }]);
  const enabled = await native.reminders.enable('09:30');
  assert.equal(enabled.ok, true);
  assert.equal(native.calls.request, 1);
  assert.equal(native.reminders.read().optedIn, true);
  assert.equal(native.reminders.read().localTime, '09:30');
  assert.equal(native.calls.reconcile.at(-1).optedIn, true);
  assert.equal(native.calls.reconcile.at(-1).earliestDueAt, now - 30000);
  assert.equal(native.reminders.saveTime('25:00'), false);
  assert.equal(native.reminders.saveTime('10:45'), true);
  await native.reminders.reconcile();
  assert.equal(native.calls.reconcile.at(-1).localTime, '10:45');

  native.setCards([]);
  native.changed();
  await settle();
  await settle();
  assert.equal(native.calls.reconcile.at(-1).optedIn, false, 'no due card must cancel');
  assert.equal(native.reminders.read().optedIn, true, 'absence of due cards is not opt-out');

  native.setCards([{ c: { st: 2, due: now - 30000 } }]);
  native.setDueCounts({ learn: 0, review: 1 });
  native.tap('review');
  assert.equal(native.calls.started, 1);
  native.setBusy(true);
  native.tap('review');
  assert.equal(native.calls.started, 1, 'do not interrupt an active editor/review');
  native.setBusy(false);
  native.setBlocked(true);
  native.tap('review');
  assert.equal(native.calls.started, 1, 'do not open a blocked workspace');
  native.setBlocked(false);
  native.setDueCounts({ learn: 0, review: 0 });
  native.tap('review');
  assert.deepEqual(native.calls.routes, ['home']);

  native.setPermission('denied');
  await native.reminders.reconcile();
  assert.equal(native.calls.request, 1, 'reconciliation never requests permission');
  assert.equal(await native.reminders.disable(), true);
  assert.equal(native.reminders.read().optedIn, false);
  assert.equal(native.calls.reconcile.at(-1).optedIn, false);
  native.tap('review');
  assert.equal(native.calls.started, 1, 'opt-out ignores stale notification taps');

  const denied = harness({ permission: 'denied' });
  assert.equal((await denied.reminders.enable('09:00')).reason, 'denied');
  assert.equal(denied.calls.request, 0);
  assert.equal(denied.reminders.read().optedIn, false);
  const refused = harness({ permission: 'prompt', requestResult: 'denied' });
  assert.equal((await refused.reminders.enable('09:00')).reason, 'denied');
  assert.equal(refused.calls.request, 1);
  assert.equal(refused.reminders.read().optedIn, false);
  const broken = harness({ permission: 'granted', storageBroken: true });
  assert.equal((await broken.reminders.enable('09:00')).reason, 'storage');
  assert.equal(broken.reminders.read().optedIn, false);
  const corrupt = harness();
  corrupt.data.set('lemma-due-reminder-v1', '{"v":1,"optedIn":true,"localTime":"bad"}');
  assert.equal(corrupt.reminders.read().optedIn, false);

  console.log('ANDROID-02 N3-B1 reminder consent, persistence, due, tap and web guards passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
