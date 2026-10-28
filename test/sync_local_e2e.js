'use strict';
// SYNC-04 L7 — real app + real local GoTrue, PostgREST, Realtime and Postgres.
// Every endpoint is loopback-only. Browser profiles are independent and kept
// throughout close/relaunch; no production accounts or credentials are used.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { localCredentials } = require('./auth_http_rls');

const ROOT = path.resolve(__dirname, '..');
const APP = 'http://127.0.0.1:4173/';
const AUTH = 'http://127.0.0.1:54321';
const MAIL = 'http://127.0.0.1:54324';
const T = 40000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sqlQuote = value => "'" + String(value).replaceAll("'", "''") + "'";
const psql = sql => execFileSync('psql', [
  '--no-psqlrc','--no-password','--no-align','--tuples-only',
  '--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
  '--username','postgres','--dbname','postgres','--command',sql
], {encoding:'utf8',timeout:20000,
  env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'} }).trim();

function staticServer() {
  const dist = path.join(ROOT,'dist');
  const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript',
    '.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
  return http.createServer((req,res)=>{
    const url = new URL(req.url,APP);
    let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (url.pathname === '/' || url.pathname.endsWith('/')) file=path.join(dist,'index.html');
    if (!file.startsWith(dist+path.sep) && file!==path.join(dist,'index.html')) {
      res.writeHead(403);res.end();return;
    }
    fs.readFile(file,(err,data)=>{
      if (err) {res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',
        'Cache-Control':'no-store'});res.end(data);
    });
  });
}
async function newProfile(dir) {
  return chromium.launchPersistentContext(dir,{
    headless:true,viewport:{width:1200,height:850},serviceWorkers:'block'
  });
}
async function messageLink(email, afterIds) {
  for(let i=0;i<75;i++){
    const res=await fetch(MAIL+'/api/v1/messages');
    if (!res.ok) throw new Error('Local Mailpit API unavailable: '+res.status);
    const data=await res.json();
    const entries=data.messages||data.Messages||[];
    const hit=entries.find(m=>!afterIds.has(m.ID||m.Id||m.id) &&
      JSON.stringify(m).toLowerCase().includes(email.toLowerCase()));
    if(hit){
      const id=hit.ID||hit.Id||hit.id;
      const msgRes=await fetch(MAIL+'/api/v1/message/'+encodeURIComponent(id));
      if(!msgRes.ok) throw new Error('Mailpit message fetch failed');
      const msg=await msgRes.json();
      const body=[msg.Text,msg.HTML,msg.text,msg.html].filter(Boolean).join(' ');
      const raw=body.replaceAll('&amp;','&').match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
      if(!raw) throw new Error('Local magic link missing from Mailpit message');
      const link=raw[0].replace(/[).,]+$/,'');
      if(!link.startsWith(AUTH+'/auth/v1/verify?'))
        throw new Error('Refusing mail link outside local GoTrue');
      return link;
    }
    await sleep(250);
  }
  throw new Error('Local Mailpit email not received for disposable login');
}
async function knownMessages() {
  const r=await fetch(MAIL+'/api/v1/messages');
  if(!r.ok) throw new Error('Mailpit unavailable');
  const obj=await r.json();
  return new Set((obj.messages||obj.Messages||[]).map(m=>m.ID||m.Id||m.id));
}
async function login(page,email){
  await page.goto(APP);
  // App.boot() builds a shell immediately and finishes loading IndexedDB
  // asynchronously; clicking Settings before boot finishes is overwritten by
  // its final App.go('home'), which detaches the sign-in input mid-fill.
  await page.waitForFunction(
    () => document.querySelector('#sync')?.textContent?.includes('Saved on device'),
    null,{timeout:T});
  await page.locator('.tabs button[data-go="settings"]').click();
  await page.locator('#set-cloud-account input[type=email]').fill(email);
  const before=await knownMessages();
  await page.getByRole('button',{name:'Send sign-in link'}).click();
  await page.getByText('Check your email for a sign-in link.').waitFor({timeout:T});
  const link=await messageLink(email,before);
  // Same browser where OTP was requested: its PKCE verifier is isolated.
  await page.goto(link,{waitUntil:'domcontentloaded',timeout:T});
  await page.waitForURL(url=>url.origin===new URL(APP).origin,{timeout:T});
  await page.locator('.tabs button[data-go="settings"]').click();
  await page.locator('#set-cloud-account').getByText('Signed in:',{exact:false})
    .waitFor({timeout:T});
  assert.ok((await page.locator('#set-cloud-account').textContent()).includes(email));
  await page.locator('#set-cloud-account input[type=checkbox]').check();
  await page.getByRole('button',{name:'Use account workspace',exact:true}).first().click();
  await page.locator('.sheet-foot .btn-primary').click();
  await page.waitForFunction(()=>document.querySelector('#sync')?.textContent?.includes('Saved to cloud'),null,{timeout:T});
}
// UI-01-LIVE-STATUS-A1: screenshot only real authenticated local-stack state.
// This does not inject or replace the UI status getter. All content is a
// disposable synthetic test fixture; account Settings/email is not captured.
async function captureLiveSyncStatus(page, stage, expected) {
  await page.locator('.tabs button[data-go="home"]').click();
  // Wait briefly for asynchronous status propagation, but capture the
  // *unexpected* state too. A missing offline cue is an acceptance failure,
  // not a reason to lose the diagnostic screenshot.
  await page.waitForFunction(({ accepted }) => {
    const text = document.querySelector('#sync .sr-only')?.textContent || '';
    return accepted.includes(text);
  }, { accepted: expected }, { timeout: 5000 }).catch(() => {});
  const observed = await page.locator('#sync').evaluate(el => ({
    full: el.querySelector('.sr-only')?.textContent || '',
    visible: el.querySelector('.sync-label')?.textContent || '',
    role: el.getAttribute('role'),
    online: navigator.onLine,
  }));
  const output = path.join(ROOT, 'test-output', 'live-ui');
  fs.mkdirSync(output, { recursive: true });
  for (const [size, viewport] of Object.entries({
    mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 },
  })) {
    for (const scheme of ['light', 'dark']) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.screenshot({ path: path.join(output, stage + '-' + size + '-' + scheme + '.png') });
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.emulateMedia({ colorScheme: 'light' });
  assert.ok(expected.includes(observed.full),
    stage + ': unexpected real status ' + JSON.stringify(observed));
  assert.equal(observed.role, 'status', stage + ': missing live status accessibility role');
  if (stage === 'offline') assert.ok(['Offline', 'Queued'].includes(observed.visible),
    'real offline queued edit needs a visible offline/queued indicator');
  else assert.equal(observed.full, 'Saved to cloud');
  console.log('ok: real local-stack ' + stage + ' UI status and four screenshots (' +
    observed.full + ')');
}

