// N36.2 / D8(a) — all migrations in isolated PGlite, no remote calls.
// Confirms registry-owned allowlists, D7 parity and privileged MCP dispatch.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async (sql,values=[])=>(await db.query(sql,values)).rows;
/** Test-only privileged inspector. The service_role RPC exercises its real
 * grants; owner-row assertions run as fixture administrator then restore it. */
const inspect=async (sql,values=[])=>{
 await db.exec('reset role');
 try{return await q(sql,values)}
 finally{await db.exec('set role service_role')}
};
let counter=0;
function envelope(resource,operation,extra={}){
 return {
  operationId:'abcd0000-abcd-4abc-8abc-'+String(++counter).padStart(12,'0'),
  schemaVersion:1,resource,operation,...extra,
 };
}
const call=async (ownerId,source,p)=>{
 const rows=await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) value',
  [ownerId,source,JSON.stringify(p)]);
 return rows[0].value;
};
const oldStudy=async (ownerId,source,p)=>(await q(
 'select public.mcp_study_command($1::uuid,$2::text,$3::jsonb) value',
 [ownerId,source,JSON.stringify(p)]
))[0].value;
const oldTask=async (ownerId,source,p)=>(await q(
 'select public.mcp_task_command($1::uuid,$2::text,$3::jsonb) value',
 [ownerId,source,JSON.stringify(p)]
))[0].value;
const undo=async (ownerId,actionNo,force=false)=>(await q(
 'select public.undo_action($1::uuid,$2::bigint,$3::boolean) value',
 [ownerId,actionNo,force]
))[0].value;
const role=async name=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 if(name)await db.exec('set role '+name);
};
const as=async id=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const realAction=receipt=>{
 assert.equal(receipt.status,'ok');
 assert.ok(Number.isSafeInteger(receipt.actionNo)&&receipt.actionNo>0,
  'original command must preserve its journal actionNo');
};
const count=async(table,id)=>(await q('select count(*)::int n from public.'+table+' where id=$1',[id]))[0].n;

