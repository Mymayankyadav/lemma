'use strict';
// Real Chromium UI; recovery transport is synthetic. Actual SQL/RLS acceptance
// lives in stack_knowledge_workspace_restore.js. Never contacts production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'test-output/ui');
fs.mkdirSync(OUT,{recursive:true});
const html=fs.readFileSync(path.join(ROOT,'dist/test.html'),'utf8');
const marker='/* ===== main.js ===== */';assert.ok(html.includes(marker));
// Production must remain hidden until migration #17 and live recovery gates.
const featureGate='const ACCOUNT_RECOVERY_READY = false;';
assert.ok(html.includes(featureGate),'the production bundle must keep recovery gated');
const enabled=html.replace(featureGate,'const ACCOUNT_RECOVERY_READY = true;');
const defaultApp=html.replace(marker,'window.__recoveryHooks={Account:LemmaAccount,Sync:LemmaSync,Bridge:LemmaCloudBridge,Store,get App(){return App;}};\n'+marker);
const app=enabled.replace(marker,'window.__recoveryHooks={Account:LemmaAccount,Sync:LemmaSync,Bridge:LemmaCloudBridge,Store,get App(){return App;}};\n'+marker);
const MOCK=fs.readFileSync(path.join(__dirname,'mock_claude.js'),'utf8');
const libs={'katex.min.js':'katex/dist/katex.min.js','marked.umd.js':'marked/lib/marked.umd.js','purify.min.js':'dompurify/dist/purify.min.js'};
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixture={app:'lemma',scope:'account-recovery-pair',ownerId:owner,
  server:{exportedAt:'2026-10-28T17:00:00Z'},local:{},manifest:{sha256:'a'.repeat(64)}};
