// N44.1/N44.2: full-migration in-memory PGlite, no production connection.
// Direct DML remains blocked; versioned owner RPCs are receipted and undoable.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
async function as(user){
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[user]);
 await db.exec('set role authenticated');
}
async function admin(){
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
}
const invalid=async(sql,values=[])=>assert.rejects(q(sql,values),
 /violates|constraint|foreign key|not-null|null value/i);
const noWrite=async(sql,values=[])=>{
 try{
  const result=await q(sql,values);
  assert.deepEqual(result,[],'unaudited DML must not return modified rows');
 }catch(error){
  if(error instanceof assert.AssertionError)throw error;
  assert.match(String(error),/permission denied|row.level security/i);
 }
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid) $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$ select decode(repeat('00',n),'hex') $bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261107062517_parked_thoughts.sql'));
 assert.ok(names.includes('20261108010000_parked_thought_envelopes.sql'));

 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/parked_thoughts.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.parked_thoughts'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.equal(docs.table,'parked_thoughts');
 assert.deepEqual(Object.keys(docs.columns).sort(),columns);
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.parked_thoughts'::regclass"))[0].relrowsecurity,true);
 assert.deepEqual((await q("select cmd from pg_policies where tablename='parked_thoughts'")).map(x=>x.cmd),['SELECT']);
 const fks=await q("select conname,condeferrable from pg_constraint where conrelid='public.parked_thoughts'::regclass and contype='f'");
 for(const key of ['parked_thoughts_entry_owner_fk','parked_thoughts_task_owner_fk'])
  assert.ok(fks.some(x=>x.conname===key&&x.condeferrable),'owner FK required: '+key);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='parked_thoughts'"))[0].n,1);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='parked_thoughts'"))[0].n,1);

 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const entry=(await q("insert into public.study_entries(user_id,source,intent) values($1,'manual','Plan') returning id",[owner]))[0];
 const anotherEntry=(await q("insert into public.study_entries(user_id,source,intent) values($1,'manual','Other') returning id",[other]))[0];
 const task=(await q("insert into public.tasks(user_id,title) values($1,'Follow up') returning id",[owner]))[0];
 const otherTask=(await q("insert into public.tasks(user_id,title) values($1,'Private') returning id",[other]))[0];
 const open=(await q("insert into public.parked_thoughts(user_id,study_entry_id,text) values($1,$2,'Prove an estimate') returning *",[owner,entry.id]))[0];
 assert.equal(open.status,'open');assert.equal(open.version,1);
 assert.equal(open.destination_id,null);assert.equal(open.resolved_at,null);
 const dismissed=(await q("insert into public.parked_thoughts(user_id,text,status,resolved_at) values($1,'Later','dismissed',now()) returning *",[owner]))[0];
 assert.equal(dismissed.status,'dismissed');assert.equal(dismissed.destination_id,null);
 const converted=(await q("insert into public.parked_thoughts(user_id,text,status,destination_kind,destination_id,resolved_at) values($1,'Task','converted','task',$2,now()) returning *",[owner,task.id]))[0];
 assert.equal(converted.destination_kind,'task');assert.equal(converted.destination_id,task.id);
 const otherThought=(await q("insert into public.parked_thoughts(user_id,text) values($1,'Private thought') returning *",[other]))[0];
 for(const text of [' ','x'.repeat(4001)])
  await invalid('insert into public.parked_thoughts(user_id,text) values($1,$2)',[owner,text]);
 await invalid("insert into public.parked_thoughts(user_id,text,status) values($1,'Bad','unknown')",[owner]);
 await invalid("insert into public.parked_thoughts(user_id,text,status) values($1,'Missing instant','dismissed')",[owner]);
 await invalid("insert into public.parked_thoughts(user_id,text,status,resolved_at) values($1,'Missing target','converted',now())",[owner]);
 await invalid("insert into public.parked_thoughts(user_id,text,status,destination_id,resolved_at) values($1,'Missing kind','converted',$2,now())",[owner,task.id]);
 await invalid("insert into public.parked_thoughts(user_id,text,status,destination_kind,resolved_at) values($1,'Missing task','converted','task',now())",[owner]);
 await invalid("insert into public.parked_thoughts(user_id,text,status,destination_kind,destination_id,resolved_at) values($1,'Wrong','open','task',$2,now())",[owner,task.id]);
 await invalid("insert into public.parked_thoughts(user_id,text,study_entry_id) values($1,'Cross-owner entry',$2)",[owner,anotherEntry.id]);
 await invalid("insert into public.parked_thoughts(user_id,text,status,destination_kind,destination_id,resolved_at) values($1,'Cross-owner task','converted','task',$2,now())",[owner,otherTask.id]);

 // Simulate permissive Supabase default table DML grants. SELECT-only RLS
 // still blocks INSERT/UPDATE/DELETE of an owner's own records.
 await q('grant insert,update,delete on public.parked_thoughts to authenticated');
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.parked_thoughts'))[0].n,3);
 assert.equal((await q('select count(*)::int n from public.parked_thoughts where id=$1',[otherThought.id]))[0].n,0);
 await noWrite("insert into public.parked_thoughts(text) values('Bypass') returning id");
 await noWrite("update public.parked_thoughts set text='Bypass' where id=$1 returning id",[open.id]);
 await noWrite("delete from public.parked_thoughts where id=$1 returning id",[open.id]);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.parked_thoughts'))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.parked_thoughts where id=$1',[open.id]))[0].n,0);
 await noWrite("insert into public.parked_thoughts(user_id,text) values($1,'Spoof') returning id",[owner]);
 await noWrite("update public.parked_thoughts set text='Steal' where id=$1 returning id",[open.id]);
 await admin();
 assert.equal((await q('select text from public.parked_thoughts where id=$1',[open.id]))[0].text,'Prove an estimate');
 assert.equal((await q('select count(*)::int n from public.parked_thoughts'))[0].n,4);
 assert.ok((await q("select count(*)::int n from public.action_changes where table_name='parked_thoughts'"))[0].n>=4,'every privileged seed write is journalled');


 // N44.2 validator: owner-bound command-envelope checks.
 // Direct table DML is read-only; the validated RPC performs audited writes.
 const validate=async p=>(await q(
  'select public.parked_thoughts_validate_envelope($1::jsonb) value',
  [JSON.stringify(p)]))[0].value;
 const valid={operationId:'11111111-1111-4111-8111-111111111111',
  schemaVersion:1,resource:'parked_thoughts',operation:'create',
  patch:{text:'Return to this lemma'}};
 await as(owner);
 assert.deepEqual(await validate(valid),valid);
 const suppliedCreateId={...valid,target:{id:open.id}};
 assert.deepEqual(await validate(suppliedCreateId),suppliedCreateId);
 await assert.rejects(validate({...valid,target:{id:'not-a-uuid'}}),/uuid/i);
 await assert.rejects(validate({...valid,target:{id:null}}),/target.id must be a UUID/);
 await assert.rejects(validate({...valid,target:{id:''}}),/target.id must be a UUID/);
 await assert.rejects(validate({...valid,target:{id:42}}),/target.id must be a UUID/);
 await assert.rejects(validate({...valid,user_id:other}),/Unknown command field/);
 await assert.rejects(validate({...valid,operation:'archive'}),/Unsupported thought operation/);
 await assert.rejects(validate({...valid,schemaVersion:2}),/schemaVersion must be 1/);
 await assert.rejects(validate({...valid,patch:{text:' '}}),/Thought text/);
 await assert.rejects(validate({...valid,patch:{text:'Valid',user_id:other}}),/Unknown patch field/);
 await assert.rejects(validate({...valid,operationId:'not-a-uuid'}),/uuid/i);
 const edit={...valid,operation:'edit',target:{id:open.id},expectedVersion:1,
  patch:{text:'Updated text'}};
 assert.deepEqual(await validate(edit),edit);
 await assert.rejects(validate({...edit,expectedVersion:0}),/positive integer/);
 await assert.rejects(validate({...edit,target:{}}),/target.id is required/);
 await assert.rejects(validate({...edit,target:{id:''}}),/target.id must be a UUID/);
 await assert.rejects(validate({...edit,patch:{}}),/Edit patch/);
 await assert.rejects(validate({...edit,patch:{text:null}}),/Thought text/);
 await assert.rejects(validate({...edit,target:{id:open.id,user_id:other}}),/Unknown target field/);
 await assert.rejects(validate({...edit,patch:{text:'x'.repeat(4001)}}),/Thought text/);
 await assert.rejects(validate({...edit,patch:{study_entry_id:'not-a-uuid'}}),/uuid/i);
 const removal={...edit,operation:'delete',patch:{}};
 assert.deepEqual(await validate(removal),removal);
 await assert.rejects(validate({...removal,patch:{text:'forged'}}),/Unknown patch field/);
 const conversion={...edit,operation:'convert_to_task',patch:{title:'Finish lemma'}};
 assert.deepEqual(await validate(conversion),conversion);
 const completeTask={...conversion,patch:{title:'Finish lemma',
  body:'Write up proof',estimate_minutes:45,priority:'normal',
  due_kind:'date',due_date:'2026-11-09',due_at:null,position:0,subject_id:owner}};
 assert.deepEqual(await validate(completeTask),completeTask,
  'conversion envelope accepts the task_command create field names');
 await assert.rejects(validate({...conversion,patch:{
  ...conversion.patch,description:'not a task column'}}),/Unknown patch field/,
  'legacy description cannot silently drop the task body');
 await assert.rejects(validate({...conversion,patch:{
  ...conversion.patch,status:'completed'}}),/Unknown patch field/,
  'new task conversion must not pre-set terminal status');
 const high={...conversion,patch:{...conversion.patch,priority:'high'}};
 assert.deepEqual(await validate(high),high);
 for(const bad of [null,'urgent',7])
  await assert.rejects(validate({...conversion,patch:{...conversion.patch,priority:bad}}),
   /Invalid task priority/);
 assert.deepEqual(await validate({...conversion,patch:{
  ...conversion.patch,subject_id:owner,project_id:null}}),
  {...conversion,patch:{...conversion.patch,subject_id:owner,project_id:null}},
  'valid typed task owner links or explicit null remain allowed');
 for(const field of ['subject_id','project_id','checkpoint_id']){
  for(const bad of [42,false,{'id':owner}])
   await assert.rejects(validate({...conversion,patch:{...conversion.patch,[field]:bad}}),
    new RegExp('Task '+field+' must be a UUID'));
  await assert.rejects(validate({...conversion,patch:{...conversion.patch,[field]:'not-a-uuid'}}),
   /uuid/i);
 }
 await assert.rejects(validate({...conversion,patch:{title:' '}}),/Task title required/);
 await assert.rejects(validate({...edit,operation:'dismiss',patch:{text:'Ignored'}}),
  /Unknown patch field/);
 await db.exec('set role anon');
 await assert.rejects(validate(valid),/permission denied|Authentication required/);
 await admin();
 assert.ok((await q("select count(*)::int n from public.action_changes where table_name='parked_thoughts'"))[0].n>=4,'every privileged seed write is journalled');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='parked_thoughts'"))[0].n,1);

 // N44.2 transactional command: durable receipts, versions and atomic task creation.
 const command=async p=>(await q(
  'select public.parked_thoughts_command($1::jsonb) as value',
  [JSON.stringify(p)]))[0].value;
 const envelope=(operation,operationId,patch={},target=null,expectedVersion=null)=>({
  operationId,schemaVersion:1,resource:'parked_thoughts',operation,
  ...(target?{target:{id:target}}:{}),
  ...(expectedVersion!==null?{expectedVersion}:{}),patch
 });
 const idBase='aaaaaaaa-aaaa-4aaa-8aaa-';
 const create=envelope('create',idBase+'000000000001',
  {text:'Write the estimate',study_entry_id:entry.id});
 await as(owner);
 const created=await command(create);
 assert.equal(created.status,'ok');assert.ok(created.actionNo);
 assert.equal(created.thought.status,'open');
 assert.equal(created.thought.study_entry_id,entry.id);
 assert.equal((await q('select source from public.actions where no=$1',
  [created.actionNo]))[0].source,'app',
  'browser writes must use an allowed, unforgeable action source');
 const thoughtId=created.thought.id;
 assert.equal((await command(create)).thought.id,thoughtId,
  'verbatim retry returns the original inserted thought');
 assert.equal((await command({...create,patch:{text:'Different text'}})).status,
  'conflict','changed payload cannot reuse an operationId');
 assert.equal((await q('select count(*)::int n from public.parked_thoughts where id=$1',
  [thoughtId]))[0].n,1);


 // Undo must be available for ordinary CRUD, not only combined conversion.
 const ephemeral=await command(envelope('create',idBase+'000000000011',
  {text:'Unscheduled scratch note'}));
 const undoCreated=(await q('select public.undo_action($1,$2) as value',
  [owner,ephemeral.actionNo]))[0].value;
 assert.equal(undoCreated.undone,ephemeral.actionNo);
 assert.equal((await q('select count(*)::int n from public.parked_thoughts where id=$1',
  [ephemeral.thought.id]))[0].n,0,'undo removes a just-created thought');
 const editable=await command(envelope('create',idBase+'000000000012',
  {text:'Keep original'}));
 const editedScratch=await command(envelope('edit',idBase+'000000000013',
  {text:'Changed temporarily'},editable.thought.id,1));
 const undoEdited=(await q('select public.undo_action($1,$2) as value',
  [owner,editedScratch.actionNo]))[0].value;
 assert.equal(undoEdited.undone,editedScratch.actionNo);
 assert.equal((await q('select text from public.parked_thoughts where id=$1',
  [editable.thought.id]))[0].text,'Keep original',
  'undo restores the exact previous edited value');

 const editCommand=envelope('edit',idBase+'000000000002',
  {text:'Write the sharp estimate'},thoughtId,1);
 const edited=await command(editCommand);
 assert.equal(edited.status,'ok');
 assert.equal(edited.thought.version,2);
 assert.equal(edited.thought.text,'Write the sharp estimate');
 const stale=await command(envelope('edit',idBase+'000000000003',
  {text:'Stale edit'},thoughtId,1));
 assert.equal(stale.status,'conflict');
 assert.equal(stale.conflict.currentVersion,2);
 assert.equal(stale.current.id,thoughtId);
 assert.equal((await command(envelope('edit',idBase+'000000000003',
  {text:'Modified stale retry'},thoughtId,1))).status,'conflict');

 const dismissedReceipt=await command(envelope('dismiss',idBase+'000000000004',
  {},thoughtId,2));
 assert.equal(dismissedReceipt.thought.status,'dismissed');
 assert.ok(dismissedReceipt.thought.resolved_at);
 await assert.rejects(command(envelope('convert_to_task',idBase+'000000000005',
  {title:'Invalid resolved conversion'},thoughtId,3)),/Only open thoughts/);
 const reopened=await command(envelope('reopen',idBase+'000000000006',
  {},thoughtId,3));
 assert.equal(reopened.thought.status,'open');
 assert.equal(reopened.thought.resolved_at,null);
 assert.equal(reopened.thought.version,4);
 await assert.rejects(command(envelope('reopen',idBase+'000000000007',
  {},thoughtId,4)),/Only dismissed thoughts/);
 await assert.rejects(command(envelope('convert_to_task',idBase+'000000000008',
  {title:'Due kind mismatch',due_kind:'date'},thoughtId,4)),
  /constraint|violates/i,'bad task must roll back the thought and task');
 assert.equal((await q('select version from public.parked_thoughts where id=$1',
  [thoughtId]))[0].version,4);

 const conversionCommand=envelope('convert_to_task',idBase+'000000000009',
  {title:'Prove inequality',body:'Write down both bounds',
   estimate_minutes:35,priority:'high',due_kind:'date',
   due_date:'2026-11-09',position:0},thoughtId,4);
 const convertedReceipt=await command(conversionCommand);
 assert.equal(convertedReceipt.status,'ok');
 assert.equal(convertedReceipt.thought.status,'converted');
 assert.equal(convertedReceipt.thought.destination_kind,'task');
 assert.equal(convertedReceipt.thought.destination_id,convertedReceipt.task.id);
 assert.equal(convertedReceipt.task.user_id,owner);
 assert.equal(convertedReceipt.task.title,'Prove inequality');
 assert.equal(convertedReceipt.task.status,'backlog');
 assert.equal(convertedReceipt.changed.length,2);
 const txChanges=await q('select table_name from public.action_changes where action_no=$1',
   [convertedReceipt.actionNo]);
 assert.deepEqual(txChanges.map(x=>x.table_name).sort(),
  ['parked_thoughts','tasks'],
  'one action journals both conversion rows for one undo');
 const beforeReplay=(await q('select count(*)::int n from public.tasks where id=$1',
  [convertedReceipt.task.id]))[0].n;
 assert.equal((await command(conversionCommand)).task.id,convertedReceipt.task.id);
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',
  [convertedReceipt.task.id]))[0].n,beforeReplay,
  'retry cannot create a second task');
 assert.equal((await command({...conversionCommand,patch:{title:'Different'}})).status,
  'conflict');
 const undone=(await q('select public.undo_action($1,$2) as value',
  [owner,convertedReceipt.actionNo]))[0].value;
 assert.equal(undone.undone,convertedReceipt.actionNo);
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',
  [convertedReceipt.task.id]))[0].n,0);
 assert.equal((await q('select status,version from public.parked_thoughts where id=$1',
  [thoughtId]))[0].status,'open');

 const removed=await command(envelope('delete',idBase+'00000000000a',
  {},thoughtId,4));
 assert.equal(removed.status,'ok');
 assert.equal((await q('select count(*)::int n from public.parked_thoughts where id=$1',
  [thoughtId]))[0].n,0);
 const restored=(await q('select public.undo_action($1,$2) as value',
  [owner,removed.actionNo]))[0].value;
 assert.equal(restored.undone,removed.actionNo);
 assert.equal((await q('select status from public.parked_thoughts where id=$1',
  [thoughtId]))[0].status,'open');

 // A second owner cannot edit or link the first owner's data, including through
 // the security-definer helper (which must not accept a caller owner field).
 await as(other);
 await assert.rejects(command(envelope('edit',idBase+'00000000000b',
  {text:'Steal'},thoughtId,4)),/Thought not found/);
 await assert.rejects(command(envelope('create',idBase+'00000000000c',
  {text:'Foreign',study_entry_id:entry.id})),/foreign key|violates/i);
 await assert.rejects(command({...create,operationId:idBase+'00000000000d',
  user_id:owner}),/Unknown command field/);

 // Service-role dispatcher delegates with an explicit owner and receives the
 // same verified receipt. The command's own owner check remains authoritative.
 await admin();
 await db.exec('set role service_role');
 const mcpCommand=envelope('create',idBase+'00000000000e',
  {text:'From connected tutor'});
 const mcp=(await q('select public.mcp_command($1,$2,$3::jsonb) as value',
  [owner,'chatgpt',JSON.stringify(mcpCommand)]))[0].value;
 assert.equal(mcp.status,'ok');
 assert.equal(mcp.thought.user_id,owner);
 assert.equal(mcp.thought.source,'mcp');
 assert.equal((await q('select source from public.actions where no=$1',
  [mcp.actionNo]))[0].source,'chatgpt',
  'MCP thought rows retain coarse mcp provenance, actions use dispatcher source');
 assert.equal((await q('select count(*)::int n from public.lemma_command_resources where resource=$1',
  ['parked_thoughts']))[0].n,1);
 await admin();

 console.log('PASS N44.1/N44.2 owner-scoped read-only storage, status invariants, cross-owner FKs, and no unaudited DML');
}finally{await db.close();}
