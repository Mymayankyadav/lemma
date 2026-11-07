// N49 owner-only proposal draft transaction, no implicit approval, receipt retry.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const sub='33333333-3333-4333-8333-333333333333';
const project='44444444-4444-4444-8444-444444444444';
const proposal='55555555-5555-4555-8555-555555555555';
let serial=0;
function op(operation,patch={},target={},expectedVersion){
 return {schemaVersion:1,resource:'proposal_drafts',
 operationId:'66666666-6666-4666-8666-'+String(++serial).padStart(12,'0'),
 operation,patch,target,...(expectedVersion===undefined?{}:{expectedVersion})};
}
const command=async input=>(await q('select public.proposal_drafts_command($1::jsonb) result',[JSON.stringify(input)]))[0].result;
try {
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$select nullif(current_setting('test.uid',true),'')::uuid $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261116193000_n49_proposal_drafts.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[sub,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'axioms','Axioms','Study')",[project,owner,sub]);
 await q("insert into public.proposals(id,user_id,project_id,kind,payload,reason,origin) values($1,$2,$3,'card',$4::jsonb,'Revise','chatgpt')",[proposal,owner,project,JSON.stringify({front:'One',back:'One answer'})]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[owner]);
 await assert.rejects(q("insert into public.proposal_drafts(user_id,proposal_id,base_proposal_version,payload) values($1,$2,1,'{}')",[owner,proposal]),/permission denied|row.level security/i);
 await assert.rejects(command(op('create',{proposal_id:proposal,
  target_id:'99999999-9999-4999-8999-999999999999',payload:{front:'X',back:'Y'}})),
  /Draft target not found for owner/);
 const request=op('create',{proposal_id:proposal,payload:{front:'Edited',back:'Answer'}});
 const created=await command(request);
 assert.equal(created.status,'ok');assert.equal(created.draft.draft_version,1);
 assert.equal((await command(request)).draft.id,created.draft.id);
 assert.equal((await command({...request,patch:{proposal_id:proposal,payload:{front:'Different'}}})).status,'conflict');
 const id=created.draft.id;
 const saved=await command(op('save',{payload:{front:'Final',back:'Final A'}},{id},1));
 assert.equal(saved.draft.draft_version,2);
 assert.equal((await command(op('save',{payload:{front:'Stale'}},{id},1))).status,'conflict');
 assert.equal((await q('select status from public.proposals where id=$1',[proposal]))[0].status,'pending');
 const submit=await command(op('submit',{}, {id},2));
 assert.equal(submit.status,'ok');assert.equal(submit.draft.status,'submitted');
 assert.equal((await q("select payload->>'front' front from public.proposals where id=$1",[proposal]))[0].front,'Final');
 assert.equal((await q('select status from public.proposals where id=$1',[proposal]))[0].status,'pending','submit is not approval');
 await q("select set_config('test.uid',$1,false)",[other]);
 await assert.rejects(command(op('discard',{}, {id},3)),/not found for owner/i);
 await db.exec('reset role');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='proposal_drafts'"))[0].n,1);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='proposal_drafts'"))[0].n,1);
 console.log('PASS N49 draft receipt, update, submit, owner isolation and no approval');
} finally {await db.close()}
