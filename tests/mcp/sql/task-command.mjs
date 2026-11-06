// N22 / D7 owner-bound tasks command, journal and undo acceptance.
// PGlite only: never connect to the production Supabase project.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const unknown='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const role=async(name)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 if(name)await db.exec('set role '+name);
};
const as=async(id)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
let number=0;
const envelope=(operation,extra={})=>({
 operationId:'cccccccc-cccc-4ccc-8ccc-'+String(++number).padStart(12,'0'),
 schemaVersion:1,resource:'tasks',operation,...extra,
});
const cmd=async(payload)=>(await q('select public.task_command($1::jsonb) result',[JSON.stringify(payload)]))[0].result;
const bridge=async(user,source,payload)=>(await q(
 'select public.mcp_task_command($1::uuid,$2::text,$3::jsonb) result',
 [user,source,JSON.stringify(payload)]
))[0].result;
const undo=async(user,no)=>(await q('select public.undo_action($1::uuid,$2::bigint,false) result',[user,no]))[0].result;
const task=async(id)=>(await q('select * from public.tasks where id=$1',[id]))[0];
const title=(name,extra={})=>({patch:{title:name,...extra}});
const create=async(name,extra={})=>cmd(envelope('create',title(name,extra)));
const versioned=async(operation,id,version,patch={})=>cmd(envelope(operation,{
 target:{id},expectedVersion:version,patch,
}));
const isAction=result=>{
 assert.equal(result.status,'ok');
 assert.ok(Number.isSafeInteger(result.actionNo)&&result.actionNo>0,'reversible task write returns actionNo');
};
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
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.some(x=>x.endsWith('_v6_task_command.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);

 const acl=(await q(`select
  has_function_privilege('anon','public.mcp_task_command(uuid,text,jsonb)','execute') as anon,
  has_function_privilege('authenticated','public.mcp_task_command(uuid,text,jsonb)','execute') as member,
  has_function_privilege('service_role','public.mcp_task_command(uuid,text,jsonb)','execute') as service`))[0];
 assert.deepEqual(acl,{anon:false,member:false,service:true});
 await as(owner);
 const first=envelope('create',title('A proof',{priority:'high',due_kind:'date',due_date:'2026-11-12'}));
 const created=await cmd(first);isAction(created);
 const id=created.changed[0].id;
 assert.equal(created.changed[0].version,1);
 assert.equal((await task(id)).user_id,owner);
 assert.equal((await task(id)).due_at,null);
 assert.equal((await task(id)).due_kind,'date');
 assert.deepEqual(await cmd(first),created,'retry returns original exact receipt');
 const altered=await cmd({...first,patch:{title:'Different payload'}});
 assert.equal(altered.status,'conflict','same operationId with changed payload conflicts');
 assert.equal((await task(id)).title,'A proof');
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',[id]))[0].n,1);
 const stale=await versioned('update',id,17,{title:'Wrong version'});
 assert.equal(stale.status,'conflict');
 assert.equal(stale.conflict.expectedVersion,17);
 assert.equal(stale.current.version,1);
 assert.equal((await task(id)).title,'A proof');
 const completed=await versioned('update',id,1,{status:'completed'});isAction(completed);
 assert.equal(completed.changed[0].version,2);
 assert.equal((await task(id)).status,'completed');
 assert.ok((await task(id)).completed_at);
 const reopen=await versioned('update',id,2,{status:'backlog'});isAction(reopen);
 assert.equal((await task(id)).completed_at,null);
 await assert.rejects(create('Conflicting due',{due_kind:'instant',due_date:'2026-11-13',due_at:'2026-11-13T10:00:00Z'}),/check constraint|tasks_due_kind/i);
 await assert.rejects(create('Invalid status',{status:'waiting'}),/check constraint/i);
 const timed=await create('Instant meeting',{due_kind:'instant',due_at:'2026-11-13T10:00:00Z'});
 isAction(timed);
 assert.equal((await task(timed.changed[0].id)).due_date,null);

 // An independently-created task can be safely undone as its first action.
 const newTask=await create('Undo create');isAction(newTask);
 await undo(owner,newTask.actionNo);
 assert.equal(await task(newTask.changed[0].id),undefined);
 // An update can be undone while preserving its previous row and version.
 const before=await create('Before change');
 const beforeId=before.changed[0].id;
 const edit=await versioned('update',beforeId,1,{title:'After change'});isAction(edit);
 await undo(owner,edit.actionNo);
 assert.equal((await task(beforeId)).title,'Before change');
 assert.equal((await task(beforeId)).version,1);
 // A deletion can be undone, restoring its existing ID and version.
 const delCreate=await create('Undo delete');
 const deleted=await versioned('delete',delCreate.changed[0].id,1);isAction(deleted);
 assert.equal(await task(delCreate.changed[0].id),undefined);
 await undo(owner,deleted.actionNo);
 assert.equal((await task(delCreate.changed[0].id)).title,'Undo delete');
 // Later edit to the same row blocks undo of an earlier edit.
 const newer=await create('Versioned');
 const newerId=newer.changed[0].id;
 const firstEdit=await versioned('update',newerId,1,{title:'First edit'});
 await versioned('update',newerId,2,{title:'Second edit'});
 await assert.rejects(undo(owner,firstEdit.actionNo),/Undo|undo/i);

 await as(other);
 assert.equal((await q('select count(*)::int n from public.tasks'))[0].n,0);
 await assert.rejects(versioned('update',id,3,{title:'Steal'}),/Task not found/);
 const theirs=await create('Other owner task');isAction(theirs);
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',[theirs.changed[0].id]))[0].n,0);
 await assert.rejects(undo(owner,theirs.actionNo),/not yours|Not authorized/i);

 await role('service_role');
 await assert.rejects(cmd(envelope('create',title('Unscoped'))),/Authentication required|permission denied/);
 await assert.rejects(bridge(unknown,'chatgpt',envelope('create',title('Unknown owner'))),/Owner not found/);
 const through=await bridge(owner,'chatgpt',envelope('create',title('Connector task')));isAction(through);
 await role(null); // inspect the row/journal as the fixture administrator
 assert.equal((await task(through.changed[0].id)).user_id,owner);
 const journal=(await q('select source,tool,user_id from public.actions where no=$1',[through.actionNo]))[0];
 assert.equal(journal.user_id,owner);
 assert.equal(journal.tool,'study');
 assert.equal(journal.source,'chatgpt');
 const setting=(await q('select connector_last_client from public.settings where user_id=$1',[owner]))[0];
 assert.equal(setting.connector_last_client,'chatgpt');
 await role('authenticated');
 await assert.rejects(bridge(owner,'chatgpt',envelope('create',title('No proxy'))),/permission denied/);
 await role('anon');
 await assert.rejects(bridge(owner,'chatgpt',envelope('create',title('No anon'))),/permission denied/);
 console.log('N22 tasks: receipts, conflicts, completion, undo and service-role owner boundary passed');
}finally{await db.close()}
