'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('src/app/cloud_account.js','utf8');
const callbackBase='io.lemma.study://auth-callback';
function harness({native=true,storage=new Map(),cold=null,launchError=false}={}) {
  const timers=[], oauth=[], exchanged=[], opened=[],closed=[],callbacks=[];
  let onAuthStateChange, currentUser=null, callback;
  const errors=[];
  const localStorage={
    getItem:k=>storage.get(k)||null,
    setItem:(k,v)=>storage.set(k,v),
    removeItem:k=>storage.delete(k)
  };
  const shell={
    enabled:native,
    onAuthCallback(fn) {
      callback=fn;
      if(cold) fn(cold);
      return ()=>{callback=null;};
    },
    async openAuthBrowser(url) {
      opened.push(url);
      if(launchError) throw new Error('browser secret '+url);
    },
    async closeAuthBrowser(){closed.push('closed');}
  };
  const client={auth:{
    onAuthStateChange(fn){onAuthStateChange=fn;},
    async getUser(){return {data:{user:currentUser},error:null};},
    async signInWithOAuth(args){
      oauth.push(args);
      return {data:{url:'https://lemma.example/auth/v1/authorize?provider=google&code_challenge=dummy'},
        error:null};
    },
    async signInWithOtp(){return {error:null};},
    async signOut(){
      currentUser=null;
      onAuthStateChange('SIGNED_OUT',null);
      return {error:null};
    },
    async exchangeCodeForSession(value){
      exchanged.push(value);
      if(value==='errorcode')return {error:new Error('sensitive token '+value)};
      currentUser={id:'native-user'};
      onAuthStateChange('SIGNED_IN',{user:currentUser});
      return {data:{user:currentUser,session:{user:currentUser}},error:null};
    }
  }};
  const ctx=vm.createContext({
    window:{LEMMA_CONFIG:{url:'https://lemma.example',publishableKey:'test'},localStorage,
      LemmaSupabase:{createClient:()=>client}},
    NativeShell:shell,Date,URL,
    location:{href:'https://lemma.test/lemma/'},history:{state:null,replaceState(){}},
    setTimeout(fn){timers.push(fn);}
  });
  vm.runInContext(code+'\nthis.account=LemmaAccount;',ctx);
  return {account:ctx.account,shell,oauth,exchanged,opened,closed,storage,
    errors,timers,emit:(url)=>callback(url),
    change:(user)=>{currentUser=user;onAuthStateChange('SIGNED_IN',user?{user}:null);} };
}
async function settle() {
  for(let i=0;i<6;i++) await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));
}
(async()=>{
  const a=harness();
  assert.equal(a.account.init(),true);
  await a.account.signInWithGoogle();
  assert.equal(a.oauth.length,1);
  assert.equal(a.oauth[0].provider,'google');
  assert.equal(a.oauth[0].options.redirectTo,callbackBase);
  assert.equal(a.oauth[0].options.skipBrowserRedirect,true);
  assert.equal(a.oauth[0].options.scopes,undefined);
  assert.equal(a.opened.length,1);
  assert.equal(a.account.user,null,'Google launch never changes account workspace');
  a.emit(callbackBase+'?code=validcode');
  await settle();
  assert.equal(a.account.user?.id,'native-user');
  assert.deepEqual(a.exchanged,['validcode']);
  a.emit(callbackBase+'?extra=1&code=validcode');
  await settle();
  assert.deepEqual(a.exchanged,['validcode'],'same PKCE code must not be exchanged twice');
  assert.equal(a.account.lastAuthError,'');
  assert.ok(a.closed.length>=1);
  assert.equal(a.storage.size,0,'pending marker removed after exchange');

  const cancel=harness();
  cancel.account.init();
  await cancel.account.signInWithGoogle();
  cancel.emit(callbackBase+'?error=access_denied&error_description=secret-value');
  await settle();
  assert.equal(cancel.exchanged.length,0);
  assert.match(cancel.account.lastAuthError,/cancelled/);
  assert.doesNotMatch(cancel.account.lastAuthError,/secret/);
  assert.equal(cancel.storage.size,0);
  const invalid=harness();
  invalid.account.init();
  await invalid.account.signInWithGoogle();
  for(const u of [
    'https://lemma.example/callback?code=validcode',
    callbackBase+'?code=validcode#access_token=secret',
    callbackBase+'?code=a&code=b',
    callbackBase+'?code=validcode&access_token=secret',
    callbackBase+'?code=short',
    callbackBase+'?code=validcode&error=bad'
  ]) invalid.emit(u);
  await settle();
  assert.equal(invalid.exchanged.length,0);
  invalid.emit(callbackBase+'?code=errorcode');
  await settle();
  assert.deepEqual(invalid.exchanged,['errorcode']);
  assert.match(invalid.account.lastAuthError,/Could not complete/);
  assert.doesNotMatch(invalid.account.lastAuthError,/errorcode|token/);

  const expired=harness();
  expired.account.init();
  await expired.account.signInWithGoogle();
  const key='lemma-native-google-pkce-pending-v1';
  expired.storage.set(key,JSON.stringify({v:1,at:Date.now()-11*60*1000,identity:null}));
  expired.emit(callbackBase+'?code=validcode');
  await settle();
  assert.equal(expired.exchanged.length,0);
  assert.match(expired.account.lastAuthError,/expired/);
  assert.equal(expired.storage.has(key),false);

  const aborted=harness();
  aborted.account.init();
  await aborted.account.signInWithGoogle();
  await aborted.account.signOut();
  aborted.emit(callbackBase+'?code=validcode');
  await settle();
  assert.equal(aborted.exchanged.length,0);
  assert.equal(aborted.storage.has(key),false);
  const changed=harness();
  changed.account.init();
  await changed.account.signInWithGoogle();
  changed.change({id:'another-user'});
  changed.emit(callbackBase+'?code=validcode');
  await settle();
  assert.equal(changed.exchanged.length,0);
  assert.equal(changed.account.user?.id,'another-user');

  const failedLaunch=harness({launchError:true});
  failedLaunch.account.init();
  await assert.rejects(failedLaunch.account.signInWithGoogle(),/Could not open Google sign-in/);
  assert.equal(failedLaunch.storage.has(key),false);
  assert.doesNotMatch(failedLaunch.account.lastAuthError,/challenge|secret/);

  // A cold process gets a persisted *nonsecret* pending marker and C's
  // one-time launch callback before Supabase's asynchronous getUser completes.
  const previous=harness();
  previous.account.init();
  await previous.account.signInWithGoogle();
  const cold=harness({storage:previous.storage,cold:callbackBase+'?code=coldcode'});
  cold.account.init();
  await settle();
  assert.deepEqual(cold.exchanged,['coldcode']);
  assert.equal(cold.account.user?.id,'native-user');
  assert.equal(cold.storage.has(key),false);

  const web=harness({native:false});
  web.account.init();
  await web.account.signInWithGoogle();
  assert.equal(web.oauth[0].options.redirectTo,'https://lemma.test/lemma/');
  assert.equal(web.oauth[0].options.skipBrowserRedirect,undefined);
  assert.equal(web.opened.length,0);
  assert.equal(web.storage.size,0);
  console.log('ok: native PKCE cold/warm, retry, error, expiry, cancel, identity guards and unchanged web sign-in');
})().catch(err=>{console.error(err);process.exitCode=1;});
