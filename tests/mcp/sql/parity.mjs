// N94: PGlite-only, owner-authenticated app/MCP round trips.
// Incremental harness: the baseline dispatcher resources below exercise full
// cross-surface create/update/delete/undo. The strict coverage assertion and
// missing-path fixture prevent a future "parity" declaration by just counting
// registered resources without exercising their commands.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tsImport} from 'tsx/esm/api';
const {readRegisteredResource}=await tsImport('../../../supabase/functions/mcp/tools/registry.ts',import.meta.url);
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
// Route registered MCP GET through N37's actual handler, backed by isolated
// PGlite. This adapter enforces the owner-filter and 50-row bound in SQL.
let registeredRows=[];
function registeredContext(userId){
 const allowed=new Set(registeredRows.map(r=>r.resource)),calls=[];
 return {userId,calls,db:{from(table){
  if(table!=='lemma_command_resources'&&!allowed.has(table))
   throw Error('Unregistered MCP table: '+table);
  const cond=[];
  const chain={
   select:()=>chain,
   eq:(field,value)=>{if(!safeField(field))throw Error('Unsafe MCP field');
    cond.push([field,value]);return chain;},
   order:(field)=>{if(field!=='id')throw Error('Unexpected MCP sort');return chain;},
   maybeSingle:async()=>({
    data:registeredRows.find(r=>cond.every(([k,v])=>r[k]===v))??null,error:null,
   }),
   range:async(start,end)=>{
    if(table==='lemma_command_resources'||!cond.some(([k,v])=>k==='user_id'&&v===userId))
     throw Error(table+': missing mandatory MCP owner filter');
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
       start<0||end<start||end-start>=50)throw Error('Unbounded MCP query');
    const filter=cond.map(([k],i)=>'"'+k+'"=$'+(i+1)).join(' and ');
    const vals=cond.map(([,v])=>v),from='public."'+table+'"';
    const count=(await q('select count(*)::int n from '+from+' where '+filter,vals))[0].n;
    const data=await q('select * from '+from+' where '+filter+' order by id'+
     ' limit $'+(vals.length+1)+' offset $'+(vals.length+2),
     [...vals,end-start+1,start]);
    calls.push({table,userId,count});return {data,count,error:null};
   },
  };return chain;
 }}};
}
async function mcpPage(resource,id,userId=owner){
 const context=registeredContext(userId);
 const page=JSON.parse(await readRegisteredResource(context,{what:resource,id,limit:10},'get'));
 if(context.calls.length!==1)throw Error(resource+': MCP registered read not executed');
 return page;
}
/** Surface missing owner-editable command paths using the capability registry.
 * These diagnostics are deliberately NOT green-completeness assertions until
 * the remaining resource fixtures are implemented and reviewed. */
