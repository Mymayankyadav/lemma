// N94: PGlite-only, owner-authenticated app/MCP round trips.
// Incremental harness: the baseline dispatcher resources below exercise full
// cross-surface create/update/delete/undo. The strict coverage assertion and
// missing-path fixture prevent a future "parity" declaration by just counting
// registered resources without exercising their commands.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const status=(value,resource,operation)=>{
 assert.equal(value?.status,'ok',resource+' '+operation+': command rejected');
 assert.ok(Number.isSafeInteger(value.actionNo)&&value.actionNo>0,
  resource+' '+operation+': missing audited action');
 assert.ok(Array.isArray(value.changed)&&value.changed.length>0,
  resource+' '+operation+': missing changed resource');
 return value;
};
const role=async name=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 if(name)await db.exec('set role '+name);
};
const as=async id=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const command=(resource,operation,fields={})=>({
 schemaVersion:1,operationId:randomUUID(),resource,operation,...fields,
});
const mcp=async input=>(await q(
 'select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
 [owner,'chatgpt',JSON.stringify(input)]))[0].data;
const app=async(fn,input)=>(await q('select public.'+fn+'($1::jsonb) data',
 [JSON.stringify(input)]))[0].data;
const undo=async actionNo=>(await q(
 'select public.undo_action($1::uuid,$2::bigint,false) data',[owner,actionNo]))[0].data;
