// N50.2.1 full-migration PGlite envelope validation (no live DB).
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,a=[])=>(await db.query(s,a)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const id='33333333-3333-4333-8333-333333333333';
let n=0;
const req=(operation,patch,extra={})=>({
 operationId:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(++n).padStart(12,'0'),
 schemaVersion:1,resource:'study_events',operation,patch,...extra
});
const call=async p=>(await q('select public.study_events_validate_envelope($1::jsonb) value',
 [JSON.stringify(p)]))[0].value;
const bad=(p,re)=>assert.rejects(call(p),re);
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key);");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(names.includes('20261107120117_study_events_envelope.sql'));
 const activation='20261110000000_study_events_related_links.sql';
 assert.ok(names.includes(activation));
 for(const name of names){
  if(name===activation){
   assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='study_events'"))[0].n,0,'N50.1 command remains absent before activation');
   assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='study_events'"))[0].n,0,'N50.1 not undo-registered before activation');
  }
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 }
 const acl=(await q("select has_function_privilege('anon','public.study_events_validate_envelope(jsonb)','execute') anon,has_function_privilege('authenticated','public.study_events_validate_envelope(jsonb)','execute') member"))[0];
 assert.deepEqual(acl,{anon:false,member:true});
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const record=req('record',{entry_id:id,kind:'drift',duration_minutes:17,
  occurred_at:'2026-11-07T10:00:00Z',note:'Observed drift'});
 assert.deepEqual(await call(record),record);
 const notice=req('record',{entry_id:id,kind:'notice',note:null});
 assert.deepEqual(await call(notice),notice);
 const edit=req('edit',{note:'Reflection'},{target:{id},expectedVersion:1});
 assert.deepEqual(await call(edit),edit);
 const partial=req('edit',{duration_minutes:21},{target:{id},expectedVersion:2});
 assert.deepEqual(await call(partial),partial);
 for(const op of ['void','restore']){
  const v=req(op,{}, {target:{id},expectedVersion:2});
  assert.deepEqual(await call(v),v);
 }
 await bad({...record,user_id:owner},/Unknown command field/);
 await bad({...record,patch:{...record.patch,user_id:owner}},/Unknown event patch field/);
 await bad({...record,operation:'delete'},/Unsupported event operation/);
 await bad({...record,schemaVersion:2},/schemaVersion/);
 await bad({...record,operationId:'no-uuid'},/uuid/i);
 await bad({...record,target:{id:null}},/target.id must be a UUID/);
 await bad({...record,target:{id:''}},/target.id must be a UUID/);
 await bad({...record,target:{id:'bad'}},/uuid/i);
 await bad({...edit,target:{}},/target.id required/);
 await bad({...edit,expectedVersion:0},/positive integer/);
 await bad({...edit,expectedVersion:2147483648},/int4/);
 await bad({...edit,patch:{}},/edit patch must not be empty/);
 await bad({...record,patch:{kind:'drift'}},/record requires/);
 await bad({...record,patch:{entry_id:id}},/record requires/);
 await bad({...record,patch:{entry_id:id,kind:'oops'}},/Invalid event kind/);
 await bad({...record,patch:{entry_id:77,kind:'drift'}},/entry_id must be/);
 for(const value of [0,-1,1.5,'12']){
  await bad({...record,patch:{...record.patch,duration_minutes:value}},
   /duration_minutes must be/);
 }
 await bad({...record,patch:{...record.patch,duration_minutes:100001}},
  /duration_minutes exceeds/);
 await bad({...record,patch:{entry_id:id,kind:'notice',duration_minutes:10}},
  /Only drift/);
 await bad({...record,patch:{entry_id:id,kind:'urge',duration_minutes:10}},
  /Only drift/);
 await bad({...record,patch:{...record.patch,note:'x'.repeat(2001)}},/note must be/);
 await bad({...record,patch:{...record.patch,occurred_at:'2026-11-07T10:00:00'}},
  /timezone-aware ISO/);
 await bad({...edit,patch:{kind:'notice',duration_minutes:5}},/Only drift/);
 await bad({...edit,operation:'void',patch:{note:'forged'}},/Unknown event patch field/);
 await db.exec('set role anon');
 await bad(record,/permission denied|Authentication required/);
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.study_events'))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='study_events'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='study_events'"))[0].n,1,'N50.2 activates the validated command');
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='study_events'"))[0].n,1,'N50.2 enables audited undo');
 // N50.2.2.1: retain all prior envelope/empty-registry assertions above,
 // then check owner-bound related links as privileged fixture writes.
 const other='22222222-2222-2222-2222-222222222222';
 const entry='44444444-4444-4444-4444-444444444444';
 const otherEntry='55555555-5555-5555-5555-555555555555';
 const task='66666666-6666-4666-8666-666666666666';
 const otherTask='77777777-7777-4777-8777-777777777777';
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Owner focus')",[entry,owner]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Other focus')",[otherEntry,other]);
 await q("insert into public.tasks(id,user_id,title) values($1,$2,'Owner task')",[task,owner]);
 await q("insert into public.tasks(id,user_id,title) values($1,$2,'Other task')",[otherTask,other]);
 const linked=(await q("insert into public.study_events(user_id,entry_id,kind,related_kind,related_id) values($1,$2,'notice','task',$3) returning *",[owner,entry,task]))[0];
 assert.equal(linked.related_kind,'task');assert.equal(linked.related_id,task);
 assert.equal(linked.version,1);
 const nowLinked=(await q("update public.study_events set related_kind='study_entry',related_id=$1 where id=$2 returning *",[entry,linked.id]))[0];
 assert.equal(nowLinked.related_id,entry);assert.equal(nowLinked.version,2);
 const denied=async(s,args=[])=>assert.rejects(q(s,args),/related|constraint|violates/i);
 await denied("update public.study_events set related_kind='task',related_id=$1 where id=$2",[otherTask,linked.id]);
 await denied("update public.study_events set related_kind='study_entry',related_id=$1 where id=$2",[otherEntry,linked.id]);
 await denied("update public.study_events set related_kind='calendar_block',related_id=$1 where id=$2",[task,linked.id]);
 await denied("update public.study_events set related_kind='not-a-kind',related_id=$1 where id=$2",[task,linked.id]);
 await denied("update public.study_events set related_kind='task',related_id=null where id=$1",[linked.id]);
 await denied("update public.study_events set related_kind=null,related_id=$1 where id=$2",[task,linked.id]);
 assert.equal((await q('select related_id from public.study_events where id=$1',[linked.id]))[0].related_id,entry,
   'failed changes must preserve original link and audit version');
 const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/study_events.json',import.meta.url),'utf8'));
 const cols=(await q("select attname from pg_attribute where attrelid='public.study_events'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname);
 assert.deepEqual(Object.keys(docs.columns).sort(),cols.sort(),'all related columns inventoried');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='study_events'"))[0].n,1,
   'command activated only after N50.1/N50.2.1 staged boundaries');
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='study_events'"))[0].n,1,'N50.2 undo registration');

 // Full N50.2.2 command: owner binding, exact retry, lifecycle, undo and MCP.
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const ownerRole=async who=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','{}',false)");
  await q("select set_config('test.uid',$1,false)",[who]);
  await db.exec('set role authenticated');
 };
 const command=async value=>(await q('select public.study_events_command($1::jsonb) result',
  [JSON.stringify(value)]))[0].result;
 const op=(operation,patch={},extra={})=>req(operation,patch,extra);
 await ownerRole(owner);
 const recordRun=op('record',{entry_id:entry,kind:'drift',duration_minutes:12,
  related_kind:'task',related_id:task});
 const recorded=await command(recordRun);
 assert.equal(recorded.status,'ok');assert.ok(recorded.actionNo>0);
 const eventId=recorded.changed[0].id;
 assert.equal(recorded.changed[0].version,1);
 assert.deepEqual(await command(recordRun),recorded,'retry is receipt-only');
 const mismatch=await command({...recordRun,patch:{...recordRun.patch,duration_minutes:20}});
 assert.equal(mismatch.status,'conflict','same operationId with altered payload never writes');
 const wrong=await command(op('edit',{note:'stale'},
  {target:{id:eventId},expectedVersion:9}));
 assert.equal(wrong.status,'conflict');
 assert.equal(wrong.conflict.currentVersion,1);
 const edited=await command(op('edit',{kind:'notice',duration_minutes:null,note:'Reframed',
  related_kind:'study_entry',related_id:entry},{target:{id:eventId},expectedVersion:1}));
 assert.equal(edited.status,'ok');assert.equal(edited.changed[0].version,2);
 assert.equal((await q('select kind,note,related_kind from public.study_events where id=$1',[eventId]))[0].related_kind,'study_entry');
 await assert.rejects(command(op('edit',{duration_minutes:20},
  {target:{id:eventId},expectedVersion:2})),/Only drift/);
 const voided=await command(op('void',{}, {target:{id:eventId},expectedVersion:2}));
 assert.equal(voided.changed[0].version,3);
 assert.ok((await q('select voided_at from public.study_events where id=$1',[eventId]))[0].voided_at);
 await assert.rejects(command(op('edit',{note:'forged'}, {target:{id:eventId},expectedVersion:3})),/Voided/);
 const restored=await command(op('restore',{}, {target:{id:eventId},expectedVersion:3}));
 assert.equal(restored.changed[0].version,4);
 assert.equal((await q('select voided_at from public.study_events where id=$1',[eventId]))[0].voided_at,null);
 await assert.rejects(command(op('record',{entry_id:otherEntry,kind:'notice'})),/Study entry not found for owner/);
 await assert.rejects(command(op('record',{entry_id:entry,kind:'notice',related_kind:'task',related_id:otherTask})),/Related task not found/);
 await assert.rejects(command(op('record',{entry_id:entry,kind:'notice',related_kind:'task'})),/supplied together/);
 const onlyRelated=await command(op('edit',{related_kind:null,related_id:null},
  {target:{id:eventId},expectedVersion:4}));
 assert.equal(onlyRelated.changed[0].version,5,'related-only patch is a valid edit');
 assert.equal((await q('select related_id from public.study_events where id=$1',[eventId]))[0].related_id,null);
 const fresh=await command(op('record',{entry_id:entry,kind:'urge'}));
 assert.equal(fresh.status,'ok');
 const freshId=fresh.changed[0].id;
 const undo=(await q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [owner,fresh.actionNo]))[0].result;
 assert.equal(Number(undo.undone),Number(fresh.actionNo));
 assert.equal((await q('select count(*)::int n from public.study_events where id=$1',[freshId]))[0].n,0);

 // Every mutation must be undoable, not only a brand-new record insert.
 // Inverse updates may advance version via study_events_touch_version, but
 // they must restore all owner-editable values and the visible void state.
 const undoAction=async actionNo=>(await q(
  'select public.undo_action($1::uuid,$2::bigint,false) result',
  [owner,actionNo]))[0].result;
 const currentRow=async key=>(await q(
  'select kind,note,related_kind,related_id,voided_at,version from public.study_events where id=$1',
  [key]))[0];
 const editBaseline=await command(op('record',{entry_id:entry,kind:'drift',
  duration_minutes:4,note:'Original',related_kind:'task',related_id:task}));
 const editId=editBaseline.changed[0].id;
 const changedEdit=await command(op('edit',{
  note:'Revised',related_kind:'study_entry',related_id:entry,
 },{target:{id:editId},expectedVersion:1}));
 assert.equal(changedEdit.status,'ok');
 assert.equal((await currentRow(editId)).related_id,entry);
 const undoEdited=await undoAction(changedEdit.actionNo);
 assert.equal(Number(undoEdited.undone),Number(changedEdit.actionNo));
 assert.equal((await currentRow(editId)).note,'Original');
 assert.equal((await currentRow(editId)).related_kind,'task');
 assert.equal((await currentRow(editId)).related_id,task);
 const currentAfterUndo=await currentRow(editId);
 assert.equal(currentAfterUndo.kind,'drift');
 const voidChange=await command(op('void',{},{
  target:{id:editId},expectedVersion:currentAfterUndo.version}));
 assert.ok((await currentRow(editId)).voided_at);
 const undoneVoid=await undoAction(voidChange.actionNo);
 assert.equal(Number(undoneVoid.undone),Number(voidChange.actionNo));
 assert.equal((await currentRow(editId)).voided_at,null,
  'undo void must make the same owner event visible again');
 const restoredCandidate=await command(op('record',{entry_id:entry,
  kind:'notice',note:'Retain void history'}));
 const restoreId=restoredCandidate.changed[0].id;
 const beforeRestore=await command(op('void',{},{
  target:{id:restoreId},expectedVersion:1}));
 const restoredOnce=await command(op('restore',{},{
  target:{id:restoreId},expectedVersion:beforeRestore.changed[0].version}));
 assert.equal((await currentRow(restoreId)).voided_at,null);
 const undoRestored=await undoAction(restoredOnce.actionNo);
 assert.equal(Number(undoRestored.undone),Number(restoredOnce.actionNo));
 assert.ok((await currentRow(restoreId)).voided_at,
  'undo restore preserves the original voided history');
 // Restoring a reference to an owner task removed after void is refused.
 // Historical voided events remain readable, but cannot reactivate a
 // dangling task association even though related_kind/id are unchanged.
 const removedTask='88888888-8888-4888-8888-888888888888';
 await db.exec('reset role');
 await q("insert into public.tasks(id,user_id,title) values($1,$2,'Soon removed')",
  [removedTask,owner]);
 await ownerRole(owner);
 const linkedBeforeRemoval=await command(op('record',{
  entry_id:entry,kind:'notice',related_kind:'task',related_id:removedTask}));
 const linkedId=linkedBeforeRemoval.changed[0].id;
 const held=await command(op('void',{},{
  target:{id:linkedId},expectedVersion:1}));
 await db.exec('reset role');
 await q('delete from public.tasks where id=$1',[removedTask]);
 await ownerRole(owner);
 await assert.rejects(command(op('restore',{},{
  target:{id:linkedId},expectedVersion:held.changed[0].version})),
 /Related task not found for this owner/);
 assert.ok((await currentRow(linkedId)).voided_at,
  'failed restore must retain its original version and voided history');
 // The related trigger also refuses linking an existing event to another
 // owner's task, not just a create envelope.
 await assert.rejects(command(op('edit',{
  related_kind:'task',related_id:otherTask},
  {target:{id:editId},expectedVersion:(await currentRow(editId)).version})),
 /Related task not found for this owner/);
 await assert.rejects(q("insert into public.study_events(user_id,entry_id,kind) values($1,$2,'notice')",[owner,entry]),
  /permission denied|row.level security/i);
 await ownerRole(other);
 assert.equal((await q('select count(*)::int n from public.study_events where id=$1',[eventId]))[0].n,0);
 await assert.rejects(command(op('edit',{note:'steal'},
  {target:{id:eventId},expectedVersion:5})),/not found for owner/);
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcpRequest=op('record',{entry_id:entry,kind:'notice'});
 const mcp=(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
  [owner,'chatgpt',JSON.stringify(mcpRequest)]))[0].result;
 assert.equal(mcp.status,'ok');
 const mcpRetry=(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
  [owner,'chatgpt',JSON.stringify(mcpRequest)]))[0].result;
 assert.deepEqual(mcpRetry,mcp,'MCP replay must not create new event or action');
 await db.exec('reset role');
 assert.equal((await q('select source from public.study_events where id=$1',
  [mcp.changed[0].id]))[0].source,'mcp');
 assert.equal((await q('select source from public.actions where no=$1',
  [mcp.actionNo]))[0].source,'chatgpt');
 assert.equal((await q("select count(*)::int n from public.action_changes where action_no=$1 and table_name='study_events'",
  [mcp.actionNo]))[0].n,1,'one canonical log entry, no duplicate journal marker');

 // Service-role MCP operations preserve owner binding and provenance
 // across edit, void, restore; all are command-receipted, never direct DML.
 const mcpId=mcp.changed[0].id;
 // The preceding readback deliberately reset the fixture to the default
 // role. Re-enter the authenticated MCP bridge's required service role.
 await db.exec('set role service_role');
 const mcpSteps=[
  op('edit',{note:'Changed through MCP'},{target:{id:mcpId},expectedVersion:1}),
  op('void',{}, {target:{id:mcpId},expectedVersion:2}),
  op('restore',{}, {target:{id:mcpId},expectedVersion:3}),
 ];
 for(const [stepIndex,envelope] of mcpSteps.entries()){
  const result=(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
   [owner,'chatgpt',JSON.stringify(envelope)]))[0].result;
  assert.equal(result.status,'ok');
  assert.equal(result.changed[0].version,stepIndex+2);
  assert.ok(result.actionNo>0);
  const replay=(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
   [owner,'chatgpt',JSON.stringify(envelope)]))[0].result;
  assert.deepEqual(replay,result,'MCP replay is exact for every lifecycle operation');
  const source=(await q('select source from public.actions where no=$1',
   [result.actionNo]))[0].source;
  assert.equal(source,'chatgpt','MCP action provenance is not forged as app');
 }
 await db.exec('reset role');
 assert.equal((await q('select source,note,voided_at from public.study_events where id=$1',
  [mcpId]))[0].source,'mcp');
 assert.equal((await q('select note from public.study_events where id=$1',
  [mcpId]))[0].note,'Changed through MCP');
 assert.equal((await q('select voided_at from public.study_events where id=$1',
  [mcpId]))[0].voided_at,null);
 const registry=(await q("select command_fn,mcp_ok from public.lemma_command_resources where resource='study_events'"))[0];
 assert.deepEqual(registry,{command_fn:'study_events_command',mcp_ok:true});

 console.log('PASS N50.2.2 study events lifecycle, receipts, owner links, journal, undo and MCP');
}finally{await db.close()}
