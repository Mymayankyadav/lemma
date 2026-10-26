'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const timers = [];
let authEvent;
let resolveUser;
const initialUser = new Promise(resolve => { resolveUser = resolve; });
const client = { auth: {
  onAuthStateChange(fn) { authEvent = fn; },
  getUser() { return initialUser; }
} };
const ctx = vm.createContext({
  window: { LEMMA_CONFIG: { url:'https://example.test', publishableKey:'test' },
    LemmaSupabase: { createClient: () => client } },
  setTimeout(fn) { timers.push(fn); }, URL, location: { href:'https://lemma.test/' }
});
vm.runInContext(fs.readFileSync('src/app/cloud_account.js','utf8') + '\nglobalThis.account = LemmaAccount;', ctx);
(async () => {
  const identities = [], refreshes = [];
  const unsubscribe = ctx.account.onIdentityChange(user => identities.push(user?.id || null));
  ctx.account.onChange(user => refreshes.push(user?.id || null));
  assert.equal(ctx.account.init(), true);
  authEvent('SIGNED_IN', { user:{id:'A'} });
  assert.deepEqual(identities, ['A'], 'identity guards run before auth callback returns');
  assert.deepEqual(refreshes, [], 'API-capable listeners remain outside the auth callback');
  authEvent('SIGNED_IN', { user:{id:'B'} });
  authEvent('SIGNED_IN', { user:{id:'A'} });
  assert.deepEqual(identities, ['A','B','A'], 'rapid identity changes cannot collapse into one final identity');
  while (timers.length) timers.shift()();
  assert.deepEqual(refreshes, ['A','B','A'], 'deferred refresh retains each identity transition');
  resolveUser({ data:{ user:{id:'old-user'} }, error:null });
  await Promise.resolve();
  assert.equal(ctx.account.user.id, 'A', 'late getUser cannot undo the newer auth event');
  authEvent('TOKEN_REFRESHED', { user:{id:'A'} });
  assert.equal(identities.length, 3, 'same-identity refresh does not discard an active workspace');
  authEvent('SIGNED_OUT', null);
  assert.equal(identities.at(-1), null);
  unsubscribe();
  authEvent('SIGNED_IN', { user:{id:'B'} });
  assert.equal(identities.length, 4);
  console.log('ok: synchronous account invalidation, deferred refresh, rapid identity changes and stale initial lookup');
})().catch(error => { console.error(error); process.exitCode = 1; });
