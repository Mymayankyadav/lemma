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
  await page.locator('.tabs button[data-go="browse"]').click();
  await page.locator('#main').waitFor();
}
async function row(page,title){
  await browse(page);
  return page.locator('.note-row').filter({hasText:title});
}
async function create(page,title,front){
  await page.locator('.btn-new').click();
  await page.locator('#ed-title').fill(title);
  await page.locator('#ed-deck').fill('SYNC-04');
  await page.locator('#ed-front').fill(front);
  await page.locator('#ed-back').fill('Disposable local sync fixture');
  await page.locator('.sheet-foot .btn-primary').click();
  await page.waitForFunction(()=>document.querySelector('#sync')?.textContent?.includes('Saved to cloud'),null,{timeout:T});
}
async function edit(page,title,front,remove=false){
  (await row(page,title)).first().click();
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
  return {id,revision:Number(revision),deleted:deleted==='t'};
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

    await create(pages[0],label,'Initial independent-device proof');
    const created=await eventual('server create',()=>dbNote(label));
    assert.equal(created.revision,1);
    await eventual('peer remote create',async()=>await (await row(pages[1],label)).count()===1)
      .catch(async err => {
        const status=await pages[1].locator('#sync').textContent().catch(()=>'(unavailable)');
        console.error('peer convergence diagnostic (no credentials):',status);
        throw err;
      });
    assert.equal(await (await row(pages[2],label)).count(),0,'other owner cannot see private note');

    await edit(pages[0],label,'Updated remotely without manual sync');
    await eventual('server update',()=>dbNote(label)?.revision===2);
    await eventual('peer remote update',async()=>{
      const r=await row(pages[1],label);
      return (await r.count())===1 && (await r.textContent()).includes('Updated remotely');
    });

    await edit(pages[0],label,'',true);
    await eventual('server tombstone',()=>dbNote(label)?.deleted===true);
    await eventual('peer remote delete',async()=>await (await row(pages[1],label)).count()===0);
    await pages[1].reload();
    await eventual('peer reload after delete',async()=>await (await row(pages[1],label)).count()===0);
    assert.deepEqual(dbNote(label),{id:created.id,revision:3,deleted:true},
      'delete cannot resurrect a note or erase its server tombstone');
    assert.equal(receiptCount(created.id),3,'exactly three successful note mutations');
    console.log('ok: two independent persistent browser contexts — real email PKCE login, create/update/delete convergence and tombstone reload; third owner isolated');
  } finally {
    for(const ctx of contexts.reverse()) await ctx.close().catch(()=>{});
    await new Promise(resolve=>server.close(resolve));
    // Only disposable test profiles are used; never delete a real user's cache.
  }
}
if(require.main===module)run().catch(err=>{console.error('FAIL SYNC-04 L7: '+err.stack);process.exitCode=1;});
module.exports={run};
