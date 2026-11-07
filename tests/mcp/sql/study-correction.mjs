// N51: PGlite regression, additive study entry and task-link schema.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $uid$
   select coalesce(
     nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid) $uid$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$ select decode(repeat('00',n),'hex') $bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261115120000_study_command_v2.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
 for(const [table,column] of [['study_entries','approximate'],['study_entries','voided_at'],['calendar_blocks','task_id']]){
  assert.equal((await q('select count(*)::int n from information_schema.columns where table_schema=\'public\' and table_name=$1 and column_name=$2',[table,column]))[0].n,1);
  const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/'+table+'.json',import.meta.url),'utf8'));
  const columns=(await q('select attname from pg_attribute where attrelid=($1)::regclass and attnum>0 and not attisdropped',['public.'+table])).map(x=>x.attname).sort();
  assert.deepEqual(Object.keys(docs.columns).sort(),columns);
 }
 assert.equal((await q("select condeferrable from pg_constraint where conname='calendar_blocks_task_owner_fk'"))[0].condeferrable,true);

 // Owner fixtures, command receipts and real calendar-linked task references.
 const owner='11111111-1111-1111-1111-111111111111';
 const other='99999999-9999-9999-9999-999999999999';
 const uuid=(n)=>'aaaaaaaa-aaaa-4aaa-8aaa-'+n.toString(16).padStart(12,'0');
 let operation=0;
 const nextOperation=()=>uuid(++operation);
 const as=async(id,role='authenticated')=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','{}',false)");
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role '+role);
 };
 const admin=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
 const envelope=(action,patch={},target=null,version=null,resource='study_entries',opId=nextOperation())=>({
   schemaVersion:1,resource,operation:action,operationId:opId,
   ...(target?{target:{id:target}}:{}),
   ...(version!==null?{expectedVersion:version}:{}),patch
 });
 const command=async(p)=>(await q('select public.study_command($1::jsonb) as receipt',
   [JSON.stringify(p)]))[0].receipt;
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [id,secret] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,secret]);
 const task=(await q("insert into public.tasks(user_id,title) values($1,'Review proof') returning id",[owner]))[0];
 const foreignTask=(await q("insert into public.tasks(user_id,title) values($1,'Private') returning id",[other]))[0];
 const early='2026-11-05T09:00:00Z',middle='2026-11-05T10:00:00Z',
  middleEnd='2026-11-05T10:10:00Z',late='2026-11-05T11:00:00Z';
 const spans=[
  {kind:'focus',started_at:early,ended_at:middle},
  {kind:'break',started_at:middle,ended_at:middleEnd},
  {kind:'focus',started_at:middleEnd,ended_at:late},
 ];
 const seconds=async(ids)=>(await q(
  'select coalesce(sum(extract(epoch from ended_at-started_at)),0)::int n from public.study_intervals where entry_id=any($1::uuid[])',
  [ids]))[0].n;
 await as(owner);
 const manual=envelope('create_manual',{intent:'Work through proof',intervals:spans});
 const created=await command(manual);
 assert.equal(created.status,'ok');assert.ok(created.actionNo);
 const id=created.changed[0].id;
 const row=(await q('select * from public.study_entries where id=$1',[id]))[0];
 assert.equal(row.status,'saved');assert.equal(row.source,'manual');
 assert.equal(row.approximate,true);
 assert.equal(await seconds([id]),7200);
 assert.deepEqual(await command(manual),created,'receipt replay is exactly once');
 assert.equal((await command({...manual,patch:{...manual.patch,intent:'Different'}})).status,
  'conflict','changed-payload operationId replay must conflict');
 await assert.rejects(command(envelope('correct',{intervals:[
   {kind:'focus',started_at:early,ended_at:middleEnd},
   {kind:'break',started_at:middle,ended_at:late}
  ]},id,1)),/Overlapping corrected intervals/);
 assert.equal(await seconds([id]),7200,'invalid correction is atomic');
 const historical={
  kind:'focus',started_at:'2026-10-31T10:00:00Z',ended_at:'2026-11-02T12:30:00Z'};
 const correcting=envelope('correct',{
  intent:'DST-spanning correction',rating:4,reflection:'Rechecked the estimate',
  intervals:[historical]},id,1);
 const corrected=await command(correcting);
 assert.equal(corrected.status,'ok');assert.equal(corrected.changed[0].version,2);
 assert.equal(await seconds([id]),181800,
   'civil DST boundaries do not impose an artificial 24h duration limit');
 assert.equal((await command(envelope('correct',{intent:'Stale'},id,1))).status,
  'conflict','optimistic versions protect old entries');
 const restoredCorrection=(await q('select public.undo_action($1,$2,false) as result',
  [owner,corrected.actionNo]))[0].result;
 assert.equal(restoredCorrection.undone,corrected.actionNo);
 assert.equal(await seconds([id]),7200,'undo restores exact prior interval union');
 assert.equal((await q('select version from public.study_entries where id=$1',[id]))[0].version,1);
 // Split through an existing break: old and new halves must preserve all
 // focus/break minutes and have nonoverlapping absolute-time boundaries.
 const splitAt='2026-11-05T10:05:00Z';
 const split=await command(envelope('split',{at:splitAt},id,1));
 assert.equal(split.status,'ok');assert.equal(split.changed.length,2);
 const secondId=split.changed[1].id;
 assert.equal(await seconds([id,secondId]),7200);
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at>$2',
  [id,splitAt]))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and started_at<$2',
  [secondId,splitAt]))[0].n,0);
 assert.equal((await q('select status from public.study_entries where id=$1',[secondId]))[0].status,'saved');
 const voided=await command(envelope('void',{},secondId,1));
 assert.equal(voided.status,'ok');
 assert.equal((await q("select count(*)::int n from public.study_entries where id=$1 and status='saved'",
   [secondId]))[0].n,0,'voided history is excluded from saved time queries');
 assert.ok((await q('select voided_at from public.study_entries where id=$1',[secondId]))[0].voided_at);
 const reactivated=await command(envelope('restore',{},secondId,2));
 assert.equal(reactivated.status,'ok');
 assert.equal((await q("select count(*)::int n from public.study_entries where id=$1 and status='saved'",
   [secondId]))[0].n,1);
 await assert.rejects(command(envelope('restore',{},secondId,3)),
  /Only voided entries/);

 const timeBlock={kind:'study',title:'Session with task',starts_at:early,
  ends_at:late,time_zone:'UTC',task_id:task.id};
 const block=await command(envelope('create',timeBlock,null,null,'calendar_blocks'));
 assert.equal(block.status,'ok');
 const blockId=block.changed[0].id;
 assert.equal((await q('select task_id from public.calendar_blocks where id=$1',
  [blockId]))[0].task_id,task.id);
 const upd=await command(envelope('update',{task_id:null},blockId,block.changed[0].version,'calendar_blocks'));
 assert.equal(upd.status,'ok');
 assert.equal((await q('select task_id from public.calendar_blocks where id=$1',[blockId]))[0].task_id,null);
 await assert.rejects(command(envelope('update',{task_id:foreignTask.id},
  blockId,upd.changed[0].version,'calendar_blocks')),/foreign key|violates/);
 await as(other);
 await assert.rejects(command(envelope('void',{},id,2)),/Study entry not found/);
 await assert.rejects(command(envelope('create_manual',{
  intent:'Foreign entry link',project_id:task.id,intervals:spans
 })),/foreign key|violates/);

 // MCP service_role uses the existing generic dispatcher, not a new wrapper.
 await admin();await db.exec('set role service_role');
 const mcpPayload=envelope('create_manual',{intent:'Tutor time',intervals:spans});
 const mcp=(await q("select public.mcp_command($1,'chatgpt',$2::jsonb) receipt",
  [owner,JSON.stringify(mcpPayload)]))[0].receipt;
 assert.equal(mcp.status,'ok');assert.ok(mcp.actionNo);
 await admin();
 assert.equal((await q('select source from public.actions where no=$1',[mcp.actionNo]))[0].source,
  'chatgpt','MCP source is trusted from dispatcher, not from client patch');
 assert.equal((await q('select approximate from public.study_entries where id=$1',
  [mcp.changed[0].id]))[0].approximate,true);


 // Every destructive lifecycle operation remains individually reversible.
 await as(owner);
 const forSplit=await command(envelope('create_manual',
  {intent:'Undo a split',intervals:spans}));
 const splitUndo=await command(envelope('split',{at:middleEnd},
  forSplit.changed[0].id,1));
 assert.equal(splitUndo.changed.length,2);
 const undoneSplit=(await q('select public.undo_action($1,$2,false) result',
  [owner,splitUndo.actionNo]))[0].result;
 assert.equal(undoneSplit.undone,splitUndo.actionNo);
 assert.equal(await seconds([forSplit.changed[0].id]),7200);
 assert.equal((await q('select count(*)::int n from public.study_entries where id=$1',
  [splitUndo.changed[1].id]))[0].n,0,
  'undoing a split deletes its new entry and restores all old intervals');
 const forVoid=await command(envelope('create_manual',
  {intent:'Undo a void',intervals:spans}));
 const voidForUndo=await command(envelope('void',{},forVoid.changed[0].id,1));
 const undoneVoid=(await q('select public.undo_action($1,$2,false) result',
  [owner,voidForUndo.actionNo]))[0].result;
 assert.equal(undoneVoid.undone,voidForUndo.actionNo);
 assert.equal((await q('select status from public.study_entries where id=$1',
  [forVoid.changed[0].id]))[0].status,'saved');
 const createdToUndo=await command(envelope('create_manual',
  {intent:'Undo an approximation',intervals:spans}));
 const undoneManual=(await q('select public.undo_action($1,$2,false) result',
  [owner,createdToUndo.actionNo]))[0].result;
 assert.equal(undoneManual.undone,createdToUndo.actionNo);
 assert.equal((await q('select count(*)::int n from public.study_entries where id=$1',
  [createdToUndo.changed[0].id]))[0].n,0);
 // The existing command does not permit owner spoofing of calendar task IDs.
 await assert.rejects(command(envelope('create',{...timeBlock,task_id:foreignTask.id},
   null,null,'calendar_blocks')),/foreign key|violates/);
 // The helper is callable by the owner role, but cannot bypass the public
 // envelope, receipt identity, or owner guard with forged direct arguments.
 const direct={...manual,operationId:nextOperation(),schemaVersion:2};
 await assert.rejects(q('select public.study_command_correction($1::jsonb,$2::uuid,$3::uuid)',
  [JSON.stringify(direct),owner,direct.operationId]),/Invalid v2 command envelope/);

 console.log('PASS N51 saved-study correction, exact split, DST, void/restore, task owner links, retry, undo, MCP');
}finally{await db.close()}
