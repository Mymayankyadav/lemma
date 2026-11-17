// S0 #1492: run the deployed selftest's edit/read/undo and transcription/read/undo
// sequences with intervening connector heartbeats, against every migration.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function service(fn){
 await db.exec('set role service_role');
 try{return await fn();}finally{await db.exec('reset role');}
}
const commit=(commands,source='chatgpt')=>service(async()=>(await q(
 'select public.mcp_commit($1,$2,$3,$4,$5::jsonb) r',
 [owner,'edit',source,'Selftest regression',JSON.stringify(commands)]))[0].r);
const seen=()=>service(()=>q('select public.mcp_seen($1)',[owner]));
const undo=(action,user=owner)=>service(async()=>(await q(
 'select public.undo_action($1::uuid,$2::bigint,false) r',[user,action]))[0].r);
const settingsChanges=async()=>(await q("select count(*)::int n from public.action_changes where table_name='settings'"))[0].n;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid) $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 for(const [id,secret] of [[owner,'a'],[other,'b']]){
  await q('insert into auth.users(id) values($1)',[id]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,secret.repeat(48)]);
 }
 const subject=(await q("insert into public.subjects(user_id,name,glyph,hue) values($1,'Selftest','z','slate') returning id",[owner]))[0].id;
 const project=(await q("insert into public.projects(user_id,subject_id,slug,title,goal,system) values($1,$2,'zz-selftest-123','Selftest','Prove a lemma',true) returning id",[owner,subject]))[0].id;
 const scan=(await q("insert into public.sources(user_id,project_id,title,short,has_text) values($1,$2,'Scan','scan',false) returning id",[owner,project]))[0].id;

 // The three production failure attempts journalled version/updated_source
 // changes on settings for both mcp_commit and each read heartbeat.
 const edited=await commit([{op:'update',table:'projects',where:{id:project},values:{target_date:'2027-01-15',target_label:'Prelim'}}]);
 await seen();await seen();
 await undo(edited.action);
 assert.equal((await q('select target_date from public.projects where id=$1',[project]))[0].target_date,null,
  'heartbeats must not prevent undo of planning metadata');

 const baseline=await settingsChanges();
 const version=(await q('select version from public.settings where user_id=$1',[owner]))[0].version;
 await seen();
 assert.equal(await settingsChanges(),baseline,'a heartbeat is not an owner settings edit');
 assert.equal((await q('select version from public.settings where user_id=$1',[owner]))[0].version,version+1,
  'the existing every-update version contract remains unchanged');
 const saved=await commit([
  {op:'insert',table:'source_pages',values:{source_id:scan,page:1,body:'A compact space has finite subcovers.',transcribed_by:'chatgpt',transcribed_at:new Date().toISOString(),confidence:'high'}},
  {op:'update',table:'sources',where:{id:scan},values:{has_text:true}},
 ]);
 await seen();
 // A different connector client can be observed while a read is in flight.
 await commit([],'claude');
 assert.equal(await settingsChanges(),baseline,'client telemetry alone is not a journalled settings edit');
 await assert.rejects(undo(saved.action,other),/not yours/);
 await undo(saved.action);
 assert.equal((await q('select count(*)::int n from public.source_pages where source_id=$1',[scan]))[0].n,0);
 assert.equal((await q('select has_text from public.sources where id=$1',[scan]))[0].has_text,false);
 assert.equal((await q('select connector_last_client from public.settings where user_id=$1',[owner]))[0].connector_last_client,'claude',
  'undo must preserve the most recent connection telemetry');

 // Standing owner settings remain journalled and undoable across reads.
 const prompt=await commit([{op:'update',table:'settings',where:{user_id:owner},values:{master_prompt:'Ask for a proof.'}}]);
 await seen();
 const undonePrompt=await undo(prompt.action);
 assert.equal((await q('select master_prompt from public.settings where user_id=$1',[owner]))[0].master_prompt,null);
 await seen();
 await undo(undonePrompt.as);
 assert.equal((await q('select master_prompt from public.settings where user_id=$1',[owner]))[0].master_prompt,'Ask for a proof.',
  'a heartbeat must also permit redo of the prompt');
 // A real later settings edit must still block undo, even when accompanied by telemetry.
 const first=await commit([{op:'update',table:'settings',where:{user_id:owner},values:{master_prompt:'First prompt'}}]);
 const second=await commit([{op:'update',table:'settings',where:{user_id:owner},values:{master_prompt:'Second prompt'}}],'claude');
 await seen();
 await assert.rejects(undo(first.action),/Undo A\d+ first/);
 assert.equal((await q('select master_prompt from public.settings where user_id=$1',[owner]))[0].master_prompt,'Second prompt');
 await undo(second.action);
 assert.equal((await q('select master_prompt from public.settings where user_id=$1',[owner]))[0].master_prompt,'First prompt');
 console.log('PASS incident #1492: planning, transcription and prompt undo tolerate telemetry; real conflicts and owner checks remain');
}finally{await db.close();}
