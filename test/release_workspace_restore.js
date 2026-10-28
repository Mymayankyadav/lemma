'use strict';
// Independent F acceptance. Default mode is network-free negative controls.
// --local runs the real A-owned GoTrue/PostgREST restore on disposable localhost,
// then compares every restored field independently of the restore implementation.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {TABLES,makeArchive,verify}=require('./release_workspace_archive');
const contract='lemma.workspace.restore.v1';
const canonical=value=>{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
};
const versions=()=>fs.readdirSync(path.join(__dirname,'../supabase/migrations'))
  .filter(x=>/^\d{14}_.*\.sql$/.test(x)).map(x=>x.slice(0,14)).sort();
function assertRoundTrip(archive,restored){
  const original=verify(archive);
  assert.deepEqual(archive.migrations,versions(),'restore acceptance must match exact source schema');
  assert.deepEqual(Object.keys(restored).sort(),TABLES,'all 19 restored tables, including empty tables');
  let rows=0;
  for(const table of TABLES){
    assert.ok(archive.tables[table].length>0,'acceptance fixture must actually exercise '+table);
    assert.ok(Array.isArray(restored[table]),'restored '+table+' is an array');
    // Compare complete records, not selected columns or counts. Array order of
    // SQL snapshots is unspecified; nested JSON arrays remain order-sensitive.
    const expected=archive.tables[table].map(canonical).sort();
    const actual=restored[table].map(canonical).sort();
    assert.deepEqual(actual,expected,'loss, duplication or field change in '+table);
    for(const row of restored[table])assert.equal(row.user_id,archive.ownerId,'restored owner');
    rows+=actual.length;
  }
  assert.equal(rows,original.count);
  assert.ok(archive.tables.study_context_revisions.length>=2,'accepted historical context revisions');
  assert.ok(archive.tables.study_plan_versions.length>=2,'initial plan and amendment both restored');
  assert.ok(archive.tables.notes.some(n=>Object.values(n.data?.cards||{}).some(c=>c.reps>0&&c.due>0)),
    'fixture must exercise scheduled cards, not only blank notes');
  // Revalidate FK/unique/checksum contract on the resulting full dataset.
  const after=makeArchive({...archive,tables:restored});
  assert.equal(after.manifest.sha256,archive.manifest.sha256,'independent integrity manifest after restore');
  return {tables:TABLES.length,rows,sha256:after.manifest.sha256};
}
function fixture(){
  const owner='11111111-1111-4111-8111-111111111111';
  const u=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');
  const tables=Object.fromEntries(TABLES.map(name=>[name,[]]));
  const add=(name,row)=>tables[name].push({user_id:owner,...row});
  add('profiles',{revision:4,data:{settings:{retention:0.92}}});
  add('notes',{id:'proof-card',revision:7,data:{front:'Synthetic theorem',cards:{1:{reps:5,due:123456,st:2}},log:[[100,1,3]],requires:['Earlier lemma']}});
  add('notes',{id:'deleted',revision:3,deleted_at:'2026-10-27T00:00:00Z',data:{}});
  add('client_mutation_receipts',{request_id:u(1),entity_type:'note',entity_id:'proof-card',payload_hash:'original',revision:7});
  add('review_events',{event_id:u(2),note_id:'proof-card',ordinal:0,grade:3,occurred_at_ms:100,scheduling_provenance:{algorithm:'FSRS'}});
  add('review_retractions',{retraction_id:u(3),target_event_id:u(2),reason:'undo'});
  add('study_context_files',{id:u(4),revision:2});
  for(const revision of [1,2])add('study_context_revisions',{context_id:u(4),revision,context_markdown:'Accepted '+revision});
  add('learning_sources',{id:u(5),title:'Synthetic reference'});
  add('learning_sections',{id:u(6),source_id:u(5),text_content:'Synthetic excerpt'});
  add('knowledge_source_versions',{source_id:u(5),context_id:u(4),context_revision:2,revision:1});
  add('knowledge_section_versions',{source_id:u(5),source_revision:1,section_id:u(6),text_content:'Pinned excerpt'});
  add('study_plans',{id:u(7),revision:2});
  for(const revision of [1,2])add('study_plan_versions',{plan_id:u(7),revision,context_id:u(4),context_revision:revision,snapshot:{checkpointIds:['c1']}});
  add('learning_sessions',{id:u(8),plan_id:u(7),state:'paused'});
  add('learning_events',{seq:10,event_id:u(9),session_id:u(8),payload:{text:'Unfinished proof',hintLevel:2}});
  add('study_checkpoints',{plan_id:u(7),checkpoint_id:'c1',last_evidence_event_id:u(9),status:'in_progress'});
  add('tutor_handoffs',{session_id:u(8),summary:{lastProof:'Unfinished proof',hintLevel:2}});
  add('tutor_handoff_receipts',{receipt_id:u(10),plan_id:u(7),plan_revision:2,checkpoint_id:'c1',action:'reply_reviewed',artifact_id:u(11)});
  add('learning_card_links',{note_id:'proof-card',session_id:u(8),relation:'generated',metadata:{source:'tutor proposal'}});
  return makeArchive({ownerId:owner,tables,migrations:versions(),exportedAt:'2026-10-28T17:00:00Z'});
}
function selfTest(){
  const archive=fixture();let negatives=0;
  assert.equal(assertRoundTrip(archive,structuredClone(archive.tables)).tables,19);
  for(const table of TABLES){
    for(const duplicate of [false,true]){
      const bad=structuredClone(archive.tables);
      if(duplicate)bad[table].push(structuredClone(bad[table][0]));else bad[table].pop();
      assert.throws(()=>assertRoundTrip(archive,bad));negatives++;
    }
  }
  for(const mutate of [
    t=>{t.notes[0].data.cards[1].due++;},t=>{t.notes[0].data.log[0][2]=4;},
    t=>{t.learning_events[0].payload.hintLevel=0;},t=>{t.study_context_revisions[0].context_markdown='changed';},
    t=>{t.knowledge_section_versions[0].source_revision=2;},t=>{t.tutor_handoff_receipts[0].artifact_id='changed';},
    t=>{t.client_mutation_receipts[0].payload_hash='changed';},t=>{t.profiles[0].user_id='foreign';}
  ]){const bad=structuredClone(archive.tables);mutate(bad);assert.throws(()=>assertRoundTrip(archive,bad));negatives++;}
  return {tables:19,negativeCases:negatives};
}
async function realPairRoundTrip(template){
  const {randomUUID}=require('node:crypto');
  const {chromium}=require('playwright');
  const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
  const {key}=localCredentials();assert.ok(isLocalAnonKey(key));
  const origin='http://127.0.0.1:54321';
  const signup=await fetch(origin+'/auth/v1/signup',{method:'POST',redirect:'error',
    headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({
      email:'paired-restore-'+randomUUID()+'@example.test',password:'Synthetic-'+randomUUID()+'-A9!'})});
  assert.ok(signup.ok);const auth=await signup.json();assert.ok(auth.user?.id&&auth.access_token);
  const ownerId=auth.user.id;
  const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
  const sql=statement=>execFileSync('psql',['--no-psqlrc','--no-password','--quiet','--tuples-only',
    '--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
    '--username','postgres','--dbname','postgres','--command',statement],{
      encoding:'utf8',timeout:20000,env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'}}).trim();
  const order=['notes','profiles','client_mutation_receipts','study_plans','study_context_files',
    'study_context_revisions','learning_sources','learning_sections','knowledge_source_versions',
    'knowledge_section_versions','study_plan_versions','learning_sessions','learning_events',
    'study_checkpoints','tutor_handoffs','tutor_handoff_receipts','review_events','review_retractions','learning_card_links'];
  const tables=structuredClone(template.tables);
  let seq=Number(sql('select coalesce(max(seq),0) from public.learning_events'));
  for(const name of TABLES)for(const row of tables[name]){
    row.user_id=ownerId;if(name==='learning_events')row.seq=++seq;
  }
  // Synthetic fixture owner only, on localhost. Preserve full real SQL rows
  // captured by the A fixture; fresh identity/sequence keys avoid other owners.
  sql('begin;'+order.map(name=>`insert into public.${name} overriding system value select * from jsonb_populate_recordset(null::public.${name},${quote(JSON.stringify(tables[name]))}::jsonb);`).join('')+'commit;');
  execFileSync(process.execPath,[path.join(__dirname,'../build.js')],{stdio:'inherit',
    env:{...process.env,SUPABASE_URL:origin,SUPABASE_ANON_KEY:key,SUPABASE_PUBLISHABLE_KEY:key}});
  const dist=path.join(__dirname,'../dist');
  const html=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('/* ===== main.js ===== */',
    'window.__fullRecovery={Bridge:LemmaCloudBridge,Account:LemmaAccount,Sync:LemmaSync,Cloud:LemmaCloud,Store,Model,get App(){return App;}};\n/* ===== main.js ===== */');
  const server=require('node:http').createServer((req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
    const filename=path.resolve(dist,'.'+pathname);
    if(!filename.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(filename,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':filename.endsWith('.js')?'text/javascript':'application/json'});res.end(err?'':data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch();
  try{
    const ctx=await browser.newContext({serviceWorkers:'block'});const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForSelector('.home');await page.waitForFunction(()=>!window.__fullRecovery.App.loading);
    await page.evaluate(async session=>{
      const {Account}=window.__fullRecovery;
      const response=await Account.client.auth.setSession(session);
      if(response.error)throw new Error(response.error.message);
    },{access_token:auth.access_token,refresh_token:auth.refresh_token});
    await page.waitForFunction(id=>window.__fullRecovery.Sync.status.phase==='ready'&&
      window.__fullRecovery.Sync.accountHandle()?.userId===id,ownerId,{timeout:40000});
    const pair=await page.evaluate(async()=>{
      const {Bridge,Sync,Store,Model}=window.__fullRecovery;
      Model.createNote({id:'separate-device-proof',front:'Separate device proof',back:'Keep this local'});
      await Store.whenSaved();
      const device=await Store.localSnapshot();window.__deviceBefore=JSON.stringify({notes:[...device.notes],profile:device.profile});
      const storage=Sync.accountHandle().storage;
      await storage.stageNote({id:'offline-recovered-proof',front:'Unsent proof attempt',back:'Draft',cards:{},log:[],requires:[],media:{}});
      await storage.saveKnowledgeDraft({contextId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        expectedLocalRevision:0,expectedRevision:0,title:'Unaccepted local context',markdown:'Unfinished proof',
        authorKind:'student',payload:{schema_version:1,summary:'Draft'}});
      const pair=await Bridge.captureReadOnlyRecoveryPair(true);
      Sync.stop();window.__pair=pair;return pair;
    });
    // Model complete data loss only for this freshly created synthetic owner.
    sql('begin;set local session_replication_role=replica;'+[...order].reverse()
      .map(name=>`delete from public.${name} where user_id=${quote(ownerId)};`).join('')+'commit;');
    await page.evaluate(async ownerId=>{
      await new Promise((resolve,reject)=>{
        const r=indexedDB.deleteDatabase('lemma-user-'+ownerId);
        r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Synthetic cache still open'));
      });
      const {Bridge,Account,Sync}=window.__fullRecovery;
      const requestId=crypto.randomUUID();window.__restoreId=requestId;
      const options={requestId,studentConfirmed:true};
      const preflight=await Bridge.restoreRecoveryPair(window.__pair,{...options,dryRun:true});
      if(preflight.status!=='validated')throw new Error('Paired preflight failed');
      // Lose one HTTP response AFTER the real database committed. The product
      // must pause before local writes and retry the original request receipt.
      const realRpc=Account.client.rpc.bind(Account.client);let lose=true;
      Account.client.rpc=(name,args)=>{
        const request=realRpc(name,args);
        if(name!=='restore_account_workspace'||args.p_dry_run||!lose)return request;
        lose=false;return {setHeader:async(...header)=>{
          const response=await request.setHeader(...header);
          if(response.error)throw new Error(response.error.message);
          return {error:{message:'Synthetic lost committed response'}};
        }};
      };
      let failed=false;
      try{await Bridge.restoreRecoveryPair(window.__pair,{...options,dryRun:false,resumeSync:true});}
      catch(e){if(!e.message.includes('Synthetic lost committed response'))throw e;failed=true;}
      if(!failed||Sync.accountHandle())throw new Error('Interrupted pair did not stay paused');
      const db=await window.__fullRecovery.Cloud.openAccountDB(ownerId);
      const blank=await new window.__fullRecovery.Cloud.AccountStorage(db,ownerId).localRecoverySnapshot();db.close();
      if(blank.stores.outbox.length||blank.stores.notes.length)throw new Error('Interrupted server response imported local work');
      // Hold the real Web Lock after restoration so assertions observe the
      // original queue BEFORE its explicitly consented automatic delivery.
      const attach=Sync.attach;window.__originalAttach=attach;
      Sync.attach=async user=>{
        let entered;const held=new Promise(resolve=>entered=resolve);
        window.__heldSync=navigator.locks.request('lemma-sync-'+ownerId,()=>{
          entered();return new Promise(resolve=>window.__releaseSync=resolve);
        });await held;return attach(user);
      };
      const result=await Bridge.restoreRecoveryPair(window.__pair,{...options,dryRun:false,resumeSync:true});
      if(result.status!=='restored')throw new Error('Real paired restore failed');
    },ownerId);
    const restored=await page.evaluate(async()=>{
      const {Account,Sync,Store}=window.__fullRecovery;
      const server=await Account.client.rpc('capture_account_workspace_snapshot');
      if(server.error)throw new Error(server.error.message);
      return {tables:server.data.tables,local:await Sync.accountHandle().storage.localRecoverySnapshot(),
        deviceUnchanged:window.__deviceBefore===await Store.localSnapshot().then(d=>JSON.stringify({notes:[...d.notes],profile:d.profile}))};
    });
    assertRoundTrip(pair.server,restored.tables);
    assert.equal(restored.deviceUnchanged,true,'separate device workspace never changes');
    for(const name of Object.keys(pair.local.snapshot.stores)){
      const rows=restored.local.stores[name].filter(r=>!String(r.key).startsWith('recovery:restore:v1:'));
      assert.deepEqual(rows,pair.local.snapshot.stores[name],'real browser restored local '+name);
    }
    const delivered=await page.evaluate(async()=>{
      const {Sync,Account}=window.__fullRecovery;
      Sync.attach=window.__originalAttach;window.__releaseSync();await window.__heldSync;
      await Sync.refresh();
      const requestId=window.__pair.local.snapshot.stores.outbox[0].value.requestId;
      const note=await Account.client.from('notes').select('data').eq('id','offline-recovered-proof');
      const receipt=await Account.client.from('client_mutation_receipts').select('request_id').eq('request_id',requestId);
      const draft=await Sync.accountHandle().storage.knowledgeDraft('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
      Sync.stop();return {note:note.data,receipts:receipt.data,draftStatus:draft.status};
    });
    assert.equal(delivered.note.length,1);assert.equal(delivered.note[0].data.front,'Unsent proof attempt');
    assert.equal(delivered.receipts.length,1,'restored queued write uses its ORIGINAL request exactly once');
    assert.equal(delivered.draftStatus,'draft','recovery never approves the unaccepted context');
    await ctx.close();
    console.log('PASS F real browser paired recovery: actual GoTrue/PostgREST, WebCrypto/IndexedDB/Web Locks, all 19 server tables + unsynced drafts/outbox, lost committed response/retry, original receipt delivery and device data unchanged');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}

async function main(){
  assert.ok(process.argv.length===2 || (process.argv.length===3&&process.argv[2]==='--local'),'invalid acceptance arguments');
  const controls=selfTest();
  if(process.argv[2]==='--local'){
    const {archive,restored}=await require('./stack_knowledge_workspace_restore').main();
    const result=assertRoundTrip(archive,restored);
    await realPairRoundTrip(archive);
    // Real IndexedDB implementation with forced late transaction abort, owner
    // separation, original queue IDs and a close/reopen retry. No cloud mocks
    // are counted as database evidence; the preceding HTTP test is real local.
    execFileSync(process.execPath,[path.join(__dirname,'account_local_recovery.js')],{stdio:'inherit'});
    execFileSync(process.execPath,[path.join(__dirname,'account_local_recovery_envelope.js')],{stdio:'inherit'});
    console.log('PASS F full restore acceptance: independently verified '+result.tables+' actual restored tables / '+result.rows+' records; exact schedules, immutable histories, source pins, tutor/learning receipts and local unsynced queues');
  }else console.log('PASS F restore comparator: 19 nonempty tables and '+controls.negativeCases+' loss/duplicate/tamper controls (network-free; real HTTP acceptance requires --local)');
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={contract,assertRoundTrip,selfTest,main};