async function main(){
  const browser=await chromium.launch();const errors=[];
  try{
    // Default production build exposes backup only after sign-in; restore is
    // not rendered, and an account switch during verification cancels export.
    for(const size of ['mobile','desktop'])for(const scheme of ['light','dark']){
      const ctx=await browser.newContext({viewport:size==='mobile'?{width:390,height:844}:{width:1280,height:800},colorScheme:scheme,serviceWorkers:'block',acceptDownloads:true});
      await ctx.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith('https://lemma.test/'))return route.fulfill({contentType:'text/html',body:defaultApp});
        for(const [name,pkg]of Object.entries(libs))if(url.endsWith(name))
          return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(ROOT,'node_modules',pkg),'utf8')});
        if(url.includes('fonts.googleapis.com'))return route.fulfill({contentType:'text/css',body:''});
        if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
        return route.abort();
      });
      const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(mock=>{window.__SEED__={};(0,eval)(mock);},MOCK);
      await page.goto('https://lemma.test/');await page.waitForSelector('.home');await page.waitForFunction(()=>!window.__recoveryHooks.App.loading);
      await page.evaluate(()=>window.__recoveryHooks.App.go('settings'));
      assert.equal(await page.locator('#set-account-backup').count(),0,'signed-out backup stays hidden');
      await page.evaluate(({owner,fixture})=>{
        const {Account,Sync,Bridge,App}=window.__recoveryHooks;Sync.stop();
        const state=window.__backupState={owner,calls:[],fixture,change:false},client={};
        Object.defineProperty(Account,'user',{configurable:true,get:()=>state.owner?{id:state.owner}:null});
        Object.defineProperty(Account,'client',{configurable:true,get:()=>client});
        Bridge.captureReadOnlyRecoveryPair=async flag=>{state.calls.push(['capture',flag]);return fixture;};
        Bridge.verifyReadOnlyRecoveryPair=async(value,id)=>{
          state.calls.push(['verify',id]);if(state.change)state.owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
          return {sha256:value.manifest.sha256};
        };
        App.go('settings');
      },{owner,fixture});
      const root=page.locator('#set-account-backup');await root.waitFor();
      assert.equal(await page.locator('#set-account-recovery').count(),0,'restore remains gated');
      assert.equal(await page.getByRole('button',{name:'Restore account backup'}).count(),0);
      assert.equal(await page.evaluate(()=>window.__backupState.calls.length),0,'no automatic export');
      const download=page.waitForEvent('download');await root.getByRole('button',{name:'Download account backup'}).click();
      assert.deepEqual(JSON.parse(fs.readFileSync(await (await download).path(),'utf8')),fixture);
      assert.deepEqual(await page.evaluate(()=>window.__backupState.calls.map(x=>x[0])),['capture','verify']);
      await root.screenshot({path:path.join(OUT,`account-backup-${size}-${scheme}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'backup section does not overflow');
      await page.evaluate(()=>{window.__backupState.change=true;});
      await root.getByRole('button',{name:'Download account backup'}).click();
      await root.getByRole('status').filter({hasText:'Account or workspace changed'}).waitFor();
      await ctx.close();
    }
    for(const size of ['mobile','desktop'])for(const scheme of ['light','dark']){
      const ctx=await browser.newContext({viewport:size==='mobile'?{width:390,height:844}:{width:1280,height:800},
        colorScheme:scheme,serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true});
      await ctx.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith('https://lemma.test/'))return route.fulfill({contentType:'text/html',body:app});
        for(const [name,pkg]of Object.entries(libs))if(url.endsWith(name))
          return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(ROOT,'node_modules',pkg),'utf8')});
        if(url.includes('fonts.googleapis.com'))return route.fulfill({contentType:'text/css',body:''});
        if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
        return route.abort();
      });
      const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(mock=>{window.__SEED__={};(0,eval)(mock);},MOCK);
      await page.goto('https://lemma.test/');await page.waitForSelector('.home');await page.waitForFunction(()=>!window.__recoveryHooks.App.loading);
      await page.evaluate(()=>window.__recoveryHooks.App.go('settings'));
      assert.equal(await page.locator('#set-account-recovery').count(),0,'signed-out user has no account recovery controls');
      await page.evaluate(({owner,fixture})=>{
        const {Account,Sync,Bridge,Store,App}=window.__recoveryHooks;
        Sync.stop();window.__recoveryState={owner,calls:[],failure:false,resumes:0,fixture};
        const state=window.__recoveryState,client={};
        Object.defineProperty(Account,'user',{configurable:true,get:()=>state.owner?{id:state.owner,email:'synthetic@example.test'}:null});
        Object.defineProperty(Account,'client',{configurable:true,get:()=>client});
        Object.defineProperty(Store,'mode',{configurable:true,get:()=> 'local'});
        Bridge.captureReadOnlyRecoveryPair=async flag=>{state.calls.push({action:'export',flag});return fixture;};
        Bridge.verifyReadOnlyRecoveryPair=async(value,id)=>{
          if(value.ownerId!==id||value.manifest?.sha256!=='a'.repeat(64))throw new Error('Corrupt backup or wrong account');
          return {serverRows:27,localRows:8,sha256:value.manifest.sha256};
        };
        Bridge.restoreRecoveryPair=async(value,options)=>{
          state.calls.push({action:'restore',options});
          if(state.failure&&!options.dryRun){state.failure=false;throw new Error('Connection lost. Keep this file and retry.');}
          return {status:options.dryRun?'validated':'restored'};
        };
        Sync.attach=async()=>{state.resumes++;};App.go('settings');
      },{owner,fixture});
      const root=page.locator('#set-account-recovery');await root.waitFor();
      assert.equal(await page.evaluate(()=>window.__recoveryState.calls.length),0,'render never exports or restores');
      const downloadPromise=page.waitForEvent('download');await root.getByRole('button',{name:'Download account backup'}).click();
      const downloaded=await downloadPromise;assert.match(downloaded.suggestedFilename(),/^lemma-account-backup-.*\.json$/);
      assert.deepEqual(JSON.parse(fs.readFileSync(await downloaded.path(),'utf8')),fixture,'actual private download contains returned pair');
      const choose=async data=>root.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
      await choose({...fixture,ownerId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
      await root.getByRole('status').filter({hasText:'Corrupt backup'}).waitFor();
      assert.equal(await root.getByRole('button',{name:'Check restore',exact:true}).isDisabled(),true);
      await choose(fixture);await root.getByRole('status').filter({hasText:'27 account records'}).waitFor();
      assert.equal(await root.getByRole('button',{name:'Restore account backup',exact:true}).isDisabled(),true);
      await root.getByRole('button',{name:'Check restore',exact:true}).click();
      await root.getByRole('status').filter({hasText:'Backup checked'}).waitFor();
      assert.equal(await root.getByRole('button',{name:'Restore account backup',exact:true}).isDisabled(),true,'preflight never authorizes restore');
      await root.locator('#account-recovery-consent').check();
      assert.equal(await root.locator('button:visible').evaluateAll(items=>items.every(b=>b.getBoundingClientRect().height>=44)),true,'recovery buttons have 44px targets');
      await page.evaluate(()=>{const r=document.querySelector('#set-account-recovery').getBoundingClientRect();window.scrollBy(0,r.top-64);});
      await root.screenshot({path:path.join(OUT,`account-recovery-${size}-${scheme}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal page overflow');
      await root.getByRole('button',{name:'Restore account backup',exact:true}).click();
      await page.getByRole('button',{name:'Cancel',exact:true}).last().click();
      assert.equal(await page.evaluate(()=>window.__recoveryState.calls.filter(c=>c.action==='restore'&&!c.options.dryRun).length),0,'cancel does not write');
      // Dry-run stopped sync. Leaving Settings must not hide the only explicit
      // resume action or silently approve/apply a backup on re-entry.
      await page.evaluate(()=>{const App=window.__recoveryHooks.App;App.go('home');App.go('settings');});
      await root.getByRole('status').filter({hasText:'Account sync is paused after recovery'}).waitFor();
      assert.equal(await root.getByRole('button',{name:'Resume account sync'}).isVisible(),true,
        'reopening Settings must retain explicit resume access');
      await root.getByRole('button',{name:'Clear selection'}).click();
      assert.equal(await root.getByRole('button',{name:'Resume account sync'}).isVisible(),true,
        'clearing a backup cannot strand the paused sync handle');
      await root.getByRole('button',{name:'Resume account sync'}).click();
      await root.getByRole('status').filter({hasText:'Account sync resumed'}).waitFor();
      assert.equal(await page.evaluate(()=>window.__recoveryState.resumes),1,
        'only the explicit resume action reattaches sync');
      await choose(fixture);await root.getByRole('status').filter({hasText:'27 account records'}).waitFor();
      await root.getByRole('button',{name:'Check restore',exact:true}).click();
      await root.locator('#account-recovery-consent').check();
      await page.evaluate(()=>{window.__recoveryState.failure=true;});
      await root.getByRole('button',{name:'Restore account backup',exact:true}).click();
      await page.getByRole('button',{name:'Restore and resume edits',exact:true}).click();
      await root.getByRole('status').filter({hasText:'Connection lost'}).waitFor();
      const request=await page.evaluate(()=>window.__recoveryState.calls.at(-1).options.requestId);
      await root.getByRole('button',{name:'Restore account backup',exact:true}).click();
      await page.getByRole('button',{name:'Restore and resume edits',exact:true}).click();
      await root.getByRole('status').filter({hasText:'Account backup restored'}).waitFor();
      assert.equal(await page.evaluate(()=>window.__recoveryState.calls.at(-1).options.requestId),request,'retry preserves original request');
      await page.evaluate(()=>window.__recoveryHooks.App.go('settings'));
      await choose(fixture);await root.getByRole('status').filter({hasText:'27 account records'}).waitFor();
      await root.getByRole('button',{name:'Check restore',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__recoveryState.calls.at(-1).options.requestId),request,'reopening selection preserves durable retry key');
      await root.getByRole('button',{name:'Resume account sync',exact:true}).click();
      await root.getByRole('status').filter({hasText:'Account sync resumed'}).waitFor();
      assert.equal(await root.getByRole('button',{name:'Restore account backup',exact:true}).isDisabled(),true);
      await root.getByRole('button',{name:'Check restore',exact:true}).click();
      await root.locator('#account-recovery-consent').check();
      const count=await page.evaluate(()=>window.__recoveryState.calls.length);
      await page.evaluate(()=>{window.__recoveryState.owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';});
      await root.getByRole('button',{name:'Restore account backup',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__recoveryState.calls.length),count,'stale owner UI cannot restore');
      await ctx.close();
    }
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('PASS RELEASE recovery UI: real download, bounded owner validation, preflight, explicit consent/cancel, stable retry/reopen, account switch and four responsive screenshots (synthetic transport)');
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={main};
