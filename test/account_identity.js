'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const timers = [];
const oauthCalls = [], otpCalls = [], clientArgs = [];
let cleanUrl;
let authEvent;
let resolveUser;
const initialUser = new Promise(resolve => { resolveUser = resolve; });
const client = { auth: {
  onAuthStateChange(fn) { authEvent = fn; },
  getUser() { return initialUser; },
  async signInWithOAuth(args) { oauthCalls.push(args); return {data:{url:'https://example.test/authorize'},error:null}; },
  async signInWithOtp(args) { otpCalls.push(args); return {data:{},error:null}; }
} };
const ctx = vm.createContext({
  window: { LEMMA_CONFIG: { url:'https://example.test', publishableKey:'test' },
    LemmaSupabase: { createClient: (...args) => {clientArgs.push(args);return client;} } },
  setTimeout(fn) { timers.push(fn); }, URL,
  location: { href:'https://lemma.test/lemma/?error=access_denied&error_description=Sign-in+cancelled&lang=en' },
  history: {state:null,replaceState(_state,_title,url){cleanUrl=url;}}
});
vm.runInContext(fs.readFileSync('src/app/cloud_account.js','utf8') + '\nglobalThis.account = LemmaAccount;', ctx);
(async () => {
  const identities = [], refreshes = [];
  const unsubscribe = ctx.account.onIdentityChange(user => identities.push(user?.id || null));
  ctx.account.onChange(user => refreshes.push(user?.id || null));
  assert.equal(ctx.account.init(), true);
  assert.equal(clientArgs[0][2].auth.flowType,'pkce');
  assert.equal(clientArgs[0][2].auth.detectSessionInUrl,true);
  assert.equal(clientArgs[0][2].auth.persistSession,true);
  assert.equal(ctx.account.lastAuthError,'Sign-in cancelled');
  assert.equal(cleanUrl,'/lemma/?lang=en', 'callback error params are removed while preserving other query keys');
  await ctx.account.signInWithGoogle();
  assert.equal(oauthCalls.length,1);
  assert.equal(oauthCalls[0].provider,'google');
  assert.equal(oauthCalls[0].options.redirectTo,'https://lemma.test/lemma/');
  assert.equal(oauthCalls[0].options.scopes,undefined,'Google API scopes are not requested');
  assert.equal(ctx.account.lastAuthError,'');
  await ctx.account.signIn('student@example.test');
  assert.equal(otpCalls[0].email,'student@example.test');
  assert.equal(otpCalls[0].options.emailRedirectTo,'https://lemma.test/lemma/');
  client.auth.signInWithOAuth=async()=>({error:new Error('Provider disabled')});
  await assert.rejects(ctx.account.signInWithGoogle(),/Provider disabled/);
  assert.equal(ctx.account.lastAuthError,'Provider disabled');
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
  console.log('ok: Google OAuth PKCE, callback errors, email fallback, account invalidation and stale identity guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