async function capabilityPathGaps(registry){
 const base=new URL('../../../docs/v6/capability-registry/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('lemma_command_resources.json',base),'utf8'));
 const documented=new Set((manifest.resources||[]).map(r=>r.resource));
 const gaps=[];
 for(const row of registry){
  if(!documented.has(row.resource))gaps.push(row.resource+': command metadata missing from capability manifest');
  let cap;
  try{cap=JSON.parse(await readFile(new URL(row.resource+'.json',base),'utf8'))}
  catch{gaps.push(row.resource+': capability columns document missing');continue}
  const accepted=new Set(row.schema.fields);
  for(const [field,meta] of Object.entries(cap.columns||{}))
   if(meta.classification==='owner-editable'&&!accepted.has(field))
    gaps.push(row.resource+'.'+field+': owner-editable field lacks registered command/read path');
 }
 return gaps;
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
 parked_thoughts:{fn:'parked_thoughts_command',create:{
  text:'MCP parity parked thought'},update:{text:'App parity edited thought'},
  updateOp:'edit',column:'text',updated:'App parity edited thought'},
 practice_topics:{fn:'practice_topics_command',create:{
  title:'MCP parity practice',next_due_date:'2028-06-19',
  cadence:{kind:'after_rating',daysByRating:[1,3,7,14]}},
  update:{title:'App parity edited practice'},column:'title',
  updated:'App parity edited practice'},
 presets:{fn:'presets_command',create:{label:'MCP parity preset',mode:'pomodoro',
  focus_minutes:25,break_minutes:5,long_break_minutes:15,cycles:4},
  update:{label:'App parity edited preset'},column:'label',updated:'App parity edited preset'},
 deadlines:{fn:'deadlines_command',create:{title:'MCP parity deadline',
  kind:'exam',due_kind:'date',due_date:'2028-04-21'},
  update:{title:'App parity edited deadline'},column:'title',updated:'App parity edited deadline'},
 study_goals:{fn:'study_goals_command',create:{
  period:'custom',start_date:'2028-01-01',end_date:'2028-01-07',time_zone:'UTC',target_minutes:45},
  update:{target_minutes:70},column:'target_minutes',updated:70},
 study_intervals:{fn:'study_command',create:{
  entry_id:null,kind:'focus',started_at:'2026-11-06T08:00:00Z',
  ended_at:'2026-11-06T08:20:00Z'},
  update:{kind:'break'},column:'kind',updated:'break'},
};
// Count only operations whose owner/MCP round trip has actually passed.
const exercised=new Map();
function mark(resource,...operations){
 let tested=exercised.get(resource);
 if(!tested){tested=new Set();exercised.set(resource,tested)}
 for(const op of operations)tested.add(op);
}
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
 const intervalResource=resource==='study_intervals';
 assert.ok(Number.isSafeInteger(initialVersion)&&initialVersion>=1,
  resource+': receipt missing owner version');
 if(!intervalResource)assert.equal(initialVersion,1,resource+': unexpected initial version');
 const journalCount=(await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n;
 assert.deepEqual(await mcp(create),created,resource+': exact MCP retry differs');
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,
  journalCount,resource+': replay created another audit action');
 // Reuse the operationId with a *valid different* field value. Some command
 // validators reject unknown fields before their receipt lookup, which would
 // only test envelope rejection rather than exact-once replay semantics.
 const altered=await mcp({...create,patch:{...create.patch,
  [details.column]:details.updated}});
 // D8 task dispatcher rejects a changed payload, whereas the original
 // study_command compatibility bridge intentionally returns its first
 // stored receipt for any same-operationId retry (N12 contract). Both must
 // prevent a second mutation or receipt; don't conflate the two policies.
 if(['tasks','study_goals','presets','deadlines','parked_thoughts','practice_topics',
  'overlap_acknowledgements'].includes(resource))
  assert.equal(altered.status,'conflict',resource+': changed payload should conflict');
 else
  assert.deepEqual(altered,created,resource+': compatibility replay must return original receipt');
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,
  journalCount,resource+': changed-payload retry journalled a second mutation');
 await as(owner);
 const row=(await q('select * from public.'+resource+' where id=$1',[id]))[0];
 assert.ok(row,resource+': MCP-created row missing from app owner read');
 assert.equal(row.user_id,owner,resource+': cross-owner create');
 // study_intervals has no row version: its command deliberately CASes the
 // containing study_entries.version. Compare the same owner-visible parent.
 const rowVersion=intervalResource?(await q('select version from public.study_entries where id=$1',
  [row.entry_id]))[0]?.version:row.version;
 assert.equal(rowVersion,initialVersion,resource+': app version differs from MCP receipt');
 const updateOp=details.updateOp||'update';
 const updateRequest=command(resource,updateOp,{
  target:{id},expectedVersion:rowVersion,patch:details.update});
 const updated=status(await app(details.fn,updateRequest),resource,'app update');
 assert.equal(updated.changed.find(c=>c.id===id)?.version,initialVersion+1,
  resource+': app/command version mismatch');
 // The PGlite service_role fixture is only granted the dispatcher RPC,
 // not direct table SELECT. Inspect through the fixture administrator; keep
 // the owner predicate so the cross-surface field comparison stays scoped.
 await role(null);
 const after=(await q('select * from public.'+resource+' where id=$1 and user_id=$2',
  [id,owner]))[0];
 assert.equal(after[details.column],details.updated,
  resource+': app edit absent from MCP owner view');
 const afterVersion=intervalResource?(await q('select version from public.study_entries where id=$1',
  [after.entry_id]))[0]?.version:after.version;
 assert.equal(afterVersion,initialVersion+1,resource+': persisted row has stale version');
 const mcpResult=await mcpPage(resource,id);
 assert.equal(mcpResult.total,1,resource+': MCP owner read missing app update');
 assert.equal(mcpResult.items[0][details.column],details.updated,
  resource+': MCP registered projection disagrees with app update');
 assert.ok(!('user_id' in mcpResult.items[0]),resource+': MCP owner ID leakage');
 const registeredFields=registeredRows.find(r=>r.resource===resource).schema.fields;
 // A command registry also lists patch fields belonging to related resources:
 // parking conversion accepts task fields; practice record creates events.
 // Those are command inputs, not columns in the current resource's GET row.
 const cap=JSON.parse(await readFile(new URL(resource+'.json',
  new URL('../../../docs/v6/capability-registry/',import.meta.url)),'utf8'));
 const persisted=new Set(Object.keys(cap.columns||{}));
 const payloadOnly=registeredFields.filter(field=>!persisted.has(field)).sort();
 const expectedRelated={
  parked_thoughts:['title','body','estimate_minutes','priority','due_kind',
   'due_date','due_at','position','subject_id','project_id','checkpoint_id'],
  practice_topics:['rating','occurred_at','response','minutes'],
 };
 assert.deepEqual(payloadOnly,[...(expectedRelated[resource]||[])].sort(),
  resource+': unexpected command-only input fields without a read path');
 const visibleFields=registeredFields.filter(field=>persisted.has(field));
 requireFields(resource,visibleFields,Object.fromEntries(visibleFields.map(field=>[
  field,{appPath:Object.hasOwn(after,field)?'owner app row':'missing',
   mcpPath:Object.hasOwn(mcpResult.items[0],field)?'MCP GET projection':'missing'}
 ])));
 await role('service_role');
 const stale=await mcp(command(resource,updateOp,{
  target:{id},expectedVersion:initialVersion,patch:details.update}));
 assert.equal(stale.status,'conflict',resource+': stale MCP update was accepted');
 const deleted=status(await mcp(command(resource,'delete',{
  target:{id},expectedVersion:initialVersion+1,patch:{}})),resource,'delete');
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.'+resource+
  ' where id=$1',[id]))[0].n,0,resource+': deleted row remains app-visible');
 const restored=await undo(deleted.actionNo);
 assert.equal(Number(restored.undone),Number(deleted.actionNo),
  resource+': undo could not restore deletion');
 const returned=(await q('select * from public.'+resource+' where id=$1',[id]))[0];
 assert.equal(returned[details.column],details.updated,
  resource+': restored data mismatch');
 const restoredVersion=intervalResource?(await q('select version from public.study_entries where id=$1',
  [returned.entry_id]))[0]?.version:returned.version;
 assert.equal(restoredVersion,initialVersion+1,resource+': restored version mismatch');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.'+resource+
  ' where id=$1',[id]))[0].n,0,resource+': foreign owner could read restored row');
 await role(null);
 assert.equal((await mcpPage(resource,id,other)).total,0,
  resource+': foreign owner can read restored row through MCP');
 const action=(await q('select user_id,source from public.actions where no=$1',
  [created.actionNo]))[0];
 assert.equal(action.user_id,owner,resource+': incorrect journal owner');
 assert.equal(action.source,'chatgpt',resource+': MCP source not preserved');
 mark(resource,'create',updateOp,'delete');
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
 registeredRows=registry;
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
 const capabilityGaps=await capabilityPathGaps(registry);
 console.log('N94 capability path gaps ('+capabilityGaps.length+'): '+capabilityGaps.join('; '));
  console.log('PASS N94 registry metadata and missing-operation/path fixtures');

 const registered=new Map(registry.map(row=>[row.resource,row]));
 for(const resource of Object.keys(specs)){
  const row=registered.get(resource);
  assert.ok(row,resource+': missing dispatcher registration');
  // A resource can expose a real owner edit as `edit` rather than `update`.
  // Validate precisely the command invoked by this fixture, not a generic
  // operation name the registry never promised.
  for(const operation of ['create',specs[resource].updateOp||'update','delete'])
   assert.ok(row.schema.operations.includes(operation),resource+'.'+operation+
    ': missing declared operation');
 }
 // A saved manual entry owns the interval used below, so its creation and
 // final deletion must be ordered around the interval round trip.
 const planTaskId=await roundTrip('tasks',specs.tasks);
 const presetId=await roundTrip('presets',specs.presets);
 // Non-CRUD owner preset lifecycle must preserve the exact version and
 // archived state across the MCP path, and generic undo must invert restore.
 await role('service_role');
 const reorderedPreset=status(await mcp(command('presets','reorder',{
  target:{id:presetId},expectedVersion:2,patch:{position:7}
 })),'presets','reorder');
 assert.equal(reorderedPreset.changed[0].version,3);
 await role(null);
 assert.equal((await q('select position from public.presets where id=$1',[presetId]))[0].position,7);
 assert.equal((await mcpPage('presets',presetId)).items[0].position,7);
 mark('presets','reorder');
 await role('service_role');
 let presetRestoreAction;
 for(const [operation,expectedVersion,isArchived] of [
  ['archive',3,true],['restore',4,false]
 ]){
  const receipt=status(await mcp(command('presets',operation,{
   target:{id:presetId},expectedVersion,patch:{}
  })),'presets',operation);
  assert.equal(receipt.changed[0].version,expectedVersion+1);
  await role(null);
  const row=(await q('select archived_at,version from public.presets where id=$1 and user_id=$2',
   [presetId,owner]))[0];
  assert.equal(Boolean(row.archived_at),isArchived,'presets.'+operation+': app archive mismatch');
  assert.equal(row.version,expectedVersion+1);
  const page=await mcpPage('presets',presetId);
  assert.equal(page.total,1,'presets.'+operation+': owner MCP read');
  assert.equal(page.items[0].version,expectedVersion+1,
   'registered MCP projection version mismatch');
  mark('presets',operation);
  if(operation==='restore')presetRestoreAction=receipt.actionNo;
  await role('service_role');
 }
 await as(owner);
 assert.equal((await undo(presetRestoreAction)).undone,presetRestoreAction,
  'presets: undo restore not journalled');
 await role(null);
 assert.ok((await q('select archived_at from public.presets where id=$1',
  [presetId]))[0].archived_at,'presets: undo restore should re-archive');
 const deadlineId=await roundTrip('deadlines',specs.deadlines);
 await role('service_role');
 let deadlineRestoreAction;
 for(const [operation,expectedVersion,want] of [
  ['complete',2,'done'],['reopen',3,'open'],
  ['cancel',4,'cancelled'],['restore',5,'open'],
 ]){
  const receipt=status(await mcp(command('deadlines',operation,{
   target:{id:deadlineId},expectedVersion,patch:{}
  })),'deadlines',operation);
  assert.equal(receipt.changed[0].version,expectedVersion+1,
   'deadlines.'+operation+': version mismatch');
  await role(null);
  const persisted=(await q('select status,version from public.deadlines where id=$1',
   [deadlineId]))[0];
  assert.equal(persisted.status,want,'deadlines.'+operation+': state mismatch');
  assert.equal(persisted.version,expectedVersion+1);
  assert.equal((await mcpPage('deadlines',deadlineId)).total,1,
   'deadlines.'+operation+': MCP owner read missing');
  if(operation==='restore')deadlineRestoreAction=receipt.actionNo;
  mark('deadlines',operation);
  await role('service_role');
 }
 await as(owner);
 assert.equal((await undo(deadlineRestoreAction)).undone,deadlineRestoreAction,
  'deadline restore undo must remain journalled');
 assert.equal((await q('select status,version from public.deadlines where id=$1',
  [deadlineId]))[0].status,'cancelled');
 const goalId=await roundTrip('study_goals',specs.study_goals);
 await role('service_role');
 let goalRestoreAction;
 for(const [operation,expectedVersion,isArchived] of [
  ['archive',2,true],['restore',3,false]
 ]){
  const receipt=status(await mcp(command('study_goals',operation,{
   target:{id:goalId},expectedVersion,patch:{}
  })),'study_goals',operation);
  assert.equal(receipt.changed[0].version,expectedVersion+1);
  await role(null);
  const row=(await q('select archived_at,version from public.study_goals where id=$1 and user_id=$2',
   [goalId,owner]))[0];
  assert.equal(Boolean(row.archived_at),isArchived,'study_goals.'+operation+': app archive mismatch');
  assert.equal(row.version,expectedVersion+1);
  const page=await mcpPage('study_goals',goalId);
  assert.equal(page.total,1,'study_goals.'+operation+': owner MCP read');
  assert.equal(page.items[0].version,expectedVersion+1,
   'registered MCP projection version mismatch');
  mark('study_goals',operation);
  if(operation==='restore')goalRestoreAction=receipt.actionNo;
  await role('service_role');
 }
 await as(owner);
 assert.equal((await undo(goalRestoreAction)).undone,goalRestoreAction,
  'study_goals: undo restore not journalled');
 await role(null);
 assert.ok((await q('select archived_at from public.study_goals where id=$1',
  [goalId]))[0].archived_at,'study_goals: undo restore should re-archive');
 const entryId=await roundTrip('study_entries',specs.study_entries);
 const calendarId=await roundTrip('calendar_blocks',specs.calendar_blocks);
 await roundTrip('study_intervals',{...specs.study_intervals,
  create:{...specs.study_intervals.create,entry_id:entryId}});

 // N46.2: owner and MCP day plan lifecycle with *real* task/block versions.
 await role('service_role');
 const newPlan=command('day_plans','create',{patch:{
  plan_date:'2026-11-06',time_zone:'UTC',
  intention:'N94 planner draft',capacity_minutes:75,
  availability:{sources:[]},ritual:{}}});
 const madePlan=status(await mcp(newPlan),'day_plans','create');
 const planId=madePlan.plan.id;
 assert.equal(madePlan.plan.version,1);
 assert.deepEqual(await mcp(newPlan),madePlan,'day_plans: exact create replay');
 assert.equal((await mcp({...newPlan,patch:{...newPlan.patch,
  intention:'Changed command payload'}})).status,'conflict',
  'day_plans: changed operationId payload must conflict');
 await as(owner);
 assert.equal((await q('select intention from public.day_plans where id=$1',
  [planId]))[0].intention,'N94 planner draft');
 const editedPlan=status(await app('day_plans_command',command('day_plans','update',{
  target:{id:planId},expectedVersion:1,patch:{intention:'N94 app-edited plan'}
 })),'day_plans','update');
 assert.equal(editedPlan.plan.version,2);
 await role(null);
 const pagePlan=await mcpPage('day_plans',planId);
 assert.equal(pagePlan.total,1,'day_plans: MCP registered GET missing');
 assert.equal(pagePlan.items[0].intention,'N94 app-edited plan');
 assert.equal(pagePlan.items[0].version,2);
 assert.equal((await mcpPage('day_plans',planId,other)).total,0,
  'day_plans: foreign owner MCP read');
 const schemaPlan=registered.get('day_plans').schema.fields;
 const capPlan=JSON.parse(await readFile(new URL('day_plans.json',
  new URL('../../../docs/v6/capability-registry/',import.meta.url)),'utf8')).columns;
 assert.deepEqual(schemaPlan.filter(x=>!Object.hasOwn(capPlan,x)),['items'],
  'day_plans: undocumented command-only payload');
 const readPlan=(await q('select * from public.day_plans where id=$1 and user_id=$2',
  [planId,owner]))[0];
 const fieldsPlan=schemaPlan.filter(x=>Object.hasOwn(capPlan,x));
 requireFields('day_plans',fieldsPlan,Object.fromEntries(fieldsPlan.map(key=>[
  key,{appPath:Object.hasOwn(readPlan,key)?'app owner row':'missing',
   mcpPath:Object.hasOwn(pagePlan.items[0],key)?'registered GET':'missing'}
 ])));
 await role('service_role');
 assert.equal((await mcp(command('day_plans','update',{
  target:{id:planId},expectedVersion:1,patch:{intention:'Stale'}
 }))).status,'conflict','day_plans: stale owner version accepted');
 // service_role's PGlite fixture is not BYPASSRLS. Source snapshots must
 // be read as the test harness, not as the privileged MCP dispatcher.
 await role(null);
 const currentTaskVersion=(await q('select version from public.tasks where user_id=$1 and id=$2',
  [owner,planTaskId]))[0].version;
 const currentBlockVersion=(await q('select version from public.calendar_blocks where user_id=$1 and id=$2',
  [owner,calendarId]))[0].version;
 const sourceSnapshot={sources:[
  {resource:'tasks',id:planTaskId,version:currentTaskVersion},
  {resource:'calendar_blocks',id:calendarId,version:currentBlockVersion},
 ]};
 await role('service_role');
 const planPreview=command('day_plans','preview',{target:{id:planId},
  expectedVersion:2,patch:{availability:sourceSnapshot,items:[{
   task_id:planTaskId,calendar_block_id:calendarId,
   disposition:'placed',reason:null,position:0,
  }]}});
 const previewedPlan=status(await mcp(planPreview),'day_plans','preview');
 assert.equal(previewedPlan.plan.status,'previewed');
 assert.equal(previewedPlan.plan.version,3);
 assert.deepEqual(await mcp(planPreview),previewedPlan,
  'day_plans: exact preview replay duplicated item');
 assert.ok(previewedPlan.changed.some(c=>c.resource==='day_plan_items'),
  'day_plans: preview receipt omitted item journal');
 await as(owner);
 const planItems=await q('select task_id,calendar_block_id,disposition from public.day_plan_items where plan_id=$1',[planId]);
 assert.deepEqual(planItems,[{task_id:planTaskId,
  calendar_block_id:calendarId,disposition:'placed'}],
  'day_plans: owner app preview items disagree');
 await role('service_role');
 const committedPlan=status(await mcp(command('day_plans','commit',{
  target:{id:planId},expectedVersion:3,patch:{}
 })),'day_plans','commit');
 assert.equal(committedPlan.plan.status,'committed');
 assert.equal(committedPlan.plan.version,4);
 await role(null);
 assert.equal((await mcpPage('day_plans',planId)).items[0].version,4,
  'day_plans: MCP GET cannot see commit');
 await role('service_role');
 const closedPlan=status(await mcp(command('day_plans','close',{
  target:{id:planId},expectedVersion:4,patch:{ritual:{reviewed:true}}
 })),'day_plans','close');
 assert.equal(closedPlan.plan.status,'closed');
 assert.equal(closedPlan.plan.version,5);
 await as(owner);
 assert.deepEqual((await q('select ritual from public.day_plans where id=$1',
  [planId]))[0].ritual,{reviewed:true},
  'day_plans: app close ritual mismatch');
 await role('service_role');
 const reopenedPlan=status(await mcp(command('day_plans','reopen',{
  target:{id:planId},expectedVersion:5,patch:{}
 })),'day_plans','reopen');
 assert.equal(reopenedPlan.plan.status,'committed');
 assert.equal(reopenedPlan.plan.version,6);
 await as(owner);
 assert.equal((await undo(reopenedPlan.actionNo)).undone,reopenedPlan.actionNo,
  'day_plans: reopen undo missing');
 await role(null);
 const undoPlan=(await q('select status,closed_at from public.day_plans where id=$1',
  [planId]))[0];
 assert.equal(undoPlan.status,'closed','day_plans: undo did not re-close');
 assert.ok(undoPlan.closed_at,'day_plans: undo lost closure instant');
 mark('day_plans','create','update','preview','commit','close','reopen');

 // An acknowledgement validates two existing *current-version* owner
 // participants before every update; a stale version is rejected by its
 // trigger. Use the records already round-tripped above, not mock IDs.
 await role(null);
 const entryVersion=(await q('select version from public.study_entries where id=$1 and user_id=$2',
  [entryId,owner]))[0].version;
 const calendarVersion=(await q('select version from public.calendar_blocks where id=$1 and user_id=$2',
  [calendarId,owner]))[0].version;
 const ackParticipants=[
  {kind:'entry',id:entryId,version:entryVersion},
  {kind:'block',id:calendarId,version:calendarVersion},
 ];
 await roundTrip('overlap_acknowledgements',{
  fn:'overlap_acknowledgements_command',
  create:{participants:ackParticipants,
   starts_at:'2026-11-06T08:05:00Z',ends_at:'2026-11-06T08:25:00Z',
   disposition:'keep_both',reason:'Acknowledged shared time'},
  update:{reason:'App reviewed overlap'},
  column:'reason',updated:'App reviewed overlap',
 });

 // A second study entry must exercise all six versioned timer lifecycle
 // verbs through the real dispatcher (not a fabricated SQL state change).
 // The saved-entry read path exposes version through registered MCP GET even
 // though status is command-managed and intentionally omitted from projection.
 await role('service_role');
 const timerCreate=command('study_entries','create',{
  patch:{source:'timer',intent:'N94 lifecycle timer'},
 });
 const timerReceipt=status(await mcp(timerCreate),'study_entries','create');
 const timerId=timerReceipt.changed.find(x=>x.id)?.id;
 assert.ok(timerId,'study_entries: timer lifecycle create lacked ID');
 assert.deepEqual(await mcp(timerCreate),timerReceipt,'study_entries: timer create retry');
 let timerVersion=timerReceipt.changed.find(x=>x.id===timerId)?.version;
 assert.equal(timerVersion,1,'study_entries: new timer version');
 for(const [operation,expectedStatus,patch] of [
  ['start','running',{}],['pause','paused',{}],['resume','running',{}],
  ['break','paused',{}],['resume','running',{}],
  ['save','saved',{reflection:'N94 lifecycle finished'}],
 ]){
  const request=command('study_entries',operation,{
   target:{id:timerId},expectedVersion:timerVersion,patch,
  });
  const result=status(await mcp(request),'study_entries',operation);
  assert.equal(result.changed.find(x=>x.id===timerId)?.version,timerVersion+1,
   'study_entries.'+operation+': changed version mismatch');
  assert.deepEqual(await mcp(request),result,
   'study_entries.'+operation+': exact replay changed receipt');
  timerVersion++;
  await as(owner);
  const row=(await q('select status,version from public.study_entries where id=$1',
   [timerId]))[0];
  assert.deepEqual(row,{status:expectedStatus,version:timerVersion},
   'study_entries.'+operation+': authenticated app status/version mismatch');
  await role(null);
  const page=await mcpPage('study_entries',timerId);
  assert.equal(page.total,1,'study_entries.'+operation+': registered read missing');
  assert.equal(page.items[0].version,timerVersion,
   'study_entries.'+operation+': MCP version differs from app');
  assert.equal((await mcpPage('study_entries',timerId,other)).total,0,
   'study_entries.'+operation+': foreign owner MCP read');
  mark('study_entries',operation);
  await role('service_role');
 }
 const discardedCreated=status(await mcp(command('study_entries','create',{
  patch:{source:'manual',intent:'N94 discard candidate'}
 })),'study_entries','create');
 const discardId=discardedCreated.changed[0].id;
 const discardRequest=command('study_entries','discard',{
  target:{id:discardId},expectedVersion:1,patch:{}
 });
 const discardedReceipt=status(await mcp(discardRequest),'study_entries','discard');
 assert.deepEqual(await mcp(discardRequest),discardedReceipt,
  'study_entries: discard exact replay');
 await as(owner);
 assert.equal((await q('select status from public.study_entries where id=$1',
  [discardId]))[0].status,'discarded');
 await role(null);
 assert.equal((await mcpPage('study_entries',discardId)).items[0].version,2);
 mark('study_entries','discard');

 // Parked thoughts: exercise non-CRUD lifecycle, multi-resource conversion,
 // exactly-once task creation, and transaction-wide undo as one action.
 const thoughtId=await roundTrip('parked_thoughts',specs.parked_thoughts);
 await role('service_role');
 const dismissal=status(await mcp(command('parked_thoughts','dismiss',{
  target:{id:thoughtId},expectedVersion:2,patch:{}
 })),'parked_thoughts','dismiss');
 assert.equal(dismissal.changed[0].version,3);
 await role(null);
 assert.equal((await q('select status from public.parked_thoughts where id=$1',
  [thoughtId]))[0].status,'dismissed');
 await role('service_role');
 const reopened=status(await mcp(command('parked_thoughts','reopen',{
  target:{id:thoughtId},expectedVersion:3,patch:{}
 })),'parked_thoughts','reopen');
 assert.equal(reopened.changed[0].version,4);
 const convert=command('parked_thoughts','convert_to_task',{
  target:{id:thoughtId},expectedVersion:4,patch:{title:'Parity converted task',
   body:'Keep the two records atomic',priority:'normal'}
 });
 const conversion=status(await mcp(convert),'parked_thoughts','convert_to_task');
 const destination=conversion.task?.id;
 assert.ok(destination,'parked_thoughts: conversion did not return created task');
 assert.equal(conversion.changed.length,2,'parked conversion loses multi-table receipt');
 assert.deepEqual(await mcp(convert),conversion,'parked conversion exact replay');
 await role(null);
 const converted=(await q('select status,destination_id from public.parked_thoughts where id=$1',
  [thoughtId]))[0];
 assert.deepEqual(converted,{status:'converted',destination_id:destination});
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',
  [destination]))[0].n,1);
 const conversionTables=(await q('select table_name from public.action_changes where action_no=$1',
  [conversion.actionNo])).map(x=>x.table_name).sort();
 // MCP dispatch may journal a connector settings heartbeat in the same action.
 // Require *both* business rows, and permit no other side-effects beyond the
 // known connector telemetry row rather than assuming exactly two changes.
 assert.ok(conversionTables.includes('parked_thoughts')&&conversionTables.includes('tasks'),
  'parked conversion must journal both rows in one undo');
 assert.ok(conversionTables.every(x=>['parked_thoughts','tasks','settings'].includes(x)),
  'parked conversion journal includes unrelated tables');
 await as(owner);
 assert.equal((await undo(conversion.actionNo)).undone,conversion.actionNo);
 await role(null);
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',
  [destination]))[0].n,0,'parked conversion undo left task behind');
 assert.equal((await q('select status,version from public.parked_thoughts where id=$1',
  [thoughtId]))[0].status,'open');
 mark('parked_thoughts','dismiss','reopen','convert_to_task');

 // Practice: preserve history and due-date behavior through MCP record,
 // archive/restore, void_event, and owner-visible registered read.
 const practiceId=await roundTrip('practice_topics',specs.practice_topics);
 await role('service_role');
 const archived=status(await mcp(command('practice_topics','archive',{
  target:{id:practiceId},expectedVersion:2,patch:{}
 })),'practice_topics','archive');
 assert.equal(archived.changed[0].version,3);
 await role(null);
 assert.ok((await q('select archived_at from public.practice_topics where id=$1',
  [practiceId]))[0].archived_at);
 await role('service_role');
 const restored=status(await mcp(command('practice_topics','restore',{
  target:{id:practiceId},expectedVersion:3,patch:{}
 })),'practice_topics','restore');
 assert.equal(restored.changed[0].version,4);
 const record=command('practice_topics','record',{target:{id:practiceId},
  expectedVersion:4,patch:{rating:3,occurred_at:'2028-06-18T12:00:00Z',
   response:'Explained invariant',minutes:18}});
 const rated=status(await mcp(record),'practice_topics','record');
 const event=rated.changed.find(x=>x.table==='practice_events');
 assert.ok(event?.id,'practice record did not create event');
 assert.deepEqual(await mcp(record),rated,'practice record exact replay');
 await role(null);
 assert.equal((await q('select count(*)::int n from public.practice_events where id=$1',
  [event.id]))[0].n,1);
 assert.equal((await mcpPage('practice_topics',practiceId)).total,1);
 await role('service_role');
 const voided=status(await mcp(command('practice_topics','void_event',{
  target:{id:event.id},expectedVersion:event.version,patch:{}
 })),'practice_topics','void_event');
 await role(null);
 assert.ok((await q('select voided_at from public.practice_events where id=$1',
  [event.id]))[0].voided_at);
 assert.ok(voided.actionNo>rated.actionNo);
 mark('practice_topics','archive','restore','record','void_event');

 // Study events have no generic CRUD verb: record, edit, void and restore
 // are the complete schema. Exercise MCP creation, authenticated app edit,
 // MCP registered GET, version conflicts, lifecycle and single-action undo.
 await role('service_role');
 const notice=command('study_events','record',{patch:{
  entry_id:entryId,kind:'notice',note:'Owner noticed drift',
  occurred_at:'2026-11-06T08:10:00Z'}});
 const recorded=status(await mcp(notice),'study_events','record');
 const eventId=recorded.changed[0].id;
 assert.equal(recorded.changed[0].version,1);
 const beforeEventReplay=(await q('select count(*)::int n from public.actions where user_id=$1',
  [owner]))[0].n;
 assert.deepEqual(await mcp(notice),recorded,'study_events: replay differs');
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',
  [owner]))[0].n,beforeEventReplay,'study_events: replay journalled a mutation');
 const changedNotice=await mcp({...notice,patch:{...notice.patch,note:'Different valid note'}});
 assert.equal(changedNotice.status,'conflict','study_events: changed operationId accepted');
 await as(owner);
 const ownerEvent=(await q('select * from public.study_events where id=$1',[eventId]))[0];
 assert.equal(ownerEvent.user_id,owner,'study_events: MCP create hidden from app');
 assert.equal(ownerEvent.note,'Owner noticed drift');
 const edit=status(await app('study_events_command',command('study_events','edit',{
  target:{id:eventId},expectedVersion:1,patch:{note:'Owner edited study event'}
 })),'study_events','edit');
 assert.equal(edit.changed[0].version,2);
 await role(null);
 const seenEvent=await mcpPage('study_events',eventId);
 assert.equal(seenEvent.total,1,'study_events: MCP cannot read app edit');
 assert.equal(seenEvent.items[0].note,'Owner edited study event');
 assert.ok(!('user_id' in seenEvent.items[0]));
 const eventColumns=JSON.parse(await readFile(new URL('study_events.json',
  new URL('../../../docs/v6/capability-registry/',import.meta.url)),'utf8')).columns;
 requireFields('study_events',registered.get('study_events').schema.fields,
  Object.fromEntries(registered.get('study_events').schema.fields.map(field=>[
   field,{appPath:Object.hasOwn(eventColumns,field)&&Object.hasOwn(ownerEvent,field)?
    'authenticated app row':'missing',
    mcpPath:Object.hasOwn(seenEvent.items[0],field)?'MCP GET projection':'missing'}
  ])));
 assert.equal((await mcpPage('study_events',eventId,other)).total,0,
  'study_events: foreign owner read');
 await role('service_role');
 const staleEdit=await mcp(command('study_events','edit',{
  target:{id:eventId},expectedVersion:1,patch:{note:'Stale note'}
 }));
 assert.equal(staleEdit.status,'conflict','study_events: accepted stale edit');
 const voidReceipt=status(await mcp(command('study_events','void',{
  target:{id:eventId},expectedVersion:2,patch:{}
 })),'study_events','void');
 assert.equal(voidReceipt.changed[0].version,3);
 await role(null);
 assert.ok((await q('select voided_at from public.study_events where id=$1',
  [eventId]))[0].voided_at,'study_events: void failed to persist');
 await role('service_role');
 const restoreReceipt=status(await mcp(command('study_events','restore',{
  target:{id:eventId},expectedVersion:3,patch:{}
 })),'study_events','restore');
 assert.equal(restoreReceipt.changed[0].version,4);
 await role(null);
 assert.equal((await q('select voided_at from public.study_events where id=$1',
  [eventId]))[0].voided_at,null,'study_events: restore did not persist');
 await as(owner);
 const undoRestore=await undo(restoreReceipt.actionNo);
 assert.equal(undoRestore.undone,restoreReceipt.actionNo);
 await role(null);
 assert.ok((await q('select voided_at from public.study_events where id=$1',
  [eventId]))[0].voided_at,'study_events: undo restore did not re-void');
 mark('study_events','record','edit','void','restore');

 // Command-only parity: card_schedule has no CRUD table or generic MCP
 // GET resource. Exercise both real registered operations against one owner
 // card, compare authenticated app state to the MCP receipt/replay and undo.
 await role(null);
 const cardSubject=(await q("insert into public.subjects(user_id,name,glyph,hue) values($1,'N94 schedule','S','cyan') returning id",
  [owner]))[0].id;
 const cardProject=(await q("insert into public.projects(user_id,subject_id,slug,title,goal) values($1,$2,'n94-schedule','N94 schedule','Parity') returning id",
  [owner,cardSubject]))[0].id;
 const cardNote=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,'N94 Q','N94 A') returning id,no",
  [owner,cardProject]))[0];
 const card=(await q("insert into public.cards(user_id,note_id,ord,state,stability,difficulty,reps) values($1,$2,1,2,3,4,5) returning id",
  [owner,cardNote.id]))[0];
 const cardOwnerRow=async()=> (await q("select due,state,stability,difficulty,reps from public.cards where id=$1 and user_id=$2",
  [card.id,owner]))[0];
 const beforeSchedule=await cardOwnerRow();
 await role('service_role');
 const due='2026-12-15T12:30:00Z';
 const rescheduleRequest=command('card_schedule','reschedule',{
  target:{noteNo:cardNote.no,ord:1},patch:{due},
 });
 const rescheduled=status(await mcp(rescheduleRequest),'card_schedule','reschedule');
 assert.deepEqual(await mcp(rescheduleRequest),rescheduled,
  'card_schedule: reschedule receipt did not replay');
 const alteredSchedule=await mcp({...rescheduleRequest,patch:{due:'2026-12-16T12:30:00Z'}});
 assert.equal(alteredSchedule.status,'conflict',
  'card_schedule: operationId payload conflict not preserved');
 await as(owner);
 const scheduled=(await q('select due,state,stability,difficulty,reps from public.cards where id=$1',
  [card.id]))[0];
 assert.equal(new Date(scheduled.due).toISOString(),'2026-12-15T12:30:00.000Z');
 assert.equal(scheduled.state,beforeSchedule.state);
 assert.equal(scheduled.stability,beforeSchedule.stability);
 await role(null);
 assert.deepEqual(await cardOwnerRow(),scheduled,'card_schedule: app and MCP effect disagree');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.cards where id=$1',
  [card.id]))[0].n,0,'card_schedule: foreign app access');
 await role('service_role');
 const foreignReset=command('card_schedule','reset',{
  target:{noteNo:cardNote.no,ord:1},patch:{},
 });
 await assert.rejects(q(
  'select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
  [other,'chatgpt',JSON.stringify(foreignReset)]),/Card not found for owner/,
  'card_schedule: foreign MCP principal must not mutate owner card');
 const resetRequest=command('card_schedule','reset',{
  target:{noteNo:cardNote.no,ord:1},patch:{},
 });
 const reset=status(await mcp(resetRequest),'card_schedule','reset');
 assert.deepEqual(await mcp(resetRequest),reset,
  'card_schedule: reset receipt did not replay');
 await as(owner);
 const afterReset=(await q('select due,state,stability,difficulty,reps from public.cards where id=$1',
  [card.id]))[0];
 assert.equal(afterReset.state,0,'card_schedule: reset not persisted');
 assert.equal(afterReset.stability,0,'card_schedule: reset did not clear scheduler state');
 assert.equal((await undo(reset.actionNo)).undone,reset.actionNo);
 await role(null);
 const undoneSchedule=await cardOwnerRow();
 assert.equal(undoneSchedule.state,2,'card_schedule: undo reset did not recover state');
 assert.equal(undoneSchedule.stability,3,'card_schedule: undo lost FSRS state');
 assert.equal(new Date(undoneSchedule.due).toISOString(),'2026-12-15T12:30:00.000Z');
 mark('card_schedule','reschedule','reset');

 // N48 review run queue: test a real authenticated owner card as a queued
 // item, then run every registered command verb across both app and MCP.
 // Neither stale grading nor a fake review row is counted as parity.
 await role(null);
 const runNote=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,'N94 review Q','N94 review A') returning id",
  [owner,cardProject]))[0].id;
 const runCard=(await q("insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id,version",
  [owner,runNote]))[0];
 // MCP writes touch settings connector telemetry. Capture the real owner
 // settings version immediately before each review-run start, not a constant.
 const firstSettingsVersion=(await q('select version from public.settings where user_id=$1',
  [owner]))[0].version;
 await role('service_role');
 const runPatch={filters:{includeNew:true},selected_deck_ids:['project:n94-schedule'],
  card_budget:5,minute_budget:5,scheduler_version:'fsrs-5',
  settings_version:firstSettingsVersion};
 const startRun=command('review_runs','start',{patch:runPatch});
 const startedRun=status(await mcp(startRun),'review_runs','start');
 assert.equal(startedRun.run.status,'running','review_runs: real queue must start');
 assert.ok(startedRun.itemCount>=1,'review_runs: card selector produced no owner items');
 const runId=startedRun.run.id;
 assert.deepEqual(await mcp(startRun),startedRun,'review_runs: start exact replay');
 const changedRun=await mcp({...startRun,patch:{...runPatch,card_budget:6}});
 assert.equal(changedRun.status,'conflict','review_runs: changed start payload was accepted');
 await as(owner);
 const beforeRun=(await q('select status,version,position from public.review_runs where id=$1',
  [runId]))[0];
 assert.equal(beforeRun.status,'running','review_runs: authenticated app cannot see run');
 assert.equal(beforeRun.version,startedRun.run.version);
 const items=(await q('select id,card_id,state from public.review_run_items where run_id=$1 order by position',
  [runId]));
 assert.ok(items.some(x=>x.card_id===runCard.id),'review_runs: real owner card missing');
 const pausedRun=status(await app('review_runs_command',command('review_runs','pause',{
  target:{id:runId},expectedVersion:beforeRun.version,patch:{}
 })),'review_runs','pause');
 assert.equal(pausedRun.run.status,'paused','review_runs: app pause not persisted');
 await role(null);
 let seenRun=await mcpPage('review_runs',runId);
 assert.equal(seenRun.total,1,'review_runs: MCP cannot read app pause');
 assert.equal(seenRun.items[0].version,pausedRun.run.version);
 assert.equal((await mcpPage('review_runs',runId,other)).total,0,
  'review_runs: foreign MCP read leaked run');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.review_runs where id=$1',
  [runId]))[0].n,0,'review_runs: foreign app read leaked run');
 await role('service_role');
 const foreignRun=command('review_runs','resume',{
  target:{id:runId},expectedVersion:pausedRun.run.version,patch:{}});
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
  [other,'chatgpt',JSON.stringify(foreignRun)]),/Review run not found|not found for owner/i,
  'review_runs: foreign MCP principal can resume another owner');
 const staleRun=await mcp(command('review_runs','resume',{
  target:{id:runId},expectedVersion:beforeRun.version,patch:{}
 }));
 assert.equal(staleRun.status,'conflict','review_runs: stale transition accepted');
 const resumeRun=command('review_runs','resume',{
  target:{id:runId},expectedVersion:pausedRun.run.version,patch:{}});
 const resumedRun=status(await mcp(resumeRun),'review_runs','resume');
 assert.deepEqual(await mcp(resumeRun),resumedRun,
  'review_runs: resume exact retry mutated twice');
 assert.equal(resumedRun.run.status,'running');
 // A card version change makes its snapshotted queue item stale; advance
 // must audit both the review_run and review_run_item in the same receipt.
 await role(null);
 await q('update public.cards set reps=reps+1 where id=$1',[runCard.id]);
 const currentCard=(await q('select version from public.cards where id=$1',[runCard.id]))[0];
 assert.ok(currentCard.version>runCard.version,'review_runs: fixture card version did not advance');
 await role('service_role');
 const staleItem=items.find(x=>x.card_id===runCard.id);
 const advanceRun=command('review_runs','advance',{
  target:{id:runId},expectedVersion:resumedRun.run.version,
  patch:{kind:'stale',item_id:staleItem.id,reason:'Owner card changed after queue snapshot'}});
 const advancedRun=status(await mcp(advanceRun),'review_runs','advance');
 assert.deepEqual(await mcp(advanceRun),advancedRun,
  'review_runs: advance exact replay changed receipt');
 assert.ok(advancedRun.changed.some(x=>x.resource==='review_run_items'&&x.id===staleItem.id),
  'review_runs: advance receipt lacks journalled queue item');
 await as(owner);
 assert.equal((await q('select state from public.review_run_items where id=$1',
  [staleItem.id]))[0].state,'stale','review_runs: owner cannot see advance');
 const undoneRun=await undo(advancedRun.actionNo);
 assert.equal(Number(undoneRun.undone),advancedRun.actionNo,
  'review_runs: advance undo failed');
 await role(null);
 assert.equal((await q('select state from public.review_run_items where id=$1',
  [staleItem.id]))[0].state,'pending',
  'review_runs: undo lost previous queue-item state');
 const restoredRun=(await q('select status,version,position from public.review_runs where id=$1',
  [runId]))[0];
 assert.equal(restoredRun.status,'running');
 assert.equal(restoredRun.position,0,'review_runs: undo did not restore queue position');
 seenRun=await mcpPage('review_runs',runId);
 assert.equal(seenRun.items[0].version,restoredRun.version,
  'review_runs: registered MCP read diverged after undo');
 await role('service_role');
 const completeRun=status(await mcp(command('review_runs','complete',{
  target:{id:runId},expectedVersion:restoredRun.version,patch:{}
 })),'review_runs','complete');
 assert.equal(completeRun.run.status,'completed','review_runs: complete missing');
 await role(null);
 const latestSettingsVersion=(await q('select version from public.settings where user_id=$1',
  [owner]))[0].version;
 await role('service_role');
 const secondStart=status(await mcp(command('review_runs','start',{
  patch:{...runPatch,settings_version:latestSettingsVersion}
 })),'review_runs','start');
 assert.equal(secondStart.run.status,'running','review_runs: second run not started');
 const abandonRun=status(await mcp(command('review_runs','abandon',{
  target:{id:secondStart.run.id},expectedVersion:secondStart.run.version,patch:{}
 })),'review_runs','abandon');
 assert.equal(abandonRun.run.status,'abandoned','review_runs: abandon missing');
 await as(owner);
 assert.equal((await q('select status from public.review_runs where id=$1',
  [secondStart.run.id]))[0].status,'abandoned');
 await role(null);
 assert.equal((await mcpPage('review_runs',secondStart.run.id)).items[0].version,
  abandonRun.run.version,'review_runs: registered read disagrees after abandon');
 mark('review_runs','start','pause','resume','advance','complete','abandon');

 // N105 concepts: real owner Atlas graph rows, related concept_links, app
 // edits, registered MCP GET and an audited merge/undo. Preview_merge is a
 // read-only registered verb: it must not invent a receipt or journal action.
 await role('service_role');
 const atlasCreate=(name,slug)=>command('concepts','create',{
  patch:{subject_id:cardSubject,name,slug}});
 const atlasFirst=atlasCreate('N94 Atlas First','n94-atlas-first');
 const atlasCreated=status(await mcp(atlasFirst),'concepts','create');
 const firstId=atlasCreated.concept.id;
 assert.equal(atlasCreated.concept.version,1,'concepts: first create version');
 assert.deepEqual(await mcp(atlasFirst),atlasCreated,
  'concepts: exact create receipt replay');
 const differentAtlas=await mcp({...atlasFirst,patch:{...atlasFirst.patch,
  name:'N94 Atlas Alternate'}});
 assert.equal(differentAtlas.status,'conflict',
  'concepts: changed operationId payload must refuse');
 const secondCreated=status(await mcp(atlasCreate('N94 Atlas Second',
  'n94-atlas-second')),'concepts','create');
 const secondId=secondCreated.concept.id;
 const thirdCreated=status(await mcp(atlasCreate('N94 Atlas Third',
  'n94-atlas-third')),'concepts','create');
 const thirdId=thirdCreated.concept.id;
 await as(owner);
 assert.equal((await q('select name from public.concepts where id=$1',
  [firstId]))[0].name,'N94 Atlas First',
  'concepts: MCP create missing from authenticated owner app');
 const atlasEdited=status(await app('concepts_command',command('concepts','update',{
  target:{id:firstId},expectedVersion:1,patch:{blurb:'Owner annotated graph'}
 })),'concepts','update');
 assert.equal(atlasEdited.concept.version,2);
 await role(null);
 let firstPage=await mcpPage('concepts',firstId);
 assert.equal(firstPage.total,1,'concepts: MCP registered read missing');
 assert.equal(firstPage.items[0].blurb,'Owner annotated graph');
 assert.equal(firstPage.items[0].version,2);
 assert.equal((await mcpPage('concepts',firstId,other)).total,0,
  'concepts: foreign MCP read showed another owner graph');
 const atlasRow=(await q('select * from public.concepts where id=$1 and user_id=$2',
  [firstId,owner]))[0];
 const atlasSchema=registered.get('concepts').schema.fields;
 const atlasColumns=JSON.parse(await readFile(new URL('concepts.json',
  new URL('../../../docs/v6/capability-registry/',import.meta.url)),'utf8')).columns;
 const payloadOnly=atlasSchema.filter(field=>!Object.hasOwn(atlasColumns,field)).sort();
 assert.deepEqual(payloadOnly,['other_id','kind','keep_id','keep_version'].sort(),
  'concepts: unrecognized graph command payload fields');
 const atlasPersisted=atlasSchema.filter(field=>Object.hasOwn(atlasColumns,field));
 requireFields('concepts',atlasPersisted,Object.fromEntries(atlasPersisted.map(field=>[
  field,{appPath:Object.hasOwn(atlasRow,field)?'owner app graph row':'missing',
   mcpPath:Object.hasOwn(firstPage.items[0],field)?'MCP GET':'missing'}
 ])));
 await role('service_role');
 const staleAtlas=await mcp(command('concepts','update',{
  target:{id:firstId},expectedVersion:1,patch:{blurb:'Stale owner annotation'}}));
 assert.equal(staleAtlas.status,'conflict','concepts: stale owner version accepted');
 const parentRequest=command('concepts','reparent',{
  target:{id:secondId},expectedVersion:1,patch:{parent_id:firstId}});
 const parented=status(await mcp(parentRequest),'concepts','reparent');
 assert.equal(parented.concept.version,2,'concepts: reparent version did not advance');
 assert.deepEqual(await mcp(parentRequest),parented,
  'concepts: exact reparent replay');
 await as(owner);
 assert.equal((await q('select parent_id from public.concepts where id=$1',
  [secondId]))[0].parent_id,firstId,
  'concepts: app hierarchy does not show MCP reparent');
 await role('service_role');
 const linkRequest=command('concepts','link',{
  target:{id:firstId},expectedVersion:2,
  patch:{other_id:secondId,kind:'prereq'}});
 const linked=status(await mcp(linkRequest),'concepts','link');
 assert.equal(linked.concept.version,3,'concepts: link version did not advance');
 assert.deepEqual(await mcp(linkRequest),linked,
  'concepts: exact link replay');
 await role(null);
 assert.equal((await q("select count(*)::int n from public.concept_links where user_id=$1 and from_id=$2 and to_id=$3 and kind='prereq'",
  [owner,firstId,secondId]))[0].n,1,
  'concepts: MCP link not persisted');
 await role('service_role');
 const unlinkRequest=command('concepts','unlink',{
  target:{id:firstId},expectedVersion:3,
  patch:{other_id:secondId,kind:'prereq'}});
 const unlinked=status(await mcp(unlinkRequest),'concepts','unlink');
 assert.equal(unlinked.concept.version,4,'concepts: unlink version did not advance');
 await role(null);
 assert.equal((await q("select count(*)::int n from public.concept_links where user_id=$1 and from_id=$2 and to_id=$3",
  [owner,firstId,secondId]))[0].n,0,
  'concepts: unlink left an edge');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.concepts where id=$1',
  [firstId]))[0].n,0,'concepts: foreign owner app read');
 await role('service_role');
 const foreignAtlas=command('concepts','update',{
  target:{id:firstId},expectedVersion:4,patch:{name:'Foreign overwrite'}});
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
  [other,'chatgpt',JSON.stringify(foreignAtlas)]),/Atlas concept not found for owner/i,
  'concepts: foreign MCP principal should not alter graph');
 await role(null);
 const graphNote=(await q("insert into public.notes(user_id,project_id,concept_id,front,back) values($1,$2,$3,'N94 merge note','N94 merge answer') returning id",
  [owner,cardProject,secondId]))[0].id;
 const actionsBeforePreview=(await q('select count(*)::int n from public.actions where user_id=$1',
  [owner]))[0].n;
 await role('service_role');
 const previewRequest=command('concepts','preview_merge',{
  target:{id:secondId},patch:{keep_id:thirdId}});
 const preview=await mcp(previewRequest);
 assert.equal(preview.status,'ok','concepts: merge preview refused');
 assert.equal(preview.actionNo,null,'concepts: read-only preview invented action');
 assert.deepEqual(preview.changed,[],'concepts: read-only preview claimed mutations');
 assert.equal(preview.sourceVersion,2);
 assert.equal(preview.keepVersion,1);
 assert.ok(preview.impact.notesAndCards>=1,
  'concepts: real owner note missing from merge preview');
 assert.deepEqual(await mcp(previewRequest),preview,
  'concepts: same preview must be deterministic');
 await role(null);
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',
  [owner]))[0].n,actionsBeforePreview,
  'concepts: read-only preview created an audit action');
 await role('service_role');
 const mergeRequest=command('concepts','merge',{
  target:{id:secondId},expectedVersion:2,
  patch:{keep_id:thirdId,keep_version:1}});
 const merged=status(await mcp(mergeRequest),'concepts','merge');
 assert.equal(merged.mergedId,secondId,'concepts: wrong merged concept');
 assert.deepEqual(await mcp(mergeRequest),merged,
  'concepts: exact merge receipt replay');
 await role(null);
 assert.equal((await q('select count(*)::int n from public.concepts where id=$1',
  [secondId]))[0].n,0,'concepts: merged source still exists');
 assert.equal((await q('select concept_id from public.notes where id=$1',
  [graphNote]))[0].concept_id,thirdId,
  'concepts: merge did not rewire real owner note');
 const keepPage=await mcpPage('concepts',thirdId);
 assert.equal(keepPage.items[0].version,merged.concept.version,
  'concepts: registered MCP kept-version projection mismatch');
 await as(owner);
 assert.equal((await undo(merged.actionNo)).undone,merged.actionNo,
  'concepts: atomic merge undo unavailable');
 await role(null);
 assert.equal((await q('select count(*)::int n from public.concepts where id=$1',
  [secondId]))[0].n,1,'concepts: undo did not restore source row');
 assert.equal((await q('select concept_id from public.notes where id=$1',
  [graphNote]))[0].concept_id,secondId,
  'concepts: undo did not restore owner note association');
 mark('concepts','create','update','reparent','link','unlink',
  'preview_merge','merge');


 // N49 owner proposal drafts: real pending proposals and a real project
 // target. The command changes draft_version rather than a generic version
 // column, and submit creates a still-pending successor, never approval.
 await role(null);
 const proposalSeed=async(suffix)=>(
  await q("insert into public.proposals(user_id,project_id,kind,payload,reason,origin) "+
   "values($1,$2,'card',$3::jsonb,$4,'chatgpt') returning id,version",
   [owner,cardProject,JSON.stringify({front:'N94 '+suffix,back:'Original answer'}),
    'Owner proposal draft parity'])
 )[0];
 const draftOriginal=await proposalSeed('submit');
 const draftSeparate=await proposalSeed('discard');
 await role('service_role');
 const draftCreate=command('proposal_drafts','create',{patch:{
  proposal_id:draftOriginal.id,target_id:cardProject,
  payload:{front:'Owner draft',back:'Owner answer'}}});
 const draftCreated=status(await mcp(draftCreate),'proposal_drafts','create');
 const draftId=draftCreated.draft.id;
 assert.equal(draftCreated.draft.draft_version,1,'proposal_drafts: draft version');
 assert.deepEqual(await mcp(draftCreate),draftCreated,
  'proposal_drafts: exact creation replay');
 assert.equal((await mcp({...draftCreate,patch:{...draftCreate.patch,
  payload:{front:'Changed retry',back:'Owner answer'}}})).status,'conflict',
  'proposal_drafts: changed operationId payload accepted');
 await as(owner);
 const ownerDraft=(await q('select * from public.proposal_drafts where id=$1',
  [draftId]))[0];
 assert.equal(ownerDraft.draft_version,1,'proposal_drafts: owner app version');
 assert.equal(ownerDraft.target_id,cardProject,
  'proposal_drafts: source project target not persisted');
 const saveDraft=command('proposal_drafts','save',{target:{id:draftId},
  expectedVersion:1,patch:{payload:{front:'Owner edited front',back:'Complete answer'}}});
 const draftSaved=status(await app('proposal_drafts_command',saveDraft),
  'proposal_drafts','save');
 assert.equal(draftSaved.draft.status,'saved');
 assert.equal(draftSaved.draft.draft_version,2);
 await role(null);
 const savedPage=await mcpPage('proposal_drafts',draftId);
 assert.equal(savedPage.total,1,'proposal_drafts: registered MCP GET missing');
 assert.deepEqual(savedPage.items[0].payload,
  {front:'Owner edited front',back:'Complete answer'},
  'proposal_drafts: MCP GET disagrees with owner app edit');
 assert.equal(savedPage.items[0].proposal_id,draftOriginal.id);
 assert.equal(savedPage.items[0].target_id,cardProject);
 assert.equal((await mcpPage('proposal_drafts',draftId,other)).total,0,
  'proposal_drafts: foreign MCP read leaked owner draft');
 const draftSchema=registered.get('proposal_drafts').schema.fields;
 const draftCapabilities=JSON.parse(await readFile(
  new URL('proposal_drafts.json',new URL('../../../docs/v6/capability-registry/',
   import.meta.url)),'utf8')).columns;
 const draftColumns=draftSchema.filter(x=>Object.hasOwn(draftCapabilities,x));
 assert.equal(draftColumns.length,draftSchema.length,
  'proposal_drafts: unexpected undocumented command payload field');
 const storedDraft=(await q('select * from public.proposal_drafts where id=$1 and user_id=$2',
  [draftId,owner]))[0];
 requireFields('proposal_drafts',draftColumns,Object.fromEntries(draftColumns.map(key=>[
  key,{appPath:Object.hasOwn(storedDraft,key)?'owner app draft row':'missing',
   mcpPath:Object.hasOwn(savedPage.items[0],key)?'registered MCP GET':'missing'}
 ])));
 await as(other);
 assert.equal((await q('select count(*)::int n from public.proposal_drafts where id=$1',
  [draftId]))[0].n,0,'proposal_drafts: foreign owner app read');
 await role('service_role');
 const staleDraft=await mcp(command('proposal_drafts','save',{target:{id:draftId},
  expectedVersion:1,patch:{payload:{front:'stale'}}}));
 assert.equal(staleDraft.status,'conflict','proposal_drafts: stale draft save accepted');
 const foreignDraft=command('proposal_drafts','discard',{target:{id:draftId},
  expectedVersion:2,patch:{}});
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
  [other,'chatgpt',JSON.stringify(foreignDraft)]),/Draft not found for owner/i,
  'proposal_drafts: foreign owner MCP mutation');
 const submitDraft=command('proposal_drafts','submit',{target:{id:draftId},
  expectedVersion:2,patch:{}});
 const draftSubmitted=status(await mcp(submitDraft),'proposal_drafts','submit');
 assert.equal(draftSubmitted.draft.status,'submitted');
 assert.equal(draftSubmitted.draft.draft_version,3);
 assert.ok(draftSubmitted.revisedProposalId,
  'proposal_drafts: submit lacks real successor proposal');
 assert.ok(draftSubmitted.changed.some(c=>c.resource==='proposals'),
  'proposal_drafts: submit receipt omitted successor');
 assert.deepEqual(await mcp(submitDraft),draftSubmitted,
  'proposal_drafts: submit retry created another revision');
 await role(null);
 assert.equal((await q('select status from public.proposals where id=$1',
  [draftSubmitted.revisedProposalId]))[0].status,'pending',
  'proposal_drafts: submit incorrectly approved a proposal');
 assert.ok((await q('select withdrawn_at from public.proposals where id=$1',
  [draftOriginal.id]))[0].withdrawn_at,'proposal_drafts: original not withdrawn');
 await as(owner);
 assert.equal((await undo(draftSubmitted.actionNo)).undone,draftSubmitted.actionNo,
  'proposal_drafts: whole submission undo failed');
 await role(null);
 assert.equal((await q('select status from public.proposal_drafts where id=$1',
  [draftId]))[0].status,'saved','proposal_drafts: submit undo lost saved draft');
 assert.equal((await q('select withdrawn_at from public.proposals where id=$1',
  [draftOriginal.id]))[0].withdrawn_at,null,
  'proposal_drafts: undo did not restore original proposal');
 assert.equal((await q('select count(*)::int n from public.proposals where id=$1',
  [draftSubmitted.revisedProposalId]))[0].n,0,
  'proposal_drafts: undone successor was not removed');
 await role('service_role');
 const otherDraft=status(await mcp(command('proposal_drafts','create',{patch:{
  proposal_id:draftSeparate.id,payload:{front:'Discard me',back:'Unsent owner draft'}
 }})),'proposal_drafts','create');
 const discardDraft=command('proposal_drafts','discard',{
  target:{id:otherDraft.draft.id},expectedVersion:1,patch:{}});
 const discardedDraft=status(await mcp(discardDraft),'proposal_drafts','discard');
 assert.equal(discardedDraft.draft.status,'discarded');
 assert.deepEqual(await mcp(discardDraft),discardedDraft,
  'proposal_drafts: discard replay mutated twice');
 await as(owner);
 assert.equal((await q('select status from public.proposal_drafts where id=$1',
  [otherDraft.draft.id]))[0].status,'discarded',
  'proposal_drafts: authenticated owner cannot see discard');
 assert.equal((await undo(discardedDraft.actionNo)).undone,
  discardedDraft.actionNo,'proposal_drafts: discard undo failed');
 await role(null);
 assert.equal((await q('select status from public.proposal_drafts where id=$1',
  [otherDraft.draft.id]))[0].status,'draft',
  'proposal_drafts: undo did not restore draft status');
 mark('proposal_drafts','create','save','submit','discard');


 // N91 command-only corrections operate on real session events, reviews and
 // cards. They have no independent CRUD table or registered GET. The MCP
 // receipt and authenticated app view must describe the same owner rows.
 await role(null);
 const correctionCheckpoint=(await q(
  "insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) "+
  "values($1,$2,'CP94',1,'Review evidence','Demonstrate','Evidence',"+
  "$3::jsonb) returning id",
  [owner,cardProject,JSON.stringify(['Explain the proof'])]))[0].id;
 const correctionSession=(await q(
  "insert into public.sessions(user_id,project_id,number,goal,style,checkpoint_id) "+
  "values($1,$2,94,'Proof check','socratic',$3) returning id",
  [owner,cardProject,correctionCheckpoint]))[0].id;
 const sourceEvent=(await q(
  "insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome) "+
  "values($1,$2,$3,'evidence','Original proof','demonstrated') returning id",
  [owner,correctionSession,correctionCheckpoint]))[0].id;
 await role('service_role');
 const eventCorrection=command('session_event_corrections','correct',{
  target:{id:String(sourceEvent)},patch:{reason:'Correct evidence text',
   body:'Corrected proof evidence',occurredAt:'2026-11-06T12:00:00Z'}});
 const correctedEvent=status(await mcp(eventCorrection),
  'session_event_corrections','correct');
 assert.ok(correctedEvent.revisedEventId,
  'session_event_corrections.correct: successor missing');
 assert.deepEqual(await mcp(eventCorrection),correctedEvent,
  'session_event_corrections.correct: exact receipt replay');
 assert.equal((await mcp({...eventCorrection,patch:{...eventCorrection.patch,
  body:'Different valid correction'}})).status,'conflict',
  'session_event_corrections.correct: reused operationId changed payload');
 await as(owner);
 const oldEvidence=(await q('select superseded_by from public.session_events where id=$1',
  [sourceEvent]))[0];
 const newEvidence=(await q('select body,correction_reason from public.session_events where id=$1',
  [correctedEvent.revisedEventId]))[0];
 assert.equal(Number(oldEvidence.superseded_by),Number(correctedEvent.revisedEventId),
  'session_event_corrections.correct: original not superseded');
 assert.equal(newEvidence.body,'Corrected proof evidence',
  'session_event_corrections.correct: app read disagrees with MCP receipt');
 assert.equal(newEvidence.correction_reason,'Correct evidence text');
 assert.equal((await q('select status from public.checkpoints where id=$1',
  [correctionCheckpoint]))[0].status,'demonstrated',
  'session_event_corrections.correct: evidence not rederived');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.session_events where id=$1',
  [correctedEvent.revisedEventId]))[0].n,0,
  'session_event_corrections.correct: foreign app read');
 await role('service_role');
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
  [other,'chatgpt',JSON.stringify(command('session_event_corrections','void',{
   target:{id:String(correctedEvent.revisedEventId)},patch:{reason:'Not yours'}}))]),
  /Session event not found for owner/,
  'session_event_corrections: foreign MCP command changed owner event');
 await as(owner);
 assert.equal((await undo(correctedEvent.actionNo)).undone,correctedEvent.actionNo,
  'session_event_corrections.correct: audited undo rejected');
 await role(null);
 assert.equal((await q('select superseded_by from public.session_events where id=$1',
  [sourceEvent]))[0].superseded_by,null,
  'session_event_corrections.correct: undo did not restore predecessor');
 assert.equal((await q('select count(*)::int n from public.session_events where id=$1',
  [correctedEvent.revisedEventId]))[0].n,0,
  'session_event_corrections.correct: undo retained successor');
 await role('service_role');
 const eventVoid=command('session_event_corrections','void',{
  target:{id:String(sourceEvent)},patch:{reason:'Evidence was invalid'}});
 const voidedEvidence=status(await mcp(eventVoid),
  'session_event_corrections','void');
 assert.deepEqual(await mcp(eventVoid),voidedEvidence,
  'session_event_corrections.void: exact receipt replay');
 assert.equal((await mcp({...eventVoid,patch:{reason:'Different valid reason'}})).status,
  'conflict','session_event_corrections.void: changed operationId payload accepted');
 await as(owner);
 assert.ok((await q('select voided_at from public.session_events where id=$1',
  [sourceEvent]))[0].voided_at,
  'session_event_corrections.void: not visible to app');
 assert.equal((await q('select status from public.checkpoints where id=$1',
  [correctionCheckpoint]))[0].status,'not_started',
  'session_event_corrections.void: checkpoint evidence not rederived');
 assert.equal((await undo(voidedEvidence.actionNo)).undone,voidedEvidence.actionNo,
  'session_event_corrections.void: undo rejected');
 await role(null);
 assert.equal((await q('select voided_at from public.session_events where id=$1',
  [sourceEvent]))[0].voided_at,null,
  'session_event_corrections.void: undo did not restore evidence');
 mark('session_event_corrections','correct','void');

 // Review corrections replace one actual card schedule using a disclosed
 // complete snapshot; no version column is invented for reviews or cards.
 const correctionReview=(await q(
  "insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) "+
  "values($1,$2,3,0,6000,'{}'::jsonb) returning id",
  [owner,card.id]))[0].id;
 const beforeReviewCard=(await q(
  'select state,due,stability,difficulty,last_review,step,reps,lapses '+
  'from public.cards where id=$1',[card.id]))[0];
 const replacement={state:2,due:'2026-12-01T00:00:00Z',stability:8,
  difficulty:4,last_review:'2026-11-06T09:00:00Z',step:0,reps:2,lapses:0};
 await role('service_role');
 const reviewCorrection=command('review_corrections','correct',{
  target:{id:String(correctionReview)},patch:{reason:'Misgraded answer',
   rating:4,replacementState:replacement,schedulerParams:{method:'manual audit'}}});
 const correctedReview=status(await mcp(reviewCorrection),
  'review_corrections','correct');
 assert.ok(correctedReview.parameterSnapshotId,
  'review_corrections.correct: missing explicit scheduler snapshot');
 assert.equal(correctedReview.method,'disclosed_replacement');
 assert.deepEqual(await mcp(reviewCorrection),correctedReview,
  'review_corrections.correct: exact receipt replay');
 assert.equal((await mcp({...reviewCorrection,patch:{...reviewCorrection.patch,
  rating:2}})).status,'conflict',
  'review_corrections.correct: changed operationId accepted');
 await as(owner);
 const reviewedRow=(await q('select rating,params_id from public.reviews where id=$1',
  [correctionReview]))[0];
 assert.equal(reviewedRow.rating,4,'review_corrections.correct: owner grade mismatch');
 assert.equal(reviewedRow.params_id,correctedReview.parameterSnapshotId);
 assert.equal((await q('select stability from public.cards where id=$1',
  [card.id]))[0].stability,8,
  'review_corrections.correct: replacement not reflected by app');
 const snapshotParams=(await q('select params from public.review_parameter_sets where id=$1',
  [correctedReview.parameterSnapshotId]))[0].params;
 assert.deepEqual(snapshotParams.replacementState,replacement,
  'review_corrections.correct: historical replacement parameters lost');
 await as(other);
 assert.equal((await q('select count(*)::int n from public.reviews where id=$1',
  [correctionReview]))[0].n,0,'review_corrections: foreign app read');
 await role('service_role');
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) data',
  [other,'chatgpt',JSON.stringify(command('review_corrections','void',{
   target:{id:String(correctionReview)},patch:{reason:'Not yours',
    replacementState:replacement}}))]),/Review not found for owner/,
  'review_corrections: foreign MCP command changed owner grade');
 await as(owner);
 assert.equal((await undo(correctedReview.actionNo)).undone,correctedReview.actionNo,
  'review_corrections.correct: audited undo rejected');
 await role(null);
 assert.equal((await q('select rating from public.reviews where id=$1',
  [correctionReview]))[0].rating,3,
  'review_corrections.correct: undo did not restore grade');
 assert.deepEqual((await q(
  'select state,due,stability,difficulty,last_review,step,reps,lapses '+
  'from public.cards where id=$1',[card.id]))[0],beforeReviewCard,
  'review_corrections.correct: undo did not restore card schedule');
 await role('service_role');
 const reviewVoid=command('review_corrections','void',{
  target:{id:String(correctionReview)},patch:{reason:'Review never occurred',
   replacementState:{...replacement,reps:1,stability:2}}});
 const voidedReview=status(await mcp(reviewVoid),'review_corrections','void');
 assert.deepEqual(await mcp(reviewVoid),voidedReview,
  'review_corrections.void: exact receipt replay');
 assert.equal((await mcp({...reviewVoid,patch:{...reviewVoid.patch,
  reason:'Different valid void reason'}})).status,'conflict',
  'review_corrections.void: changed operationId payload accepted');
 await as(owner);
 assert.ok((await q('select undone_at from public.reviews where id=$1',
  [correctionReview]))[0].undone_at,'review_corrections.void: app cannot see void');
 assert.equal((await q('select stability from public.cards where id=$1',
  [card.id]))[0].stability,2,
  'review_corrections.void: replacement card schedule not applied');
 assert.equal((await undo(voidedReview.actionNo)).undone,voidedReview.actionNo,
  'review_corrections.void: audited undo rejected');
 await role(null);
 assert.equal((await q('select undone_at from public.reviews where id=$1',
  [correctionReview]))[0].undone_at,null,
  'review_corrections.void: undo did not unvoid owner review');
 mark('review_corrections','correct','void');

 // For the *actually completed* resource operation families, never allow a
 // missing schema operation to be covered by a metadata-only smoke test.
 const full=['session_event_corrections','review_corrections','proposal_drafts','day_plans','concepts','review_runs','card_schedule','tasks','study_entries','calendar_blocks','study_intervals','deadlines',
  'presets','study_goals','overlap_acknowledgements',
  'parked_thoughts','practice_topics','study_events'];
 for(const resource of full)requireCoverage(resource,
  registered.get(resource).schema.operations,exercised.get(resource)||new Set());
 const missingOps=registry.flatMap(row=>row.schema.operations
  .filter(operation=>!exercised.get(row.resource)?.has(operation))
  .map(operation=>row.resource+'.'+operation));
 console.log('N94 unfinished operation paths ('+missingOps.length+'): '+missingOps.join(', '));

 console.log('PASS N94 '+exercised.size+' resource families with real owner/MCP lifecycles, receipts and undo');
 const untestedResources=registry.filter(row=>!exercised.has(row.resource))
  .map(row=>row.resource);
 console.log('N94 resources without any complete owner/MCP round trip ('+
  untestedResources.length+'): '+untestedResources.join(', '));
}finally{await db.close();}
