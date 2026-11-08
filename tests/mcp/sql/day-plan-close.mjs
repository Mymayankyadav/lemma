// N108: owner-validated canonical close, one receipt and one journal undo.
// Executes the complete migration chain against an isolated in-memory PGlite.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function role(uid){
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[uid??'']);
 if(uid)await db.exec('set role authenticated');
}
const command=(op,patch={},target={},expectedVersion,operationId=randomUUID())=>({
 schemaVersion:1,resource:'day_plans',operation:op,operationId,patch,target,
 ...(expectedVersion===undefined?{}:{expectedVersion})
});
const call=async p=>(await q('select public.day_plans_command($1::jsonb) as r',
 [JSON.stringify(p)]))[0].r;
const ok=r=>{assert.equal(r.status,'ok',JSON.stringify(r));assert.ok(r.actionNo>0);return r};
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid) $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(names.includes('20261208090000_n108_day_plan_close.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await role(null);
 await q('insert into auth.users(id) values($1),($2)',[a,b]);
 const task=(await q("insert into public.tasks(user_id,title) values($1,'Carry') returning id,version",[a]))[0];
 const first=(await q("insert into public.tasks(user_id,title) values($1,'First tomorrow') returning id",[a]))[0];
 const foreign=(await q("insert into public.tasks(user_id,title) values($1,'Foreign') returning id",[b]))[0];
 await role(a);
 const created=ok(await call(command('create',{plan_date:'2020-11-07',time_zone:'UTC'})));
 const planId=created.plan.id;
 const preview=ok(await call(command('preview',{availability:{
  sources:[{resource:'tasks',id:task.id,version:task.version}]},
  items:[{task_id:task.id,disposition:'unplaced',reason:'Not done',position:0}]},
  {id:planId},1));
 const committed=ok(await call(command('commit',{}, {id:planId},preview.plan.version));
 const count=async()=>(await q('select disposition,reason,version,calendar_block_id from public.day_plan_items where plan_id=$1',[planId]))[0];
 assert.equal((await count()).disposition,'unplaced');

 // Every failed close must leave both owner records unchanged.
 const invalid=[
  {tomorrow_first_task_id:foreign.id},
  {carry_over:[foreign.id]},
  {carry_over:[task.id,task.id]},
  {carry_over:[{task_id:task.id,reason:' '}]},
  {carry_over:[{task_id:task.id,reason:'Good',owner_id:b}]},
  {carry_over:[randomUUID()]},
 ];
 for(const patch of invalid) {
  await assert.rejects(call(command('close',patch,{id:planId},committed.plan.version)));
  assert.equal((await q('select status from public.day_plans where id=$1',[planId]))[0].status,'committed');
  assert.equal((await count()).disposition,'unplaced');
 }
 const closing=command('close',{ritual:{summary:'done'},tomorrow_first_task_id:first.id,
  carry_over:[{task_id:task.id,reason:'Next study session'}]},
  {id:planId},committed.plan.version);
 const closed=ok(await call(closing));
 assert.equal(closed.plan.status,'closed');
 assert.equal(closed.plan.tomorrow_first_task_id,first.id);
 assert.deepEqual(closed.plan.ritual,{summary:'done'});
 assert(closed.changed.some(x=>x.resource==='day_plan_items'));
 assert.deepEqual(await call(closing),closed,'exact operationId replay');
 assert.equal((await call({...closing,patch:{...closing.patch,ritual:{changed:true}}})).status,'conflict');
 assert.deepEqual(await count(),{disposition:'carried_over',reason:'Next study session',
  version:2,calendar_block_id:null});
 await q('select public.undo_action($1::uuid,$2::bigint,false)',[a,closed.actionNo]);
 assert.equal((await q('select status,tomorrow_first_task_id from public.day_plans where id=$1',[planId]))[0].status,'committed');
 assert.equal((await q('select tomorrow_first_task_id from public.day_plans where id=$1',[planId]))[0].tomorrow_first_task_id,null);
 assert.equal((await count()).disposition,'unplaced');

 const future=ok(await call(command('create',{plan_date:'2099-11-07',time_zone:'UTC'})));
 const fp=ok(await call(command('preview',{availability:{sources:[]},items:[]},
  {id:future.plan.id},1)));
 const fc=ok(await call(command('commit',{}, {id:future.plan.id},fp.plan.version)));
 await assert.rejects(call(command('close',{carry_over:[]}, {id:future.plan.id},fc.plan.version)),
  /Future day plans/);
 assert.equal((await q('select status from public.day_plans where id=$1',[future.plan.id]))[0].status,'committed');
 await role(b);
 await assert.rejects(call(command('close',{carry_over:[task.id]},{id:planId},committed.plan.version)),
  /not found|owner/i);
 console.log('PASS N108 canonical close, foreign/version checks, replay and multi-row Undo');
} finally {
 await db.close();
}
