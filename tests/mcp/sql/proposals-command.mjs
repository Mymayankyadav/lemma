// N90 isolated full-migration PGlite test: no remote database writes.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const reset=async()=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid','',false)");
};
const as=async id=>{
 await reset();
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const cmd=(operation,id,expectedVersion,patch={},operationId=randomUUID())=>({
 schemaVersion:1,operationId,resource:'proposals',operation,
 target:{id},expectedVersion,patch,
});
const mcp=async (command,uid=owner)=>(await q(
 'select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
 [uid,'chatgpt',JSON.stringify(command)]))[0].result;
// The PGlite service_role fixture can invoke the command but has no direct
// table SELECT grant. Inspect test assertions through its fixture admin role.
const row=async id=>{
 const prior=(await q("select current_setting('role',true) as name"))[0].name;
 await db.exec('reset role');
 try{
  return (await q(
   'select id,version,status,withdrawn_at,revised_from from public.proposals where id=$1',
   [id]))[0];
 }finally{
  if(prior==='service_role'||prior==='authenticated')await db.exec('set role '+prior);
 }
};
const ok=v=>{assert.equal(v.status,'ok',JSON.stringify(v));assert.ok(v.actionNo>0);return v;};
const undo=async actionNo=>(await q(
 'select public.undo_action($1::uuid,$2::bigint,false) result',
 [owner,actionNo]))[0].result;
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
 "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
 "create function auth.uid() returns uuid language sql as $auth$ "+
 "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
 "nullif(current_setting('test.uid',true),'')::uuid) $auth$;"+
 "create function extensions.gen_random_bytes(n int) returns bytea language sql as "+
 "$bytes$select decode(repeat('00',n),'hex')$bytes$;"+
 "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(migrations.includes('20261208110000_n90_proposals_command.sql'));
 for(const file of migrations)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await reset();
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 // The audit journal is owner-atomic: seed separate owners in distinct writes.
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [other,'b'.repeat(48)]);
 const subj='33333333-3333-4333-8333-333333333333';
 const project='44444444-4444-4444-8444-444444444444';
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','amber')",
  [subj,owner]);
 await q("insert into public.projects(id,user_id,slug,subject_id,title,goal) "+
  "values($1,$2,'math',$3,'Math','Practice')",[project,owner,subj]);
 const create=async()=>(await q(
  "insert into public.proposals(user_id,project_id,kind,payload,origin) "+
  "values($1,$2,'card',$3::jsonb,'chatgpt') returning id,version",
  [owner,project,JSON.stringify({front:'Proof?',back:'A demonstration'})]))[0];
 const first=await create();
 await db.exec('set role service_role');
 const withdraw=cmd('withdraw',first.id,first.version);
 const withdrawn=ok(await mcp(withdraw));
 assert.deepEqual(await mcp(withdraw),withdrawn,'exact replay changed receipt');
 assert.equal((await mcp({...withdraw,patch:{extra:true}})).status,'conflict');
 assert.ok((await row(first.id)).withdrawn_at);
 assert.equal((await mcp(cmd('reopen',first.id,first.version))).status,'conflict',
  'stale version accepted');
 await assert.rejects(mcp(cmd('reopen',first.id,withdrawn.changed[0].version),other),
  /Proposal not found for owner/i);
 await as(owner);
 assert.equal((await undo(withdrawn.actionNo)).undone,withdrawn.actionNo);
 await reset();
 assert.equal((await row(first.id)).withdrawn_at,null,'withdraw undo failed');

 await db.exec('set role service_role');
 const withdrawnAgain=ok(await mcp(cmd('withdraw',first.id,first.version)));
 const reopen=cmd('reopen',first.id,withdrawnAgain.changed[0].version);
 const reopened=ok(await mcp(reopen));
 assert.deepEqual(await mcp(reopen),reopened);
 assert.equal((await row(first.id)).withdrawn_at,null);
 await as(owner);
 assert.equal((await undo(reopened.actionNo)).undone,reopened.actionNo);
 await reset();
 assert.ok((await row(first.id)).withdrawn_at,'reopen undo failed');

 const revisionSource=await create();
 await db.exec('set role service_role');
 const revise=cmd('revise',revisionSource.id,revisionSource.version,{
  payload:{front:'Revised question',back:'New answer'},citations:[],base_target_versions:{},
 });
 const revised=ok(await mcp(revise));
 assert.equal(revised.changed.length,2,'revision has two changed proposal versions');
 assert.deepEqual(await mcp(revise),revised,'revision replay differs');
 assert.equal((await mcp({...revise,patch:{payload:{front:'Altered'}}})).status,'conflict');
 const next=revised.proposal.id;
 assert.equal((await row(next)).status,'pending','revise must never auto-approve');
 assert.equal((await row(next)).revised_from,revisionSource.id);
 assert.ok((await row(revisionSource.id)).withdrawn_at);
 await assert.rejects(mcp(cmd('withdraw',revisionSource.id,
   revised.changed[0].version),other),/Proposal not found for owner/i);
 await as(owner);
 assert.equal((await undo(revised.actionNo)).undone,revised.actionNo);
 await reset();
 assert.equal(await row(next),undefined,'undo did not remove successor');
 assert.equal((await row(revisionSource.id)).withdrawn_at,null,
  'undo did not reinstate original');
 const registry=(await q(
  "select \"schema\" from public.lemma_command_resources where resource='proposals'"))[0].schema;
 assert.deepEqual(registry.operations,['withdraw','revise','reopen']);
 console.log('PASS N90 proposal versions, owner isolation, receipts, undo and registry');
}finally{await db.close()}
