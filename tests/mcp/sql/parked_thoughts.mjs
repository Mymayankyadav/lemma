// N44.1: full-migration in-memory PGlite, no production connection.
// Storage remains read-only until the auditable N44.2 command is installed.
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
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='parked_thoughts'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='parked_thoughts'"))[0].n,0);

 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
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
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='parked_thoughts'"))[0].n,0);


 // N44.2.1: independently executable owner-bound command-envelope checks.
 // The helper is read-only: no authenticated DML, registry or undo yet.
 const validate=async p=>(await q(
  'select public.parked_thoughts_validate_envelope($1::jsonb) value',
  [JSON.stringify(p)]))[0].value;
 const valid={operationId:'11111111-1111-4111-8111-111111111111',
  schemaVersion:1,resource:'parked_thoughts',operation:'create',
  patch:{text:'Return to this lemma'}};
 await as(owner);
 assert.deepEqual(await validate(valid),valid);
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
 const high={...conversion,patch:{...conversion.patch,priority:'high'}};
 assert.deepEqual(await validate(high),high);
 for(const bad of [null,'urgent',7])
  await assert.rejects(validate({...conversion,patch:{...conversion.patch,priority:bad}}),
   /Invalid task priority/);
 await assert.rejects(validate({...conversion,patch:{title:' '}}),/Task title required/);
 await assert.rejects(validate({...edit,operation:'dismiss',patch:{text:'Ignored'}}),
  /Unknown patch field/);
 await db.exec('set role anon');
 await assert.rejects(validate(valid),/permission denied|Authentication required/);
 await admin();
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='parked_thoughts'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='parked_thoughts'"))[0].n,0);
 console.log('PASS N44.1 owner-scoped read-only storage, status invariants, cross-owner FKs, and no unaudited DML');
}finally{await db.close();}
