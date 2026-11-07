// N47.2.2: validation-only first slice, full-migration PGlite acceptance.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const input={operationId:'11111111-1111-4111-8111-111111111111',
 schemaVersion:1,resource:'overlap_acknowledgements',operation:'create',
 patch:{participants:[
  {kind:'entry',id:'33333333-3333-3333-3333-333333333333',version:1},
  {kind:'block',id:'44444444-4444-4444-4444-444444444444',version:1}],
 starts_at:'2026-11-07T08:00:00Z',ends_at:'2026-11-07T08:15:00Z',
 disposition:'keep_both'}};
const call=async p=>(await q('select public.overlap_ack_validate_envelope($1::jsonb) value',
 [JSON.stringify(p)]))[0].value;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid)$auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261107233000_overlap_ack_validation.sql'));
 const activation='20261107233000_overlap_ack_validation.sql';
 for(const name of migrations){
   if(name===activation){
     assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='overlap_acknowledgements'"))[0].n,0,
       'N47.1 must defer undo registration until audited command activation');
     assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='overlap_acknowledgements'"))[0].n,0);
   }
   await db.exec(await readFile(new URL(name,dir),'utf8'));
 }
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 assert.deepEqual(await call(input),input,'valid create envelope is unchanged');
 const specifiedCreateId={...input,target:{id:'77777777-7777-4777-8777-777777777777'}};
 assert.deepEqual(await call(specifiedCreateId),specifiedCreateId,
  'caller-supplied create UUID stays valid');
 await assert.rejects(call({...input,target:{id:'not-a-uuid'}}),/uuid/i);
 await assert.rejects(call({...input,target:{id:17}}),/target.id must be a UUID/);
 await assert.rejects(call({...input,target:{id:null}}),/target.id must be a UUID/);
 await assert.rejects(call({...input,user_id:owner}),/Unknown command field/);
 await assert.rejects(call({...input,operation:'restore'}),/Unsupported acknowledgement operation/);
 await assert.rejects(call({...input,schemaVersion:2}),/schemaVersion must be 1/);
 await assert.rejects(call({...input,operationId:'not-a-uuid'}),/uuid/i);
 await assert.rejects(call({...input,patch:{...input.patch,participants:[input.patch.participants[0]]}}),
  /Participants must be/);
 await assert.rejects(call({...input,patch:{...input.patch,participants:[
   input.patch.participants[0],input.patch.participants[0]]}}),/Participants must be/);
 await assert.rejects(call({...input,patch:{...input.patch,attributed_to:{kind:'entry',id:input.patch.participants[0].id}}}),
  /Attribution must match/);
 await assert.rejects(call({...input,patch:{...input.patch,reason:'x'.repeat(601)}}),/reason exceeds/);
 await assert.rejects(call({...input,patch:{...input.patch,starts_at:'not-a-date'}}),/starts_at must be an instant/);
 const offsetWindow={...input,patch:{...input.patch,
  starts_at:'2026-11-07T13:30:00+05:30',ends_at:'2026-11-07T13:45:00+05:30'}};
 assert.deepEqual(await call(offsetWindow),offsetWindow,'explicit numeric zone offsets are valid');
 // PostgreSQL accepts timezone-naive strings and infinity by default. Neither is a finite ISO instant.
 for(const field of ['starts_at','ends_at']){
  for(const bad of ['2026-11-07T08:00:00','infinity','-infinity',
   '2026-11-07T08:00:00+15:00','2026-11-07T08:00:00Zjunk']){
   await assert.rejects(call({...input,patch:{...input.patch,[field]:bad}}),
    new RegExp(field+' must be an instant'),'create rejects non-ISO '+field);
  }
 }
 await assert.rejects(call({...input,patch:{...input.patch,ends_at:null}}),/ends_at must be an instant/);
 await assert.rejects(call({...input,patch:{...input.patch,ends_at:17}}),/ends_at must be an instant/);
 await assert.rejects(call({...input,patch:{...input.patch,
  starts_at:'2026-11-07T08:15:00Z'}}),/Acknowledged window must be nonempty/);
 await assert.rejects(call({...input,patch:{...input.patch,
  starts_at:'2026-11-07T09:00:00Z'}}),/Acknowledged window must be nonempty/);
 await assert.rejects(call({...input,patch:{...input.patch,user_id:owner}}),/Unknown patch field/);
 const edit={...input,operation:'update',target:{id:'66666666-6666-4666-8666-666666666666'},
  expectedVersion:2,patch:{reason:'Recorded context'}};
 assert.deepEqual(await call(edit),edit,'partial update allowed with optimistic version');
 const windowPartial={...edit,patch:{starts_at:'2026-11-07T08:01:00Z'}};
 assert.deepEqual(await call(windowPartial),windowPartial,
  'partial instant update defers the final window check to the stored row');
 const offsetPartial={...edit,patch:{ends_at:'2026-11-07T13:45:00+05:30'}};
 assert.deepEqual(await call(offsetPartial),offsetPartial,'partial update accepts explicit offset');
 for(const field of ['starts_at','ends_at']){
  for(const bad of ['2026-11-07T08:00:00','infinity','-infinity'])
   await assert.rejects(call({...edit,patch:{[field]:bad}}),
    new RegExp(field+' must be an instant'),'update rejects non-absolute '+field);
 }
 const fullUpdateOffset={...edit,patch:{starts_at:'2026-11-07T13:30:00+05:30',
  ends_at:'2026-11-07T13:45:00+05:30'}};
 assert.deepEqual(await call(fullUpdateOffset),fullUpdateOffset,'complete update accepts offset window');
 const clearedCreate={...input,patch:{...input.patch,attributed_to:null}};
 assert.deepEqual(await call(clearedCreate),clearedCreate,
  'keep_both create accepts explicit null as a cleared attribution');
 const clearedUpdate={...edit,patch:{
  participants:input.patch.participants,disposition:'keep_both',attributed_to:null}};
 assert.deepEqual(await call(clearedUpdate),clearedUpdate,
  'full update can clear an earlier attributed participant with JSON null');
 await assert.rejects(call({...clearedUpdate,patch:{
  ...clearedUpdate.patch,disposition:'attribute_to'}}),
  /Attribution must match an acknowledged participant/,
  'attribute_to must not accept a missing/null participant choice');
 const completeUpdate={...edit,patch:{
  participants:input.patch.participants,disposition:'attribute_to',
  attributed_to:{kind:'entry',id:input.patch.participants[0].id}}};
 assert.deepEqual(await call(completeUpdate),completeUpdate,
  'complete update attribution agrees with participant set');
 await assert.rejects(call({...completeUpdate,patch:{...completeUpdate.patch,
   attributed_to:{kind:'entry',id:'55555555-5555-4555-8555-555555555555'}}}),
  /Attribution must match an acknowledged participant/);
 const validPartialChoice={...edit,patch:{attributed_to:{
  kind:'entry',id:input.patch.participants[0].id}}};
 assert.deepEqual(await call(validPartialChoice),validPartialChoice,
  'partial update permits a typed choice until stored membership is known');
 const clearedPartialChoice={...edit,patch:{attributed_to:null}};
 assert.deepEqual(await call(clearedPartialChoice),clearedPartialChoice,
  'partial update can clear the optional choice');
 for(const badChoice of [17,'entry',false,[],{}, {kind:'entry'}, 
  {kind:'other',id:input.patch.participants[0].id},
  {kind:'entry',id:17}, {kind:'entry',id:''},
  {kind:'entry',id:'not-a-uuid'},
  {kind:'entry',id:input.patch.participants[0].id,user_id:owner}]){
   await assert.rejects(call({...edit,patch:{attributed_to:badChoice}}),
    /Invalid attribution choice|uuid/i,'invalid partial attributed_to choice rejected');
 }
 const partialAttribution={...edit,patch:{disposition:'attribute_to'}};
 assert.deepEqual(await call(partialAttribution),partialAttribution,
  'partial updates need existing-row context and stay accepted');
 await assert.rejects(call({...edit,expectedVersion:0}),/positive integer/);
 await assert.rejects(call({...edit,patch:{}}),/Update patch/);
 await assert.rejects(call({...edit,patch:{disposition:null}}),/Invalid disposition/);
 await assert.rejects(call({...input,patch:{...input.patch,disposition:null}}),/Invalid disposition/);
 await assert.rejects(call({...edit,target:{}}),/target.id must be/);
 const deletion={...edit,operation:'delete',patch:{}};
 assert.deepEqual(await call(deletion),deletion);
 await assert.rejects(call({...deletion,patch:{reason:'bad'}}),/Unknown patch field/);
 const attribution={...input,patch:{...input.patch,disposition:'attribute_to',
  attributed_to:{kind:'entry',id:input.patch.participants[0].id}}};
 assert.deepEqual(await call(attribution),attribution);
 // Internal registry tables are readable by the admin test fixture, not
 // by authenticated callers. Only the envelope itself uses the client role.
 await db.exec('reset role');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='overlap_acknowledgements'"))[0].n,1,
  'N47.2 activates the registered command');
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='overlap_acknowledgements'"))[0].n,1,
  'N47.2 activates reversible owner-scoped writes');
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='overlap_acknowledgements'"))[0].n,0,
  'a command registration must not create fake audit rows');
 await db.exec('set role anon');
 await assert.rejects(call(input),/permission denied|Authentication required/);

 // N47.2 full lifecycle: two owners, real participant versions, receipt
 // replay, optimistic versions, journalling, generic undo and MCP parity.
 await db.exec('reset role');
 const other='22222222-2222-2222-2222-222222222222';
 const foreignEntry='55555555-5555-4555-8555-555555555555';
 const foreignBlock='66666666-6666-4666-8666-666666666666';
 await q('insert into auth.users(id) values($1)',[other]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [other,'b'.repeat(48)]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Owner study')",
  [input.patch.participants[0].id,owner]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Other study')",
  [foreignEntry,other]);
 await q("insert into public.calendar_blocks(id,user_id,kind,title,starts_at,ends_at,time_zone) values($1,$2,'study','Owner block','2026-11-07T08:00:00Z','2026-11-07T09:00:00Z','UTC')",
  [input.patch.participants[1].id,owner]);
 await q("insert into public.calendar_blocks(id,user_id,kind,title,starts_at,ends_at,time_zone) values($1,$2,'study','Other block','2026-11-07T08:00:00Z','2026-11-07T09:00:00Z','UTC')",
  [foreignBlock,other]);
 const asOwner=async who=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','{}',false)");
  await q("select set_config('test.uid',$1,false)",[who]);
  await db.exec('set role authenticated');
 };
 let seq=0;
 const envelope=(operation,rest={})=>({
  operationId:randomUUID(),schemaVersion:1,resource:'overlap_acknowledgements',
  operation,...rest
 });
 const cmd=async p=>(await q('select public.overlap_acknowledgements_command($1::jsonb) result',
  [JSON.stringify(p)]))[0].result;
 const create=()=>envelope('create',{patch:{...input.patch,reason:'Acknowledged'}});
 const op=async (operation,id,version,patch={})=>cmd(envelope(operation,{
  target:{id},expectedVersion:version,patch}));
 const get=async id=>(await q('select * from public.overlap_acknowledgements where id=$1',[id]))[0];
 const check=reply=>{
  assert.equal(reply.status,'ok');
  assert.ok(Number.isSafeInteger(reply.actionNo)&&reply.actionNo>0,
   'each mutation returns a reversible action number');
  assert.equal(reply.changed.length,1);
 };
 await asOwner(owner);
 const createPayload=create();
 const made=await cmd(createPayload);check(made);
 const rowId=made.changed[0].id;
 assert.equal(made.changed[0].version,1);
 assert.equal((await get(rowId)).user_id,owner);
 assert.equal((await get(rowId)).source,'app');
 assert.equal((await q("select count(*)::int n from public.action_changes where action_no=$1 and table_name='overlap_acknowledgements'",
  [made.actionNo]))[0].n,1,'N47.1 audit trigger writes exactly once');
 assert.deepEqual(await cmd(createPayload),made,'exact operationId retry is immutable');
 const changed=await cmd({...createPayload,patch:{...createPayload.patch,reason:'different'}});
 assert.equal(changed.status,'conflict');
 assert.match(changed.conflict.reason,/different payload/i);
 assert.equal((await get(rowId)).reason,'Acknowledged');
 const stale=await op('update',rowId,9,{reason:'stale'});
 assert.equal(stale.status,'conflict');
 assert.equal(stale.conflict.currentVersion,1);
 const updated=await op('update',rowId,1,{reason:'Changed'});
 check(updated);
 assert.equal(updated.changed[0].version,2);
 assert.equal((await get(rowId)).reason,'Changed');
 const invalidChoice=op('update',rowId,2,{
  disposition:'attribute_to',attributed_to:{kind:'entry',id:foreignEntry}});
 await assert.rejects(invalidChoice,/Attribution|acknowledged participant|constraint/i);
 await assert.rejects(op('update',rowId,2,{
  participants:[input.patch.participants[0],{kind:'entry',id:foreignEntry,version:1}]}),
  /missing|owned|stale/i,'cannot link a foreign owner participant');
 await assert.rejects(op('update',rowId,2,{
  participants:[input.patch.participants[0],{...input.patch.participants[1],version:99}]}),
  /missing|owned|stale/i,'stale participant version rejected');
 await assert.rejects(op('update',rowId,2,{ends_at:'2026-11-07T07:00:00Z'}),
  /Invalid overlap participants|time window/i,'partial window checks stored start');
 await assert.rejects(q("update public.overlap_acknowledgements set reason='unaudited' where id=$1",
  [rowId]),/row.level security|permission denied/i);
 // The N47.1 guard used to increment versions even inside undo_action. The
 // N47.2 compatibility adjustment restores exact old JSON and versions.
 const undoneUpdate=(await q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [owner,updated.actionNo]))[0].result;
 assert.equal(Number(undoneUpdate.undone),Number(updated.actionNo));
 assert.equal((await get(rowId)).version,1);
 assert.equal((await get(rowId)).reason,'Acknowledged');
 const deleted=await op('delete',rowId,1);check(deleted);
 assert.equal(await get(rowId),undefined);
 const undoneDelete=(await q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [owner,deleted.actionNo]))[0].result;
 assert.equal(Number(undoneDelete.undone),Number(deleted.actionNo));
 assert.equal((await get(rowId)).version,1);
 const extra=await cmd(create());check(extra);
 await q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,extra.actionNo]);
 assert.equal(await get(extra.changed[0].id),undefined,'undo create deletes only its row');
 // Staleness is derived dynamically and never silently changes stored data.
 await db.exec('reset role');
 await q('update public.study_entries set version=version+1 where id=$1',
  [input.patch.participants[0].id]);
 assert.equal((await q('select public.overlap_ack_is_stale($1::uuid,$2::jsonb) stale',
  [owner,JSON.stringify(input.patch.participants)]))[0].stale,true);
 await asOwner(owner);
 await assert.rejects(op('update',rowId,1,{reason:'Forged current'}),
  /missing|owned|stale/i);
 const corrected=await op('update',rowId,1,{participants:[
  {...input.patch.participants[0],version:2},input.patch.participants[1]]});
 check(corrected);
 assert.equal(corrected.changed[0].version,2);
 // Other owners never see or mutate the row, even if they know its UUID.
 await asOwner(other);
 assert.equal(await get(rowId),undefined);
 await assert.rejects(op('update',rowId,2,{reason:'Steal'}),
  /not found for owner/i);
 await assert.rejects(q("insert into public.overlap_acknowledgements(user_id,participants,starts_at,ends_at,disposition) values($1,$2::jsonb,'2026-11-07T08:00:00Z','2026-11-07T08:15:00Z','keep_both')",
  [other,JSON.stringify(input.patch.participants)]),
  /row.level security|permission denied/i);
 const foreignPayload=envelope('create',{patch:{participants:[
  {kind:'entry',id:foreignEntry,version:1},
  {kind:'block',id:foreignBlock,version:1}],
  starts_at:'2026-11-07T08:00:00Z',ends_at:'2026-11-07T08:15:00Z',
  disposition:'keep_both'}});
 // Signed-in clients cannot impersonate the service-role bridge.
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb)',
  [other,'chatgpt',JSON.stringify(foreignPayload)]),/Service role required|permission denied/);
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcp=async p=>(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
  [other,'chatgpt',JSON.stringify(p)]))[0].result;
 const viaMcp=await mcp(foreignPayload);check(viaMcp);
 assert.deepEqual(await mcp(foreignPayload),viaMcp,'MCP retries are exactly-once');
 assert.equal((await mcp({...foreignPayload,patch:{
  ...foreignPayload.patch,reason:'reused'}})).status,'conflict');
 await db.exec('reset role');
 assert.equal((await get(viaMcp.changed[0].id)).source,'mcp');
 const audit=(await q('select source,user_id from public.actions where no=$1',
  [viaMcp.actionNo]))[0];
 assert.equal(audit.source,'chatgpt');assert.equal(audit.user_id,other);
 assert.equal((await q("select count(*)::int n from public.action_changes where action_no=$1 and table_name='overlap_acknowledgements'",
  [viaMcp.actionNo]))[0].n,1,'service MCP mutation audited once');
 console.log('PASS N47.2 complete overlap lifecycle, idempotency, owner isolation, staleness, undo and MCP');
}finally{await db.close()}
