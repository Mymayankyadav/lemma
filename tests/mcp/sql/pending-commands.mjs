// N53: isolated full-migration PGlite acceptance (no production mutation).
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const A='11111111-1111-1111-1111-111111111111';
const B='22222222-2222-2222-2222-222222222222';
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const as=async who=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[who]);
 await db.exec('set role authenticated');
};
const uid=()=>randomUUID();
const job=(name,operation='create')=>({
 operationId:uid(),schemaVersion:1,resource:'tasks',operation,patch:{title:name}
});
const command=(operation,patch={},extra={})=>({
 operationId:uid(),schemaVersion:1,resource:'pending_commands',operation,patch,...extra
});
const cmd=async p=>(await q('select public.pending_command($1::jsonb) result',
 [JSON.stringify(p)]))[0].result;
const run=async()=>(await q('select public.lemma_run_due_commands() result'))[0].result;
const dueAt='2000-01-01T00:00:00Z';
try{
 await db.exec([
  'create role anon;create role authenticated;create role service_role;',
  'create schema auth;create schema extensions;create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $a$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $a$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$select decode(repeat('00',n),'hex')$b$;",
  'grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261112120000_pending_commands.sql'));
 for(const file of migrations)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[A,B]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[A,'a'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[B,'b'.repeat(48)]);
 const registry=JSON.parse(await readFile(
  new URL('../../../docs/v6/capability-registry/pending_commands.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.pending_commands'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.deepEqual(Object.keys(registry.columns).sort(),columns,'exact pending command registry');
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.pending_commands'::regclass"))[0].relrowsecurity,true);
 assert.deepEqual((await q("select cmd from pg_policies where tablename='pending_commands'")).map(x=>x.cmd),['SELECT']);
 const grants=(await q("select has_function_privilege('anon','public.pending_command(jsonb)','execute') a,has_function_privilege('authenticated','public.pending_command(jsonb)','execute') b,has_function_privilege('authenticated','public.lemma_run_due_commands()','execute') c"))[0];
 assert.deepEqual(grants,{a:false,b:true,c:false});
 await as(A);
 const future=command('schedule',{
  resource:'tasks',payload:job('Future task'),
  not_before:'2099-01-01T00:00:00Z',undo_until:'2099-02-01T00:00:00Z'});
 const scheduled=await cmd(future);
 assert.equal(scheduled.status,'ok');assert.equal(scheduled.pending.status,'scheduled');
 assert.deepEqual(await cmd(future),scheduled,'exact operationId replay');
 assert.equal((await cmd({...future,patch:{...future.patch,
  not_before:'2099-01-02T00:00:00Z'}})).status,'conflict');
 const id=scheduled.pending.id;
 const extended=await cmd(command('extend',{not_before:'2099-01-15T00:00:00Z',
  undo_until:'2099-02-15T00:00:00Z'},{target:{id},expectedVersion:1}));
 assert.equal(extended.pending.version,2);
 assert.equal((await cmd(command('extend',{not_before:'2099-01-20T00:00:00Z'},
  {target:{id},expectedVersion:1}))).status,'conflict');
 await assert.rejects(cmd(command('extend',{not_before:'2099-01-10T00:00:00Z'},
  {target:{id},expectedVersion:2})),/later instant/);
 const cancelled=await cmd(command('cancel',{}, {target:{id},expectedVersion:2}));
 assert.equal(cancelled.pending.status,'cancelled');
 await assert.rejects(cmd(command('extend',{not_before:'2099-03-01T00:00:00Z'},
  {target:{id},expectedVersion:3})),/Only scheduled/);
 const nested=job('Due task');
 const due=await cmd(command('schedule',{resource:'tasks',payload:nested,not_before:dueAt}));
 assert.equal(due.status,'ok');
 assert.equal((await cmd(command('schedule',{resource:'tasks',payload:nested,
  not_before:dueAt}))).status,'conflict','a nested operation cannot be queued twice');
 await assert.rejects(cmd(command('schedule',{resource:'tasks',payload:job('Bad local'),
  not_before:'2026-11-07T08:00:00'})),/timezone-aware/);
 await assert.rejects(cmd(command('schedule',{resource:'unknown',payload:job('Bad resource'),
  not_before:dueAt})),/not registered/);
 await assert.rejects(q('insert into public.pending_commands(user_id,operation_id,resource,payload,not_before) values($1,$2,$3,$4::jsonb,$5)',
  [A,uid(),'tasks',JSON.stringify(nested),dueAt]),/permission denied|row.level security/i);
 await assert.rejects(run(),/Service role required|permission denied/);
 await as(B);
 assert.equal((await q('select count(*)::int n from public.pending_commands'))[0].n,0);
 await assert.rejects(cmd(command('cancel',{}, {target:{id:due.pending.id},expectedVersion:1})),
  /not found for owner/);
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 assert.deepEqual(await run(),{processed:1,succeeded:1,failed:0});
 assert.deepEqual(await run(),{processed:0,succeeded:0,failed:0},
  'a consumed command never executes twice');
 await db.exec('reset role');
 const completed=(await q('select status,attempts,result,executed_action_no from public.pending_commands where id=$1',
  [due.pending.id]))[0];
 assert.equal(completed.status,'succeeded');assert.equal(completed.attempts,1);
 assert.equal(completed.result.status,'ok');assert.ok(Number(completed.executed_action_no)>0);
 assert.equal((await q("select count(*)::int n from public.tasks where user_id=$1 and title='Due task'",[A]))[0].n,1);
 await as(B);
 const other=await cmd(command('schedule',{
  resource:'tasks',payload:job('Other owner task'),not_before:dueAt}));
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 assert.equal((await run()).succeeded,1,'second owner runs in its own action transaction');
 await db.exec('reset role');
 assert.equal((await q('select status from public.pending_commands where id=$1',[other.pending.id]))[0].status,'succeeded');
 await as(A);
 const bad=await cmd(command('schedule',{resource:'tasks',
  payload:job('Must not create','unknown_operation'),not_before:dueAt}));
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 assert.deepEqual(await run(),{processed:1,succeeded:0,failed:1});
 assert.deepEqual(await run(),{processed:0,succeeded:0,failed:0});
 await db.exec('reset role');
 const failed=(await q('select status,error_class,attempts from public.pending_commands where id=$1',
  [bad.pending.id]))[0];
 assert.equal(failed.status,'failed');assert.equal(failed.attempts,1);
 assert.match(failed.error_class,/^[0-9A-Z]{5}$/);
 assert.equal((await q("select count(*)::int n from public.tasks where title='Must not create'"))[0].n,0);
 await as(A);
 const undone=(await q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [A,completed.executed_action_no]))[0].result;
 assert.equal(Number(undone.undone),Number(completed.executed_action_no));
 assert.equal((await q("select count(*)::int n from public.tasks where title='Due task'"))[0].n,0);
 assert.equal((await q('select status from public.pending_commands where id=$1',[due.pending.id]))[0].status,
  'succeeded','undo never requeues consumed work');
 console.log('PASS N53 delayed owner command, exact replay, extension, cancellation, worker, undo, RLS');
}finally{await db.close();}
