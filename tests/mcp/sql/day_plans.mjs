// N46.1: full-migration PGlite, no production or remote writes.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function as(uid){
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[uid]);
 await db.exec('set role authenticated');
}
async function admin(){
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
}
const invalid=async(sql,args=[])=>assert.rejects(q(sql,args),
 /constraint|violates|foreign key|null value|not-null|duplicate/i);
const blocked=async(sql,args=[])=>{
 try{
  const rows=await q(sql,args);
  assert.deepEqual(rows,[],'unaudited DML returned modified rows');
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
   $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const directory=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(directory)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert.ok(names.includes('20261107120110_day_plans_header.sql'));
 assert.ok(!names.includes('20261107120030_day_plans_header.sql'), 'superseded unapplied migration version must not recur');
 assert.ok(!names.includes('20261107090000_day_plans_header.sql'),
   'superseded N46 migration version must not remain');
 for(const name of names){
  if(name==='20261108130000_day_plan_items_schema.sql'){
   assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='day_plans'"))[0].n,0,
    'N46.1 is not registered before the atomic N46.2 command exists');
   assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plans'"))[0].n,0,
    'N46.1 must remain read-only before its journalled command');
  }
  await db.exec(await readFile(new URL(name,directory),'utf8'));
 }
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/day_plans.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.day_plans'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.equal(doc.table,'day_plans');assert.deepEqual(Object.keys(doc.columns).sort(),columns);
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.day_plans'::regclass"))[0].relrowsecurity,true);
 assert.deepEqual((await q("select cmd from pg_policies where tablename='day_plans'")).map(x=>x.cmd),['SELECT']);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='day_plans'"))[0].n,1);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plans'"))[0].n,1);
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 const task=(await q("insert into public.tasks(user_id,title) values($1,'Start this task') returning id",[owner]))[0];
 const otherTask=(await q("insert into public.tasks(user_id,title) values($1,'Private') returning id",[other]))[0];
 const day=(await q("insert into public.day_plans(user_id,plan_date,time_zone,intention,capacity_minutes,availability,tomorrow_first_task_id) values($1,'2026-11-08','Asia/Kolkata','Review proofs',120,$2::jsonb,$3) returning *",
 [owner,JSON.stringify({sources:[{resource:'tasks',id:task.id,version:1}]}),task.id]))[0];
 assert.equal(day.user_id,owner);
 assert.equal(day.status,'draft');assert.equal(day.closed_at,null);
 assert.equal(day.ritual && Object.keys(day.ritual).length,0);
 assert.equal(day.availability.sources[0].version,1);
 assert.equal(day.tomorrow_first_task_id,task.id);
 const otherDay=(await q("insert into public.day_plans(user_id,plan_date,time_zone) values($1,'2026-11-08','UTC') returning *",[other]))[0];
 assert.ok(otherDay.id);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone) values($1,'2026-11-08','UTC')",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone) values($1,'2026-11-09',' ')",[owner]);
 for(const minutes of [-1,1441])await invalid("insert into public.day_plans(user_id,plan_date,time_zone,capacity_minutes) values($1,'2026-11-09','UTC',$2)",[owner,minutes]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,availability) values($1,'2026-11-09','UTC','[]')",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,availability) values($1,'2026-11-09','UTC','{}')",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,availability) values($1,'2026-11-09','UTC',$2::jsonb)",[owner,JSON.stringify({sources:null})]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,availability) values($1,'2026-11-09','UTC',$2::jsonb)",[owner,JSON.stringify({sources:{}})]);
 await invalid("update public.day_plans set availability=$1::jsonb where id=$2",[JSON.stringify({}),day.id]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,ritual) values($1,'2026-11-09','UTC','[]')",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,status) values($1,'2026-11-09','UTC','closed')",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,status,closed_at) values($1,'2026-11-09','UTC','draft',now())",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,status) values($1,'2026-11-09','UTC','unknown')",[owner]);
 await invalid("insert into public.day_plans(user_id,plan_date,time_zone,tomorrow_first_task_id) values($1,'2026-11-09','UTC',$2)",[owner,otherTask.id]);
 const closed=(await q("insert into public.day_plans(user_id,plan_date,time_zone,status,closed_at) values($1,'2026-11-07','UTC','closed',now()) returning *",[owner]))[0];
 assert.equal(closed.status,'closed');assert.ok(closed.closed_at);
 assert.equal((await q("select count(*)::int n from public.day_plans where user_id=$1 and status='closed'",[other]))[0].n,0);
 // Owner DML must remain blocked even if default Supabase grants ALL on
 // newly created tables. The N46.2 command creates auditable writes.
 await q('grant insert,update,delete on public.day_plans to authenticated');
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.day_plans'))[0].n,2);
 await blocked("insert into public.day_plans(plan_date,time_zone) values('2026-11-10','UTC') returning id");
 await blocked("update public.day_plans set intention='Changed' where id=$1 returning id",[day.id]);
 await blocked("delete from public.day_plans where id=$1 returning id",[closed.id]);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.day_plans'))[0].n,1);
 await blocked("insert into public.day_plans(user_id,plan_date,time_zone) values($1,'2026-11-10','UTC') returning id",[owner]);
 await blocked("update public.day_plans set intention='Stolen' where id=$1 returning id",[day.id]);
 await admin();
 assert.equal((await q('select intention from public.day_plans where id=$1',[day.id]))[0].intention,'Review proofs');
 assert.ok((await q("select count(*)::int n from public.action_changes where table_name='day_plans'"))[0].n>0,'N46.2 audit trigger records privileged fixture writes');
 console.log('PASS N46.1 unique owner day, status/JSON/FK validation, RLS read-only and no unaudited DML');
 // N46.2.1: the staged child schema remains owner-scoped and read-only.
 assert.ok(names.includes('20261108130000_day_plan_items_schema.sql'));
 const itemDoc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/day_plan_items.json',import.meta.url),'utf8'));
 const itemColumns=(await q("select attname from pg_attribute where attrelid='public.day_plan_items'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.equal(itemDoc.table,'day_plan_items');
 assert.deepEqual(Object.keys(itemDoc.columns).sort(),itemColumns);
 assert.deepEqual((await q("select cmd from pg_policies where tablename='day_plan_items'")).map(x=>x.cmd),['SELECT']);
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.day_plan_items'::regclass"))[0].relrowsecurity,true);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='day_plan_items'"))[0].n,1);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plan_items'"))[0].n,0);
 const block=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'study','Owner block','2026-11-08T10:00:00Z','2026-11-08T11:00:00Z','UTC') returning id",[owner]))[0];
 const foreignBlock=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'study','Foreign block','2026-11-08T10:00:00Z','2026-11-08T11:00:00Z','UTC') returning id",[other]))[0];
 const unplaced=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,position,reason) values($1,$2,$3,0,'Keep for tomorrow') returning *",[owner,day.id,task.id]))[0];
 const placed=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,disposition,position) values($1,$2,$3,$4,'placed',1) returning *",[owner,day.id,task.id,block.id]))[0];
 const carried=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,reason,position) values($1,$2,$3,'carried_over','Move to tomorrow',2) returning *",[owner,day.id,task.id]))[0];
 const privateItem=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Keep in view',0) returning *",[other,otherDay.id,otherTask.id]))[0];
 assert.equal(unplaced.disposition,'unplaced');assert.equal(placed.calendar_block_id,block.id);
 assert.equal(carried.disposition,'carried_over');assert.equal(privateItem.user_id,other);
 assert.equal(unplaced.reason,'Keep for tomorrow');
 assert.equal(carried.reason,'Move to tomorrow');
 assert.equal(unplaced.calendar_block_id,null);
 assert.equal(carried.calendar_block_id,null);
 assert.deepEqual((await q("select disposition from public.day_plan_items where user_id=$1 and plan_id=$2 order by position",[owner,day.id])).map(x=>x.disposition),['unplaced','placed','carried_over'],'unplaced and carried-over remain listed');
 assert.equal(placed.version,1);assert.equal(placed.source,'app');assert.ok(placed.created_at&&placed.updated_at);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Queue',0)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Queue',3)",[owner,otherDay.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Queue',3)",[owner,day.id,otherTask.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,reason,position) values($1,$2,$3,$4,'Queue',3)",[owner,day.id,task.id,foreignBlock.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,reason,position) values($1,$2,$3,'lost','Queue',3)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Queue',-1)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Queue',1000000)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,$4,3)",[owner,day.id,task.id,'x'.repeat(1201)]);
 // Each negative case has otherwise-valid owner/plan/task/position fields:
 // the disposition invariants must cause the rejection, not a different FK.
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,position) values($1,$2,$3,'unplaced',3)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,position) values($1,$2,$3,'carried_over',3)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,reason,position) values($1,$2,$3,'unplaced','  ',3)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,reason,position) values($1,$2,$3,'carried_over',$4,3)",[owner,day.id,task.id,'\t']);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,disposition,reason,position) values($1,$2,$3,$4,'unplaced','No capacity',3)",[owner,day.id,task.id,block.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,disposition,reason,position) values($1,$2,$3,$4,'carried_over','Tomorrow',3)",[owner,day.id,task.id,block.id]);
 await invalid("update public.day_plan_items set disposition='unplaced',reason='No capacity' where id=$1",[placed.id]);
 await invalid("update public.day_plan_items set reason='   ' where id=$1",[carried.id]);
 await invalid("update public.day_plan_items set reason=null where id=$1",[unplaced.id]);
 await invalid("update public.day_plan_items set calendar_block_id=$1 where id=$2",[block.id,unplaced.id]);
 await invalid("delete from public.calendar_blocks where id=$1",[block.id]);
 await invalid("delete from public.day_plans where id=$1",[day.id]);
 await invalid("update public.day_plan_items set user_id=$1 where id=$2",[other,placed.id]);
 await invalid("update public.day_plan_items set calendar_block_id=$1 where id=$2",[foreignBlock.id,placed.id]);
 await invalid("delete from public.tasks where id=$1",[task.id]);
 await q('grant insert,update,delete on public.day_plan_items to authenticated');
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.day_plan_items'))[0].n,3);
 await blocked("insert into public.day_plan_items(plan_id,task_id,reason,position) values($1,$2,'Queue',3) returning id",[day.id,task.id]);
 await blocked("update public.day_plan_items set disposition='placed' where id=$1 returning id",[unplaced.id]);
 await blocked("delete from public.day_plan_items where id=$1 returning id",[carried.id]);
 await as(other);
 assert.deepEqual((await q('select id from public.day_plan_items')).map(x=>x.id),[privateItem.id]);
 await blocked("insert into public.day_plan_items(user_id,plan_id,task_id,reason,position) values($1,$2,$3,'Queue',3) returning id",[owner,day.id,task.id]);
 await admin();
 assert.ok((await q("select count(*)::int n from public.action_changes where table_name='day_plan_items'"))[0].n>0,'command migration journals owner item rows');
 console.log('PASS N46.2.1 day-plan child dispositions, owner-composite FKs, RLS and staged write denial');


 // N46.2: one owner-scoped, receipt-backed command for the complete lifecycle.
 let serial=0;
 const commandInput=(operation,patch={},target={},expectedVersion,operationId)=>
  ({resource:'day_plans',schemaVersion:1,operation,
   operationId:operationId||('aaaaaaaa-aaaa-4aaa-8aaa-'+String(++serial).padStart(12,'0')),
   patch,target,...(expectedVersion===undefined?{}:{expectedVersion})});
 const command=async p=>(await q('select public.day_plans_command($1::jsonb) as receipt',
  [JSON.stringify(p)]))[0].receipt;
 const act=r=>{assert.equal(r.status,'ok');assert.ok(Number(r.actionNo)>0);return r.plan;};
 const snapshot=async()=>({
  sources:[
   {resource:'tasks',id:task.id,version:(await q('select version from public.tasks where id=$1',[task.id]))[0].version},
   {resource:'calendar_blocks',id:block.id,version:(await q('select version from public.calendar_blocks where id=$1',[block.id]))[0].version}
  ]
 });
 const previewItems=[
  {task_id:task.id,calendar_block_id:block.id,disposition:'placed',position:0},
  {task_id:task.id,calendar_block_id:null,disposition:'carried_over',reason:'Tomorrow',position:1}
 ];
 await as(owner);
 const createPayload=commandInput('create',
  {plan_date:'2026-11-20',time_zone:'UTC',intention:'Review notes',capacity_minutes:90});
 const created=await command(createPayload), newPlan=act(created);
 assert.equal(newPlan.status,'draft');assert.equal(newPlan.version,1);
 assert.deepEqual(await command(createPayload),created,'same operationId replays the exact receipt');
 assert.equal((await command({...createPayload,patch:{...createPayload.patch,intention:'Changed'}})).status,
  'conflict','changed-payload replay is a conflict');
 const snap=await snapshot();
 const preview=await command(commandInput('preview',{availability:snap,items:previewItems},
  {id:newPlan.id},newPlan.version));
 const shown=act(preview);
 assert.equal(shown.status,'previewed');
 assert.ok(preview.changed.some(x=>x.resource==='day_plan_items'));
 assert.deepEqual((await q('select disposition from public.day_plan_items where plan_id=$1 order by position',
  [newPlan.id])).map(x=>x.disposition),['placed','carried_over']);
 assert.equal((await command(commandInput('commit',{}, {id:newPlan.id},shown.version+1))).status,
  'conflict','optimistic stale version must not commit');
 const committed=await command(commandInput('commit',{}, {id:newPlan.id},shown.version));
 const committedPlan=act(committed);assert.equal(committedPlan.status,'committed');
 const closedReceipt=await command(commandInput('close',{ritual:{reflection:'Done'}},
  {id:newPlan.id},committedPlan.version));
 const closedPlan=act(closedReceipt);
 assert.equal(closedPlan.status,'closed');assert.ok(closedPlan.closed_at);
 const reOpened=await command(commandInput('reopen',{}, {id:newPlan.id},closedPlan.version));
 const reopened=act(reOpened);assert.equal(reopened.status,'committed');
 assert.equal(reopened.closed_at,null,'reopen clears closure instant');
 const second=act(await command(commandInput('create',{plan_date:'2026-11-21',time_zone:'UTC'})));
 assert.equal(second.status,'draft');

 // Generic undo must restore both simple creates and multi-row preview writes.
 const createUndo=await command(commandInput('create',
  {plan_date:'2026-11-26',time_zone:'UTC'}));
 const createdUndoPlan=act(createUndo);
 await q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,createUndo.actionNo]);
 assert.equal((await q('select count(*)::int n from public.day_plans where id=$1',
  [createdUndoPlan.id]))[0].n,0,'undo removes an auditable plan creation');
 const previewUndoPlan=act(await command(commandInput('create',
  {plan_date:'2026-11-27',time_zone:'UTC'})));
 const previewUndo=await command(commandInput('preview',
  {availability:await snapshot(),items:previewItems},{id:previewUndoPlan.id},1));
 act(previewUndo);
 await q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,previewUndo.actionNo]);
 assert.equal((await q('select status from public.day_plans where id=$1',[previewUndoPlan.id]))[0].status,
  'draft','undo restores original previewed header state');
 assert.equal((await q('select count(*)::int n from public.day_plan_items where plan_id=$1',
  [previewUndoPlan.id]))[0].n,0,'undo removes all preview-created placements');
 assert.equal((await q('select status from public.day_plans where id=$1',[newPlan.id]))[0].status,
  'committed','other dates cannot be altered by create/close');
 const staleCreated=act(await command(commandInput('create',{plan_date:'2026-11-22',time_zone:'UTC'})));
 const stalePreview=act(await command(commandInput('preview',
  {availability:await snapshot(),items:previewItems},{id:staleCreated.id},1)));
 await admin();
 await q('update public.tasks set version=version+1 where id=$1',[task.id]);
 await as(owner);
 await assert.rejects(command(commandInput('commit',{}, {id:staleCreated.id},stalePreview.version)),
  /Stale or foreign day-plan source/,'commit rechecks source versions under a lock');
 assert.equal((await q('select status from public.day_plans where id=$1',[staleCreated.id]))[0].status,
  'previewed','stale commit must not partially apply');
 const blockCreated=act(await command(commandInput('create',{plan_date:'2026-11-23',time_zone:'UTC'})));
 const blockPreview=act(await command(commandInput('preview',
  {availability:await snapshot(),items:previewItems},{id:blockCreated.id},1)));
 await admin();
 await q('update public.calendar_blocks set version=version+1 where id=$1',[block.id]);
 await as(owner);
 await assert.rejects(command(commandInput('commit',{}, {id:blockCreated.id},blockPreview.version)),
  /Stale or foreign day-plan source/,'commit rechecks block versions too');
 const ownerClose=act(await command(commandInput('close',{}, {id:newPlan.id},reopened.version)));
 await as(other);
 await assert.rejects(command(commandInput('reopen',{}, {id:newPlan.id},ownerClose.version)),
  /not found for owner/);
 const theirPlan=act(await command(commandInput('create',
  {plan_date:'2026-11-24',time_zone:'UTC'})));
 assert.ok(theirPlan.id);
 await as(owner);
 assert.deepEqual(await q('select id from public.day_plans where id=$1',[theirPlan.id]),[],
  'owner-RLS reads never see a foreign plan');
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcpInput=commandInput('create',{plan_date:'2026-11-25',time_zone:'UTC'});
 const mcp=(await q("select public.mcp_command($1::uuid,'chatgpt',$2::jsonb) receipt",
  [owner,JSON.stringify(mcpInput)]))[0].receipt;
 assert.equal(mcp.status,'ok');
 assert.equal(mcp.plan.source,'mcp');
 await db.exec('reset role');
 assert.equal((await q('select source,user_id from public.actions where no=$1',
  [mcp.actionNo]))[0].user_id,owner);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plans'"))[0].n,
  1);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='day_plan_items'"))[0].n,1);
 console.log('PASS N46.2 command versions, owner isolation, snapshots, item lifecycle, MCP and journal');

}finally{await db.close();}
