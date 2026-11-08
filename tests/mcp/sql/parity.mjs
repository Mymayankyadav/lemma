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
 await roundTrip('tasks',specs.tasks);
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

 // For the *actually completed* resource operation families, never allow a
 // missing schema operation to be covered by a metadata-only smoke test.
 const full=['tasks','study_entries','calendar_blocks','study_intervals','deadlines',
  'presets','study_goals','overlap_acknowledgements',
  'parked_thoughts','practice_topics','study_events'];
 for(const resource of full)requireCoverage(resource,
  registered.get(resource).schema.operations,exercised.get(resource)||new Set());
 const missingOps=registry.flatMap(row=>row.schema.operations
  .filter(operation=>!exercised.get(row.resource)?.has(operation))
  .map(operation=>row.resource+'.'+operation));
 console.log('N94 unfinished operation paths ('+missingOps.length+'): '+missingOps.join(', '));

 console.log('PASS N94 11 resource families with overlap acknowledgements and owner/MCP lifecycle, receipts and undo');
 const untestedResources=registry.filter(row=>!exercised.has(row.resource))
  .map(row=>row.resource);
 console.log('N94 resources without any complete owner/MCP round trip ('+
  untestedResources.length+'): '+untestedResources.join(', '));
}finally{await db.close();}