try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid
   )
  $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
    as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert.ok(files.some(f=>f.includes('registry_dispatch')),'N36.2 migration must be present');
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [other,'2'.repeat(48)]);

 const permitted=(await q("select table_name from public.lemma_undo_tables order by table_name")).map(row=>row.table_name);
 assert.equal(permitted.length,24);
 for(const table of ['settings','tasks','study_entries','study_intervals','calendar_blocks'])
  assert.ok(permitted.includes(table));
 const def=(await q("select pg_get_functiondef('public.undo_action(uuid,bigint,boolean)'::regprocedure) sql"))[0].sql;
 assert.match(def,/from public\.lemma_undo_tables/);
 assert.doesNotMatch(def,/foreach t in array array\[/);
 assert.doesNotMatch(def,/c\.table_name <> all\(array\[/);

 const acl=(await q(`select
   has_function_privilege('anon','public.mcp_command(uuid,text,jsonb)','execute') anon,
   has_function_privilege('authenticated','public.mcp_command(uuid,text,jsonb)','execute') member,
   has_function_privilege('service_role','public.mcp_command(uuid,text,jsonb)','execute') service`))[0];
 assert.equal(acl.anon,false,'anon must not invoke mcp_command');
 assert.equal(acl.member,false,'authenticated must not invoke mcp_command');
 assert.equal(acl.service,true,'service_role must invoke mcp_command');
 await as(owner);
 await assert.rejects(call(owner,'chatgpt',envelope('tasks','create',{patch:{title:'Unauthorized'}})),/permission denied|Service role required/i);
 await role('anon');
 await assert.rejects(call(owner,'chatgpt',envelope('tasks','create',{patch:{title:'Anonymous'}})),/permission denied|Service role required/i);
 await role(null);
 await assert.rejects(call(owner,'chatgpt',envelope('tasks','create',{patch:{title:'Admin'}})),/Service role required/);
 await role('service_role');

 const taskReq=envelope('tasks','create',{patch:{title:'Owner task',priority:'high'}});
 const task=await call(owner,'chatgpt',taskReq);
 realAction(task);
 assert.equal(task.changed[0].version,1);
 assert.equal((await inspect('select user_id from public.tasks where id=$1',[task.changed[0].id]))[0].user_id,owner);
 assert.deepEqual(await call(owner,'chatgpt',taskReq),task,'exact retry must preserve receipt');
 const conflict=await call(owner,'chatgpt',{...taskReq,patch:{title:'Changed payload'}});
 assert.equal(conflict.status,'conflict','different payload must not reuse a task operationId');
 const stale=await call(owner,'chatgpt',envelope('tasks','update',{
  target:{id:task.changed[0].id},expectedVersion:88,patch:{title:'Stale'}
 }));
 assert.equal(stale.status,'conflict');
 assert.equal(stale.conflict.currentVersion,1);
 const updated=await call(owner,'chatgpt',envelope('tasks','update',{
  target:{id:task.changed[0].id},expectedVersion:1,patch:{title:'Updated owner task'}
 }));
 realAction(updated);
 assert.equal(updated.changed[0].version,2);
 const inverse=await undo(owner,updated.actionNo);
 assert.equal(inverse.undone,updated.actionNo);
 assert.equal((await inspect('select title from public.tasks where id=$1',[task.changed[0].id]))[0].title,'Owner task');
 assert.equal((await inspect('select version from public.tasks where id=$1',[task.changed[0].id]))[0].version,1);
 const direct=await oldTask(owner,'claude',envelope('tasks','create',{patch:{title:'Original bridge'}}));
 realAction(direct);
 const journal=(await inspect('select user_id,source,tool from public.actions where no=$1',[task.actionNo]))[0];
 assert.equal(journal.user_id,owner,'dispatcher journals the authenticated owner');
 assert.equal(journal.source,'chatgpt','dispatcher journals the connector source');
 assert.equal(journal.tool,'study','dispatcher retains the bridge tool context');
 const connector=(await inspect('select connector_last_client from public.settings where user_id=$1',[owner]))[0];
 assert.equal(connector.connector_last_client,'claude');
 console.log('PASS registered task dispatch, owner attribution, operation retry, version conflict and undo');

 const calendar=envelope('calendar_blocks','create',{patch:{
  kind:'study',title:'Morning block',starts_at:'2026-11-06T08:00:00Z',
  ends_at:'2026-11-06T09:00:00Z',time_zone:'Asia/Kolkata',
 }});
 const block=await call(owner,'chatgpt',calendar);realAction(block);
 assert.equal((await inspect('select title from public.calendar_blocks where id=$1',[block.changed[0].id]))[0].title,'Morning block');
 assert.deepEqual(await call(owner,'chatgpt',calendar),block,'study bridge retries retain receipt');
 const bundo=await undo(owner,block.actionNo);
 assert.equal(bundo.undone,block.actionNo);
 assert.equal((await inspect('select count(*)::int n from public.calendar_blocks where id=$1',[block.changed[0].id]))[0].n,0);

 const study=await call(owner,'chatgpt',envelope('study_entries','create',{
  patch:{source:'timer',intent:'Registry study'},
 }));
 realAction(study);
 const entryId=study.changed[0].id;
 const interval=await call(owner,'chatgpt',envelope('study_intervals','create',{
  patch:{entry_id:entryId,kind:'focus',
   started_at:'2026-11-06T08:00:00Z',ended_at:'2026-11-06T08:20:00Z'},
 }));
 realAction(interval);
 assert.equal((await inspect('select count(*)::int n from public.study_intervals where entry_id=$1',[entryId]))[0].n,1);
 const iundo=await undo(owner,interval.actionNo);
 assert.equal(iundo.undone,interval.actionNo);
 assert.equal((await inspect('select count(*)::int n from public.study_intervals where entry_id=$1',[entryId]))[0].n,0);
 const old=await oldStudy(owner,'chatgpt',envelope('study_entries','create',{
  patch:{source:'manual',intent:'Original study bridge'},
 }));
 realAction(old);
 console.log('PASS registered calendar, study entry and interval dispatch plus original bridges');

 // No user-supplied function name or unregistered/disabled resource is executable.
 await assert.rejects(call(owner,'chatgpt',envelope('not_registered','create',{
  patch:{title:'Unknown'}})),/Unknown command resource/);
 await assert.rejects(call('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','chatgpt',
  envelope('tasks','create',{patch:{title:'Unknown owner'}})),/Owner not found/);
 await role(null);
 await q("update public.lemma_command_resources set mcp_ok=false where resource='tasks'");
 await role('service_role');
 await assert.rejects(call(owner,'chatgpt',envelope('tasks','create',{
  patch:{title:'Not permitted'}})),/Resource disabled for MCP/);
 await role(null);
 await q("update public.lemma_command_resources set mcp_ok=true where resource='tasks'");
 await role('service_role');
 await assert.rejects(call(owner,'chatgpt',{
  ...envelope('tasks','create',{patch:{title:'Function injection'}}),
  command_fn:'mcp_study_command',
 }),/Unknown command field/);
 const secondOwner=await call(other,'claude',envelope('tasks','create',{patch:{title:'Other owner'}}));
 realAction(secondOwner);
 await as(owner);
 await assert.rejects(undo(owner,secondOwner.actionNo),/not yours/);
 await assert.rejects(undo(other,secondOwner.actionNo),/Not authorized/);
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',[secondOwner.changed[0].id]))[0].n,0);
 await role('service_role');
 console.log('PASS disabled/unknown/forged function refusal and owner isolation');

 // A newly registered, journalled owner table works without a further undo
 // function replacement: both lock and allowlist are read from the registry.
 await role(null);
 await db.exec(`create table public.registry_undo_fixture(
  id uuid primary key, user_id uuid not null references auth.users(id), title text not null
 );
 create trigger lemma_log_change after insert or update or delete on public.registry_undo_fixture
  for each row execute function public.log_change();
 insert into public.lemma_undo_tables(table_name) values('registry_undo_fixture');`);
 const beforeDef=(await q("select pg_get_functiondef('public.undo_action(uuid,bigint,boolean)'::regprocedure) sql"))[0].sql;
 const rowId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await q('insert into public.registry_undo_fixture(id,user_id,title) values($1,$2,$3)',
  [rowId,owner,'Future row']);
 const action=(await q("select a.no from public.actions a join public.action_changes c on c.action_no=a.no where c.table_name='registry_undo_fixture' and c.op='insert' order by a.no desc limit 1"))[0].no;
 await as(owner);
 const result=await undo(owner,action);
 await role(null);
 assert.equal(result.undone,action);
 assert.equal(await count('registry_undo_fixture',rowId),0);
 const afterDef=(await q("select pg_get_functiondef('public.undo_action(uuid,bigint,boolean)'::regprocedure) sql"))[0].sql;
 assert.equal(afterDef,beforeDef,'new table is undoable without changing the function body');
 assert.equal((await q('select count(*)::int n from public.lemma_undo_tables'))[0].n,25);
 // A command registered only in this test must route through the same
 // dispatcher without any new per-resource MCP wrapper or function replacement.
 await db.exec(`create function public.registry_fixture_command(p jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $fixture$
 declare
  v_owner uuid; v_id uuid; v_action bigint; v_result jsonb;
 begin
  v_owner:=auth.uid();
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p ->> 'resource' is distinct from 'registry_undo_fixture' then
   raise exception 'Unexpected fixture resource';
  end if;
  v_id:=(p -> 'target' ->> 'id')::uuid;
  insert into public.registry_undo_fixture(id,user_id,title)
   values(v_id,v_owner,p -> 'patch' ->> 'title');
  select no into v_action from public.actions
   where txid=txid_current() and user_id=v_owner;
  if v_action is null then raise exception 'Fixture command not journalled'; end if;
  v_result:=pg_catalog.jsonb_build_object(
   'operationId',p ->> 'operationId','status','ok','actionNo',v_action,
   'changed',pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',v_id,'version',1)));
  insert into public.command_receipts(user_id,operation_id,resource,result)
   values(v_owner,(p ->> 'operationId')::uuid,'registry_undo_fixture',v_result);
  return v_result;
 end $fixture$;
 insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('registry_undo_fixture','registry_fixture_command',true,
 '{"operations":["create"],"fields":["title"]}'::jsonb);`);
 const nextId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const newCommand=envelope('registry_undo_fixture','create',{
  target:{id:nextId},patch:{title:'Registered future command'},
 });
 await role('service_role');
 const future=await call(owner,'chatgpt',newCommand);
 realAction(future);
 assert.equal(future.changed[0].id,nextId);
 const futureRow=(await inspect('select user_id,title from public.registry_undo_fixture where id=$1',[nextId]))[0];
 assert.equal(futureRow.user_id,owner);
 assert.equal(futureRow.title,'Registered future command');
 const receiptRow=(await inspect('select result from public.command_receipts where operation_id=$1',
  [newCommand.operationId]))[0];
 assert.deepEqual(receiptRow.result,future,'new command preserves the standard receipt');
 const futureAction=(await inspect('select user_id,source,tool from public.actions where no=$1',
  [future.actionNo]))[0];
 assert.equal(futureAction.user_id,owner);
 assert.equal(futureAction.source,'chatgpt');
 assert.equal(futureAction.tool,'study');
 await as(owner);
 assert.equal((await undo(owner,future.actionNo)).undone,future.actionNo);
 await role(null);
 assert.equal(await count('registry_undo_fixture',nextId),0);
 console.log('PASS newly registered command routes through registry without a new MCP wrapper');
 console.log('PASS dynamic allowlist and locking for an additional journalled table');
}finally{await db.close();}