async function waitForAccountWorkspace(page, expectedUserId, timeout = T) {
  // build.js bundles internal Store/App into a closed scope; they are NOT
  // browser globals. Verify the real user-facing mode using Settings, where
  // "Return to device workspace" is visible only when Store.mode=account.
  const until=Date.now()+timeout;
  while(Date.now()<until){
    const user=await browserUserId(page);
    if (user !== expectedUserId) throw new Error('Persisted auth identity changed during account restoration');
    if (!await page.locator('#set-cloud-account').count()) {
      await page.locator('.tabs button[data-go="settings"]').click();
    }
    const active=await page.getByRole('button',{name:'Return to device workspace',exact:true})
      .isVisible().catch(()=>false);
    if(active) return;
    await sleep(500);
  }
  const evidence={
    remembered:await page.evaluate(id=>localStorage.getItem('lemma-account-workspace-v1')===id,expectedUserId),
    syncStatus:await page.locator('#sync').textContent().catch(()=>'(missing)'),
    accountSwitchVisible:await page.getByRole('button',{name:'Use account workspace',exact:true}).isVisible().catch(()=>false),
    deviceSwitchVisible:await page.getByRole('button',{name:'Return to device workspace',exact:true}).isVisible().catch(()=>false)
  };
  console.error('UI account-restore diagnostic (no credentials):',JSON.stringify(evidence));
  throw new Error('Account workspace did not become visibly active after browser relaunch');
}
async function browserUserId(page) {
  return page.evaluate(() => {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if (!key || !key.endsWith('-auth-token')) continue;
      try {
        const data=JSON.parse(localStorage.getItem(key));
        if(data?.access_token && data?.user?.id) return data.user.id;
      } catch { /* not a session entry */ }
    }
    return null;
  });
}
async function browse(page){
  // Navigate once. Repeated navigation inside an eventual() poll resets the
  // list before its deferred draw() runs, producing a false non-convergence.
  await page.locator('.tabs button[data-go="browse"]').click();
  await page.locator('.browse .note-list').waitFor();
}
function row(page,title){
  return page.locator('.note-row').filter({hasText:title});
}
async function create(page,title,front,{ waitCloud = true } = {}){
  await page.locator('.btn-new').click();
  await page.locator('#ed-title').fill(title);
  await page.locator('#ed-deck').fill('SYNC-04');
  await page.locator('#ed-front').fill(front);
  await page.locator('#ed-back').fill('Disposable local sync fixture');
  await page.locator('.sheet-foot .btn-primary').click();
  // The local IndexedDB transaction must commit before simulating a crash.
  await page.locator('.sheet-editor').waitFor({state:'hidden',timeout:T});
  if(waitCloud) await page.waitForFunction(
    ()=>document.querySelector('#sync')?.textContent?.includes('Saved to cloud'),
    null,{timeout:T});
}
async function edit(page,title,front,remove=false){
  await browse(page);
  await row(page,title).first().click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  if(remove) {
    await page.locator('.sheet-foot .btn-ghost-danger').click();
    await page.locator('.sheet-foot .btn-danger').click();
  } else {
    await page.locator('#ed-front').fill(front);
    await page.locator('.sheet-foot .btn-primary').click();
  }
}
function dbNote(title){
  const rows=psql("select id || '|' || revision || '|' || (deleted_at is not null)::text from public.notes "+
    "where data->>'title'="+sqlQuote(title));
  if(!rows) return null;
  const parts=rows.split('\n');
  assert.equal(parts.length,1,'fixture title must be unique');
  const [id,revision,deleted]=parts[0].split('|');
  return {id,revision:Number(revision),deleted:deleted==='true' || deleted==='t'};
}
async function debugOutbox(page,uid,entityId) {
  // Diagnostic only. Read operation metadata, never log auth tokens or note text.
  return page.evaluate(({uid,entityId})=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('lemma-user-'+uid,3);
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result;
      const tx=db.transaction(['notes','outbox'],'readonly');
      const notes=tx.objectStore('notes').get(entityId);
      const queue=tx.objectStore('outbox').getAll();
      tx.oncomplete=()=>{
        const n=notes.result;
        const ops=(queue.result||[]).filter(op=>op.entityId===entityId)
          .map(op=>({kind:op.kind,deleted:op.deleted,expectedRevision:op.expectedRevision,
            state:op.state,attempts:op.attempts,error:String(op.lastError||'').slice(0,180)}));
        db.close();
        resolve({note:n?{revision:n.revision,dirty:n.dirty,deleted:n.deleted}:null,ops});
      };
      tx.onerror=()=>{db.close();reject(tx.error);};
    };
  }),{uid,entityId});
}
async function debugQueue(page,uid,title) {
  return page.evaluate(({uid,title})=>new Promise((resolve,reject)=>{
    const opening=indexedDB.open('lemma-user-'+uid,3);
    opening.onerror=()=>reject(opening.error);
    opening.onsuccess=()=>{
      const db=opening.result,tx=db.transaction(['notes','outbox'],'readonly');
      const notes=tx.objectStore('notes').getAll(),outbox=tx.objectStore('outbox').getAll();
      tx.oncomplete=()=>{
        const n=(notes.result||[]).find(row=>row.data?.title===title);
        resolve({
          note:n?{present:true,revision:n.revision,dirty:n.dirty,deleted:n.deleted}:null,
          operations:(outbox.result||[]).slice(0,15).map(op=>({
            kind:op.kind,state:op.state,deleted:op.deleted,attempts:op.attempts,
            expectedRevision:op.expectedRevision,error:String(op.lastError||'').slice(0,180),
            matchesNote:Boolean(n&&op.entityId===n.id)
          }))
        });
        db.close();
      };
      tx.onerror=()=>{db.close();reject(tx.error);};
    };
  }),{uid,title});
}
function receiptCount(id) {
  return Number(psql('select count(*) from public.client_mutation_receipts where entity_type='+
    sqlQuote('note')+' and entity_id='+sqlQuote(id)));
}
async function eventual(label,fn,timeout=T){
  const until=Date.now()+timeout;
  let last;
  while(Date.now()<until){
    try { const v=await fn();if(v) return v; }
    catch(e){last=e;}
    await sleep(450);
  }
  throw new Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
async function run(){
  const {key}=localCredentials();
  if(!key) throw new Error('Missing local public API key');
  execFileSync(process.execPath,['build.js'],{
    cwd:ROOT,stdio:'inherit',timeout:60000,
    env:{...process.env,SUPABASE_URL:AUTH,SUPABASE_ANON_KEY:key,SUPABASE_PUBLISHABLE_KEY:key}
  });
  const server=staticServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(4173,'127.0.0.1',resolve));
  const prefix=fs.mkdtempSync(path.join(os.tmpdir(),'lemma-sync04-l7-'));
  const contexts=[], pages=[];
  try {
    for(const suffix of ['a','b','stranger']){
      const ctx=await newProfile(path.join(prefix,suffix));
      contexts.push(ctx); pages.push(await ctx.newPage());
    }
    const label='SYNC-04 L7 '+randomUUID();
    const email='sync04-'+randomUUID()+'@example.test';
    const stranger='sync04-'+randomUUID()+'@example.test';
    await login(pages[0],email);
    // Distinct persistent Chromium storage, never tabs sharing a profile.
    await sleep(1100); // GoTrue local OTP email minimum frequency.
    await login(pages[1],email);
    await login(pages[2],stranger);
    const owners=await Promise.all(pages.map(browserUserId));
    assert.ok(owners.every(Boolean),'each persistent browser must have a real local auth session');
    assert.equal(owners[0],owners[1],'two devices must use exactly the same auth.uid()');
    assert.notEqual(owners[0],owners[2],'third browser must be a different auth.uid()');

    // Keep peers on a stable rendered list while Realtime/poll refreshes it.
    await browse(pages[1]);
    await browse(pages[2]);
    await create(pages[0],label,'Initial independent-device proof');
    const created=await eventual('server create',()=>dbNote(label));
    assert.equal(created.revision,1);
    await eventual('peer remote create',async()=>await row(pages[1],label).count()===1)
      .catch(async err => {
        const status=await pages[1].locator('#sync').textContent().catch(()=>'(unavailable)');
        const cards=await pages[1].locator('.note-row').count().catch(()=>-1);
        const list=await pages[1].locator('.note-list').textContent().catch(()=>'(unavailable)');
        console.error('peer convergence diagnostic (no credentials):',JSON.stringify({
          status,cards,list:list.slice(0,160)
        }));
        throw err;
      });
    assert.equal(await row(pages[2],label).count(),0,'other owner cannot see private note');

    await edit(pages[0],label,'Updated remotely without manual sync');
    await eventual('server update',()=>dbNote(label)?.revision===2);
    await eventual('peer remote update',async()=>{
      const r=row(pages[1],label);
      return (await r.count())===1 && (await r.textContent()).includes('Updated remotely');
    });

    await edit(pages[0],label,'',true);
    await eventual('server tombstone',()=>dbNote(label)?.deleted===true)
      .catch(async error=>{
        const info={
          database:dbNote(label),receipts:receiptCount(created.id),
          browserStatus:await pages[0].locator('#sync').textContent().catch(()=>'(unavailable)'),
          local:await debugOutbox(pages[0],owners[0],created.id).catch(e=>({error:e.message}))
        };
        console.error('delete diagnostic, no credentials:',JSON.stringify(info));
        throw error;
      });
    await eventual('peer remote delete',async()=>await (await row(pages[1],label)).count()===0);
    await pages[1].reload();
    await pages[1].waitForFunction(
      ()=>document.querySelector('#sync')?.textContent?.includes('Saved to cloud'),
      null,{timeout:T});
    await browse(pages[1]);
    await eventual('peer reload after delete',async()=>await row(pages[1],label).count()===0);
    assert.deepEqual(dbNote(label),{id:created.id,revision:3,deleted:true},
      'delete cannot resurrect a note or erase its server tombstone');
    assert.equal(receiptCount(created.id),3,'exactly three successful note mutations');
    console.log('ok: live local create/update/delete, peer convergence, tombstone after reload, isolated other owner');

    // OFFLINE EDIT — first create an acknowledged server note, then modify
    // its text while offline, close the entire Chromium process and reopen
    // the SAME persistent profile. Only the second revision may be sent.
    const offlineTitle='SYNC-04 L7 offline '+randomUUID();
    await create(pages[0],offlineTitle,'Base text acknowledged while online');
    const onlineBase=await eventual('online base for offline edit',
      ()=>dbNote(offlineTitle)?.revision===1 ? dbNote(offlineTitle) : null);
    await eventual('base editor operation acknowledged',async()=>{
      const local=await debugOutbox(pages[0],owners[0],onlineBase.id);
      return local.note?.dirty===false && local.ops.length===0;
    });
    assert.equal(receiptCount(onlineBase.id),1);
    await contexts[0].setOffline(true);
    await edit(pages[0],offlineTitle,'Edited offline, then Chromium was closed');
    await pages[0].locator('.sheet-editor').waitFor({state:'hidden',timeout:T});
    await eventual('offline edit durably queued in IndexedDB',async()=>{
      const local=await debugOutbox(pages[0],owners[0],onlineBase.id);
      return local.note?.dirty===true && local.ops.some(op=>
        op.kind==='note' && op.state==='pending' && op.expectedRevision===1);
    });
    assert.equal(dbNote(offlineTitle)?.revision,1,'offline edit cannot change server revision');
    await captureLiveSyncStatus(pages[0], 'offline', [
      'Offline · changes queued on device', 'Saved on device · queued for cloud',
    ]);
    await contexts[0].close();
    const resumed=await newProfile(path.join(prefix,'a'));
    contexts[0]=resumed;
    pages[0]=await resumed.newPage();
    let refreshCalls=0;
    const refreshStatuses=[];
    pages[0].on('response',response=>{
      const url=new URL(response.url());
      if(url.origin===AUTH && url.pathname==='/auth/v1/token' &&
          url.searchParams.get('grant_type')==='refresh_token') refreshStatuses.push(response.status());
    });
    pages[0].on('request', request=>{
      const url=new URL(request.url());
      if (url.origin===AUTH && url.pathname==='/auth/v1/token' &&
          url.searchParams.get('grant_type')==='refresh_token') refreshCalls++;
    });
    await pages[0].goto(APP);
    const reopenedUid=await eventual('restored login after browser relaunch',
      ()=>browserUserId(pages[0]),T);
    assert.equal(reopenedUid,owners[0],'browser relaunch must not switch identity');
    // Do not open editor just because a token exists. The remembered private
    // workspace may still be hydrating its IndexedDB model after relaunch.
    await waitForAccountWorkspace(pages[0],owners[0],90000);
    const offlineRow=await eventual('offline edit delivered after relaunch',
      ()=>dbNote(offlineTitle)?.revision===2 ? dbNote(offlineTitle) : null,90000);
    assert.equal(offlineRow.id,onlineBase.id,'offline edit must not create another note');
    await eventual('offline edit receipt cleared',async()=>{
      const local=await debugOutbox(pages[0],owners[0],offlineRow.id);
      return local.ops.length===0 && local.note?.dirty===false;
    },90000);
    assert.equal(receiptCount(offlineRow.id),2,'offline edit adds exactly one receipt');
    await captureLiveSyncStatus(pages[0], 'recovered', ['Saved to cloud']);
    console.log('ok: offline EDIT survived full Chromium restart and synced one revision');

    // EXPIRY — Auth uses 60-second access tokens on the disposable stack.
    // After a real refresh_token grant, a new authenticated editor commit
    // must reach Postgres without manual sign-in or a second receipt.
    await eventual('local JWT renewal on persistent browser',()=>refreshCalls>0,90000);
    await eventual('successful refresh-token HTTP grant',()=>refreshStatuses.includes(200),90000);
    await waitForAccountWorkspace(pages[0],owners[0],90000);
    const refreshedTitle='SYNC-04 L7 refreshed '+randomUUID();
    await create(pages[0],refreshedTitle,'Sent after real refresh-token grant');
    const refreshed=await eventual('fresh-session commit',()=>dbNote(refreshedTitle))
      .catch(async err=>{
        const info={
          status:await pages[0].locator('#sync').textContent().catch(()=>'(unavailable)'),
          refreshStatuses,server:dbNote(refreshedTitle),
          local:await debugQueue(pages[0],owners[0],refreshedTitle).catch(e=>({error:e.message}))
        };
        console.error('post-refresh delivery diagnostic (no secrets):',JSON.stringify(info));
        throw err;
      });
    assert.equal(refreshed.revision,1);
    assert.equal(receiptCount(refreshed.id),1);
    console.log('ok: real short-JWT renewal and authenticated write without duplicate');

    // LOST ACK — let PostgREST perform the write, then abort only its
    // response. The real outbox retries the SAME request ID (receipt key).
    // A duplicate revision or duplicate receipt is a regression.
    const lostTitle='SYNC-04 L7 lost-response '+randomUUID();
    let aborted=false;
    const rpcUrl=AUTH+'/rest/v1/rpc/commit_note';
    await pages[0].route(rpcUrl,async route=>{
      if(aborted) { await route.continue(); return; }
      const result=await route.fetch();
      if(result.ok()){
        aborted=true;
        await route.abort('failed');
      } else await route.fulfill({response:result});
    });
    await create(pages[0],lostTitle,'Commit survived a lost HTTP response',{waitCloud:false});
    const lost=await eventual('committed write before aborted response',
      ()=>dbNote(lostTitle)?.revision===1?dbNote(lostTitle):null);
    assert.ok(aborted,'the route must actually abort a successful RPC response');
    await eventual('retry receipt reconciliation',async()=>{
      const local=await debugOutbox(pages[0],owners[0],lost.id);
      return local.note?.dirty===false && local.ops.length===0;
    },90000);
    await pages[0].unroute(rpcUrl);
    assert.equal(dbNote(lostTitle)?.revision,1,'lost response retry must not increment revision');
    assert.equal(receiptCount(lost.id),1,'lost response retry must reuse idempotency receipt');
    console.log('ok: successful RPC response lost, retry acknowledged exactly one revision and receipt');

    await browse(pages[2]);
    assert.equal(await row(pages[2],offlineTitle).count(),0,'other user cannot observe offline note');
    assert.equal(await row(pages[2],lostTitle).count(),0,'other user cannot observe retried note');
  } finally {
    for(const ctx of contexts.reverse()) await ctx.close().catch(()=>{});
    await new Promise(resolve=>server.close(resolve));
    // Only disposable test profiles are used; never delete a real user's cache.
  }
}
if(require.main===module)run().catch(err=>{console.error('FAIL SYNC-04 L7: '+err.stack);process.exitCode=1;});
module.exports={run};
