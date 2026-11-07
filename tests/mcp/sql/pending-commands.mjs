// N53 full-migration regression: owner ACL, command idempotence, due executor and undo.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const A='11111111-1111-1111-1111-111111111111';
const B='99999999-9999-9999-9999-999999999999';
let sequence=0;
const uuid=()=> 'abcd0000-abcd-4abc-8abc-'+String(++sequence).padStart(12,'0');
const future=n=>new Date(Date.now()+n*60000).toISOString();
const q=async(s,args=[])=>(await db.query(s,args)).rows;
async function as(owner,role='authenticated'){
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[owner]);
 if(role)await db.exec('set role '+role);
}
const api=async p=>(await q('select public.pending_command($1::jsonb) result',
 [JSON.stringify(p)]))[0].result;
const tick=async()=>(await q('select public.lemma_run_due_commands() result'))[0].result;
const task=(title)=>({schemaVersion:1,resource:'tasks',operation:'create',
 operationId:uuid(),patch:{title}});
const schedule=(payload)=>({schemaVersion:1,operationId:uuid(),operation:'schedule',
 resource:'tasks',payload,notBefore:future(30),undoUntil:future(90)});
const change=(operation,id,expectedVersion,extra={})=>({
 schemaVersion:1,operationId:uuid(),operation,target:{id},expectedVersion,...extra
});
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;"+
  "create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $uid$ "+
  "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $uid$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;"+
  "grant usage on schema auth to authenticated;"+
  "grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(migrations.includes('20261116100000_pending_commands.sql'));
 for(const name of migrations)await db.exec(await readFile(new URL(name,dir),'utf8'));
 const fields=(await q("select attname from pg_attribute where attrelid='public.pending_commands'::regclass and attnum>0 and not attisdropped"))
  .map(x=>x.attname).sort();
 const catalog=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/pending_commands.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(catalog.columns).sort(),fields);
 assert.deepEqual((await q("select cmd from pg_policies where schemaname='public' and tablename='pending_commands'"))
  .map(x=>x.cmd),['SELECT']);
 const acl=(await q("select has_function_privilege('anon','public.pending_command(jsonb)','execute') anon,has_function_privilege('authenticated','public.pending_command(jsonb)','execute') app,has_function_privilege('authenticated','public.lemma_run_due_commands()','execute') no_worker,has_function_privilege('service_role','public.lemma_run_due_commands()','execute') worker"))[0];
 assert.deepEqual(acl,{anon:false,app:true,no_worker:false,worker:true});
 await q('insert into auth.users(id) values($1),($2)',[A,B]);
 for(const owner of [A,B])await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [owner,'a'.repeat(48)]);
 await as(A);
 const req=schedule(task('Scheduled task'));
 const created=await api(req);
 assert.equal(created.status,'ok');
 const id=created.changed[0].id;
 assert.deepEqual(await api(req),created,'same schedule operationId is idempotent');
 assert.equal((await api({...req,undoUntil:future(120)})).status,'conflict');
 const extend=change('extend',id,1,{notBefore:future(40),undoUntil:future(100)});
 const changed=await api(extend);
 assert.equal(changed.status,'ok');
 assert.equal(changed.changed[0].version,2);
 assert.deepEqual(await api(extend),changed);
 const stale=await api(change('cancel',id,1));
 assert.equal(stale.status,'conflict');
 assert.equal(stale.conflict.currentVersion,2);
 await assert.rejects(api(change('extend',id,2,{notBefore:future(5)})),/Extend cannot shorten/);
 const cancellation=schedule(task('Cancelled task'));
 const pending=await api(cancellation);
 const cancel=change('cancel',pending.changed[0].id,1);
 assert.equal((await api(cancel)).status,'ok');
 assert.deepEqual((await api(cancel)).status,'ok');
 await as(B);
 assert.equal((await q('select count(*)::int n from public.pending_commands where id=$1',[id]))[0].n,0);
 await assert.rejects(api(change('cancel',id,2)),/not found/i);
 await assert.rejects(api({...schedule(task('Forged')),userId:A}),/Unknown pending/i);
 await as(A);
 await assert.rejects(api({...schedule(task('Nested forged')),payload:{...task('Nested forged'),user_id:B}}),/owner-free/);
 await assert.rejects(api({...schedule(task('Bad resource')),resource:'bogus',
  payload:{...task('Bad resource'),resource:'bogus'}}),/Unregistered/);
 await assert.rejects(q("insert into public.pending_commands(user_id,operation_id,resource,payload,not_before,undo_until) values($1,$2,'tasks','{}',now()+interval '1 day',now()+interval '2 days')",[A,uuid()]),/permission denied|row.level security/i);
 await assert.rejects(tick(),/permission denied|Service role/i);

 // Only the service-role cron executes due commands; empty and repeat ticks are inert.
 await as('', 'service_role');
 assert.deepEqual(await tick(),{executed:0,failed:0,processed:0});
 await as('',null);
 await q("update public.pending_commands set not_before=now()-interval '1 second' where id=$1",[id]);
 await as('','service_role');
 assert.deepEqual(await tick(),{executed:1,failed:0,processed:1});
 assert.deepEqual(await tick(),{executed:0,failed:0,processed:0});
 await as('',null);
 const complete=(await q('select status,result from public.pending_commands where id=$1',[id]))[0];
 assert.equal(complete.status,'succeeded');
 assert.equal(complete.result.status,'ok');
 assert.ok(Number(complete.result.actionNo)>0);
 assert.equal((await q("select count(*)::int n from public.tasks where user_id=$1 and title='Scheduled task'",[A]))[0].n,1);
 await as('','service_role');
 const undone=(await q('select public.undo_action($1::uuid,$2::bigint,false) r',
  [A,complete.result.actionNo]))[0].r;
 assert.equal(Number(undone.undone),Number(complete.result.actionNo));
 await as('',null);
 assert.equal((await q("select count(*)::int n from public.tasks where user_id=$1 and title='Scheduled task'",[A]))[0].n,0);

 // The registry accepts the envelope but command validation fails at execution.
 await as(A);
 const failed=await api(schedule(task('')));
 await as('',null);
 await q("update public.pending_commands set not_before=now()-interval '1 second' where id=$1",[failed.changed[0].id]);
 await as('','service_role');
 assert.deepEqual(await tick(),{executed:0,failed:1,processed:1});
 assert.deepEqual(await tick(),{executed:0,failed:0,processed:0});
 await as('',null);
 const error=(await q('select status,error_class,result from public.pending_commands where id=$1',
  [failed.changed[0].id]))[0];
 assert.equal(error.status,'failed');
 assert.ok(typeof error.error_class==='string'&&error.error_class.length<=16);
 assert.equal((await q('select status from public.pending_commands where id=$1',[pending.changed[0].id]))[0].status,'cancelled');
 console.log('PASS N53 owner receipts, extend/cancel, cron once, failures and undo');
}finally{await db.close()}
