// N49 owner-only proposal draft transaction, no implicit approval, receipt retry.
import assert from 'node:assert/strict';
const eq=(actual,expected,message)=>assert.equal(actual,expected,
 message||('N49_SQL_ASSERT '+(new Error().stack?.split('\n')[2]||'')));
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
 await db.exec("create function auth.uid() returns uuid language sql as $auth$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261116193000_n49_proposal_drafts.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[other,'b'.repeat(48)]);
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
 eq(created.status,'ok');eq(created.draft.draft_version,1);
 eq((await command(request)).draft.id,created.draft.id);
 eq((await command({...request,patch:{proposal_id:proposal,payload:{front:'Different'}}})).status,'conflict');
 const id=created.draft.id;
 const saved=await command(op('save',{payload:{front:'Final',back:'Final A'}},{id},1));
 eq(saved.draft.draft_version,2);
 eq((await command(op('save',{payload:{front:'Stale'}},{id},1))).status,'conflict');
 eq((await q('select status from public.proposals where id=$1',[proposal]))[0].status,'pending');
 const submitRequest=op('submit',{}, {id},2);
 const submit=await command(submitRequest);
 eq(submit.status,'ok');eq(submit.draft.status,'submitted');
 eq((await command(submitRequest)).revisedProposalId,submit.revisedProposalId,
   'same submit receipt replays without a second successor');
 assert.ok(submit.revisedProposalId,'submission returns the versioned N92 successor');
 eq((await q("select payload->>'front' front from public.proposals where id=$1",
  [submit.revisedProposalId]))[0].front,'Final');
 assert.ok((await q("select withdrawn_at from public.proposals where id=$1",[proposal]))[0].withdrawn_at,
   'N92 revision withdraws the original proposal, rather than rewriting it');
 eq((await q('select status from public.proposals where id=$1',[submit.revisedProposalId]))[0].status,
  'pending','submit is never an approval');
 eq((await q("select count(*)::int n from public.proposals where revised_from=$1",[proposal]))[0].n,1);
 eq(submit.changed.length,2,'receipt identifies the draft and its successor');
 // Undo reverses the entire single journal action: parent withdraw, new
 // revision, and submitted draft (without losing the saved draft).
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[owner]);
 const undone=(await q('select public.undo_action($1,$2,false) value',[owner,submit.actionNo]))[0].value;
 eq(Number(undone.undone),Number(submit.actionNo));
 eq((await q('select count(*)::int n from public.proposals where id=$1',
  [submit.revisedProposalId]))[0].n,0);
 eq((await q('select withdrawn_at from public.proposals where id=$1',[proposal]))[0].withdrawn_at,null);
 eq((await q('select status from public.proposal_drafts where id=$1',[id]))[0].status,'saved');
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[owner]);
 // Create a second draft of the same pending proposal: the older saved
 // draft cannot silently overwrite the more recent draft.
 const newer=await command(op('create',{proposal_id:proposal,payload:{front:'Newer',back:'Newer A'}}));
 eq(Number(newer.draft.draft_seq)>Number(created.draft.draft_seq),true,
  'newer draft always has a strictly larger monotonic sequence');
 const stale=await command(op('save',{payload:{front:'Old overwritten'}},{id},2));
 eq(stale.status,'conflict');assert.match(stale.reason,/Newer draft/);
 const discarded=await command(op('discard',{}, {id:newer.draft.id},1));
 eq(discarded.draft.status,'discarded');
 await assert.rejects(command(op('save',{}, {id},2)),/Save needs a complete payload/);
 // Owner isolation is enforced even through the security-definer RPC.
 await q("select set_config('test.uid',$1,false)",[other]);
 await assert.rejects(command(op('discard',{}, {id},3)),/not found for owner/i);
 // MCP service_role must operate as the supplied owner, not as service_role's
 // own user. It uses identical receipt semantics and provenance.
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcpRequest=op('create',{proposal_id:proposal,payload:{front:'MCP',back:'MCP A'}});
 const mcp=(await q('select public.mcp_command($1,$2,$3::jsonb) result',
  [owner,'chatgpt',JSON.stringify(mcpRequest)]))[0].result;
 eq(mcp.status,'ok');
 eq((await q('select count(*)::int n from public.proposal_drafts where id=$1',
  [mcp.draft.id]))[0].n,1);
 const mcpAction=(await q('select source,user_id from public.actions where no=$1',[mcp.actionNo]))[0];
 eq(mcpAction.source,'chatgpt');
 eq(mcpAction.user_id,owner);
 await db.exec('reset role');

 await db.exec('reset role');
 eq((await q("select count(*)::int n from public.lemma_command_resources where resource='proposal_drafts'"))[0].n,1);
 eq((await q("select count(*)::int n from public.lemma_undo_tables where table_name='proposal_drafts'"))[0].n,1);
 console.log('PASS N49 draft receipt, update, submit, owner isolation and no approval');
} finally {await db.close()}
