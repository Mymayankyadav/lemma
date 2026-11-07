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
 for(const name of names)await db.exec(await readFile(new URL(name,directory),'utf8'));
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/day_plans.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.day_plans'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.equal(doc.table,'day_plans');assert.deepEqual(Object.keys(doc.columns).sort(),columns);
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.day_plans'::regclass"))[0].relrowsecurity,true);
 assert.deepEqual((await q("select cmd from pg_policies where tablename='day_plans'")).map(x=>x.cmd),['SELECT']);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='day_plans'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plans'"))[0].n,0);
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
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='day_plans'"))[0].n,0);
 console.log('PASS N46.1 unique owner day, status/JSON/FK validation, RLS read-only and no unaudited DML');
 // N46.2.1: the staged child schema remains owner-scoped and read-only.
 assert.ok(names.includes('20261108130000_day_plan_items_schema.sql'));
 const itemDoc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/day_plan_items.json',import.meta.url),'utf8'));
 const itemColumns=(await q("select attname from pg_attribute where attrelid='public.day_plan_items'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.equal(itemDoc.table,'day_plan_items');
 assert.deepEqual(Object.keys(itemDoc.columns).sort(),itemColumns);
 assert.deepEqual((await q("select cmd from pg_policies where tablename='day_plan_items'")).map(x=>x.cmd),['SELECT']);
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.day_plan_items'::regclass"))[0].relrowsecurity,true);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='day_plan_items'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plan_items'"))[0].n,0);
 const block=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'study','Owner block','2026-11-08T10:00:00Z','2026-11-08T11:00:00Z','UTC') returning id",[owner]))[0];
 const foreignBlock=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'study','Foreign block','2026-11-08T10:00:00Z','2026-11-08T11:00:00Z','UTC') returning id",[other]))[0];
 const unplaced=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,position,reason) values($1,$2,$3,0,'Keep for tomorrow') returning *",[owner,day.id,task.id]))[0];
 const placed=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,disposition,position) values($1,$2,$3,$4,'placed',1) returning *",[owner,day.id,task.id,block.id]))[0];
 const carried=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,position) values($1,$2,$3,'carried_over',2) returning *",[owner,day.id,task.id]))[0];
 const privateItem=(await q("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,0) returning *",[other,otherDay.id,otherTask.id]))[0];
 assert.equal(unplaced.disposition,'unplaced');assert.equal(placed.calendar_block_id,block.id);
 assert.equal(carried.disposition,'carried_over');assert.equal(privateItem.user_id,other);
 assert.deepEqual((await q("select disposition from public.day_plan_items where user_id=$1 and plan_id=$2 order by position",[owner,day.id])).map(x=>x.disposition),['unplaced','placed','carried_over'],'unplaced and carried-over remain listed');
 assert.equal(placed.version,1);assert.equal(placed.source,'app');assert.ok(placed.created_at&&placed.updated_at);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,0)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,3)",[owner,otherDay.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,3)",[owner,day.id,otherTask.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,position) values($1,$2,$3,$4,3)",[owner,day.id,task.id,foreignBlock.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,disposition,position) values($1,$2,$3,'lost',3)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,-1)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,1000000)",[owner,day.id,task.id]);
 await invalid("insert into public.day_plan_items(user_id,plan_id,task_id,position,reason) values($1,$2,$3,3,$4)",[owner,day.id,task.id,'x'.repeat(1201)]);
 await invalid("delete from public.calendar_blocks where id=$1",[block.id]);
 await q('grant insert,update,delete on public.day_plan_items to authenticated');
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.day_plan_items'))[0].n,3);
 await blocked("insert into public.day_plan_items(plan_id,task_id,position) values($1,$2,3) returning id",[day.id,task.id]);
 await blocked("update public.day_plan_items set disposition='placed' where id=$1 returning id",[unplaced.id]);
 await blocked("delete from public.day_plan_items where id=$1 returning id",[carried.id]);
 await as(other);
 assert.deepEqual((await q('select id from public.day_plan_items')).map(x=>x.id),[privateItem.id]);
 await blocked("insert into public.day_plan_items(user_id,plan_id,task_id,position) values($1,$2,$3,3) returning id",[owner,day.id,task.id]);
 await admin();
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='day_plan_items'"))[0].n,0,'no unsanctioned item journal before N46.2.2');
 console.log('PASS N46.2.1 day-plan child dispositions, owner-composite FKs, RLS and staged write denial');

}finally{await db.close();}