const safeName=v=>typeof v==='string'&&/^[a-z_][a-z0-9_]*$/.test(v);
const safeField=v=>typeof v==='string'&&/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v);
/** A missing operation must fail by resource/operation, not be silently skipped. */
function requireCoverage(resource,operations,covered){
 for(const op of operations){
  if(!covered.has(op))throw Error('Missing parity round trip: '+resource+'.'+op);
 }
}
function requireFields(resource,fields,paths){
 for(const field of fields){
  const record=paths[field];
  if(!record||!record.appPath||!record.mcpPath||
     /\b(missing|unavailable)\b/i.test(record.appPath+' '+record.mcpPath))
   throw Error('Missing read/write path: '+resource+'.'+field);
 }
}
const specs={
 tasks:{fn:'task_command',create:{title:'MCP parity task',priority:'high'},
  update:{title:'App parity edited task'},column:'title',updated:'App parity edited task'},
 study_entries:{fn:'study_command',create:{source:'manual',intent:'MCP parity study'},
  update:{intent:'App parity edited study'},column:'intent',updated:'App parity edited study'},
 calendar_blocks:{fn:'study_command',create:{
  kind:'study',title:'MCP parity calendar',starts_at:'2026-11-06T08:00:00Z',
  ends_at:'2026-11-06T09:00:00Z',time_zone:'UTC'},
  update:{title:'App parity edited calendar'},column:'title',updated:'App parity edited calendar'},
 study_intervals:{fn:'study_command',create:{
  entry_id:null,kind:'focus',started_at:'2026-11-06T08:00:00Z',
  ended_at:'2026-11-06T08:20:00Z'},
  update:{kind:'break'},column:'kind',updated:'break'},
};
async function roundTrip(resource,details){
 // Requires a service-role command, a real authenticated app owner read/write,
 // then an MCP/owner re-read, logical deletion, and undo restoration.
 await role('service_role');
 const create=command(resource,'create',{patch:details.create});
 const created=status(await mcp(create),resource,'create');
 const id=created.changed.find(c=>c.id)?.id;
 assert.match(String(id),/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i,
  resource+': invalid created ID');
 const initialVersion=created.changed.find(c=>c.id===id)?.version;
 assert.equal(initialVersion,1,resource+': unexpected initial version');
 const journalCount=(await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n;
 assert.deepEqual(await mcp(create),created,resource+': exact MCP retry differs');
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,
  journalCount,resource+': replay created another audit action');
 const altered=await mcp({...create,patch:{...create.patch,_different:'attempted'}});
 assert.equal(altered.status,'conflict',resource+': altered payload reuses operationId');
 await as(owner);
 const row=(await q('select * from public.'+resource+' where id=$1',[id]))[0];
 assert.ok(row,resource+': MCP-created row missing from app owner read');
 assert.equal(row.user_id,owner,resource+': cross-owner create');
 assert.equal(row.version,1,resource+': app version differs from MCP receipt');
 const updateRequest=command(resource,'update',{
  target:{id},expectedVersion:row.version,patch:details.update});
 const updated=status(await app(details.fn,updateRequest),resource,'app update');
 assert.equal(updated.changed.find(c=>c.id===id)?.version,2,
  resource+': app/command version mismatch');
 await role('service_role');
 const after=(await q('select * from public.'+resource+' where id=$1 and user_id=$2',
  [id,owner]))[0];
 assert.equal(after[details.column],details.updated,
  resource+': app edit absent from MCP owner view');
 assert.equal(after.version,2,resource+': MCP read saw stale version');
 const stale=await mcp(command(resource,'update',{
  target:{id},expectedVersion:1,patch:details.update}));
 assert.equal(stale.status,'conflict',resource+': stale MCP update was accepted');
 const deleted=status(await mcp(command(resource,'delete',{
  target:{id},expectedVersion:2,patch:{}})),resource,'delete');
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.'+resource+
  ' where id=$1',[id]))[0].n,0,resource+': deleted row remains app-visible');
 const restored=await undo(deleted.actionNo);
 assert.equal(Number(restored.undone),Number(deleted.actionNo),
  resource+': undo could not restore deletion');
 const returned=(await q('select * from public.'+resource+' where id=$1',[id]))[0];
 assert.equal(returned[details.column],details.updated,
  resource+': restored data mismatch');
 assert.equal(returned.version,2,resource+': restored version mismatch');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.'+resource+
  ' where id=$1',[id]))[0].n,0,resource+': foreign owner could read restored row');
 await role(null);
 const action=(await q('select user_id,source from public.actions where no=$1',
  [created.actionNo]))[0];
 assert.equal(action.user_id,owner,resource+': incorrect journal owner');
 assert.equal(action.source,'chatgpt',resource+': MCP source not preserved');
 return id;
}
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $auth$ "+
  "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
  "nullif(current_setting('test.uid',true),'')::uuid) $auth$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$ "+
  "select decode(repeat('00',n),'hex') $bytes$;"+
  "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [other,'b'.repeat(48)]);
 const registry=await q('select resource,"schema",command_fn,mcp_ok from public.lemma_command_resources order by resource');
 assert.ok(registry.length>=4,'missing baseline registered resources');
 assert.equal(new Set(registry.map(x=>x.resource)).size,registry.length,
  'duplicate command registry resources');
 for(const row of registry){
  assert.ok(safeName(row.resource),row.resource+': unsafe resource identifier');
  assert.ok(safeName(row.command_fn),row.resource+': unsafe function identifier');
  assert.equal(row.mcp_ok,true,row.resource+': MCP disabled without a policy');
  assert.ok(Array.isArray(row.schema?.operations)&&row.schema.operations.length,
   row.resource+': operations missing');
  assert.ok(Array.isArray(row.schema.fields),row.resource+': fields missing');
  for(const x of [...row.schema.operations,...row.schema.fields])
   assert.ok(safeField(x),row.resource+': invalid operation/field '+x);
 }
 // A deliberately incomplete fixture MUST fail by resource and field.
 assert.throws(()=>requireCoverage('missing_fixture',['create','update','delete'],
  new Set(['create','update'])),/missing_fixture.delete/);
 assert.throws(()=>requireFields('missing_fixture',['title','summary'],
  {title:{appPath:'app',mcpPath:'mcp'}}),/missing_fixture.summary/);
 console.log('PASS N94 registry metadata and missing-operation/path fixtures');

 const registered=new Map(registry.map(row=>[row.resource,row]));
 for(const resource of Object.keys(specs)){
  const row=registered.get(resource);
  assert.ok(row,resource+': missing dispatcher registration');
  for(const operation of ['create','update','delete'])
   assert.ok(row.schema.operations.includes(operation),resource+'.'+operation+
    ': missing declared operation');
 }
 // A saved manual entry owns the interval used below, so its creation and
 // final deletion must be ordered around the interval round trip.
 await roundTrip('tasks',specs.tasks);
 const entryId=await roundTrip('study_entries',specs.study_entries);
 await roundTrip('calendar_blocks',specs.calendar_blocks);
 await roundTrip('study_intervals',{...specs.study_intervals,
  create:{...specs.study_intervals.create,entry_id:entryId}});
 console.log('PASS N94 baseline task/study/calendar/interval MCP→app→MCP, CAS, delete and undo');
 console.log('N94 coverage pending expansion beyond four base registry resources: '+
  registry.filter(r=>!Object.hasOwn(specs,r.resource)).map(r=>r.resource).join(', '));
}finally{await db.close();}
