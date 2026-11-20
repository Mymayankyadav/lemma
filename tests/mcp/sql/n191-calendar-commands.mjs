// Real app/MCP calendar writes, recurrence corrections, owner isolation and undo.
// Run against PGlite or the existing disposable local PostgreSQL 17 service.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {openN191Postgres} from './fixtures/n191-pg-fixture.mjs';
const db=process.env.NOTIF_TEST_DATABASE_URL ? await openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL) :
 new (await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')).PGlite();
const owner=randomUUID(),other=randomUUID();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=async(sql,args=[])=>(await q(sql,args))[0].result;
const as=async(role,uid='')=>{
 await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[uid]);
 if(role)await db.exec('set role '+role);
};
const envelope=(resource,operation,patch,extra={})=>({schemaVersion:1,operationId:randomUUID(),resource,operation,patch,...extra});
const app=input=>one('select public.study_command($1) result',[JSON.stringify(input)]);
const exception=input=>one('select public.calendar_occurrence_changes_command($1) result',[JSON.stringify(input)]);
const mcp=input=>one('select public.mcp_command($1,$2,$3) result',[owner,'chatgpt',JSON.stringify(input)]);
const undo=action=>one('select public.undo_action($1,$2,false) result',[owner,action]);
const rule={firstDate:'2026-03-08',lastDate:'2026-03-08',weekdays:[0],start:{time:'02:15'},end:{time:'03:45'}};
const createInput=()=>envelope('calendar_blocks','create',{kind:'busy',title:'Recurring commitment',
 starts_at:'2026-03-08T07:15:00Z',ends_at:'2026-03-08T07:45:00Z',time_zone:'America/New_York',
 weekly_rule:rule,buffer_before_minutes:7,buffer_after_minutes:11});
let activeStep='bootstrap';
try{
 for(const role of ['anon','authenticated','service_role'])
  if(!(await q('select 1 from pg_roles where rolname=$1',[role])).length)await db.exec('create role '+role);
 await db.exec(`create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $a$ select coalesce(
   nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
   nullif(current_setting('test.uid',true),'')::uuid) $a$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort()){
  activeStep=file;await db.exec(await readFile(new URL(file,dir),'utf8'));
 }
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [uid,key] of [[owner,'a'],[other,'b']])await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[uid,key.repeat(48)]);
 activeStep='registered fields and app create';
 const registry=await q('select resource,"schema" from public.lemma_command_resources where resource in ($1,$2)',
  ['calendar_blocks','calendar_occurrence_changes']);
 for(const field of ['weekly_rule','buffer_before_minutes','buffer_after_minutes'])
  assert.ok(registry.find(x=>x.resource==='calendar_blocks').schema.fields.includes(field));
 assert.deepEqual(registry.find(x=>x.resource==='calendar_occurrence_changes').schema.operations,['create']);
 await as('authenticated',owner);
 const input=createInput();const created=await app(input);assert.equal(created.status,'ok');assert.ok(created.actionNo>0);
 const id=created.changed[0].id;
 const read=()=>one('select to_jsonb(b) result from public.calendar_blocks b where id=$1',[id]);
 let stored=await read();assert.deepEqual(stored.weekly_rule,rule);
 assert.equal(stored.buffer_before_minutes,7);assert.equal(stored.buffer_after_minutes,11);
 assert.deepEqual(await app(input),created,'lost acknowledgement returns exact original receipt');
 assert.equal((await app({...input,patch:{...input.patch,buffer_before_minutes:8}})).status,'conflict');
 assert.equal((await read()).version,1,'changed operation reuse has no side effect');
 const update=envelope('calendar_blocks','update',{buffer_before_minutes:9},{target:{id},expectedVersion:1});
 const updated=await app(update);assert.equal(updated.status,'ok');assert.equal(updated.changed[0].version,2);
 assert.equal((await app({...update,operationId:randomUUID()})).status,'conflict','stale row version cannot overwrite buffers');
 assert.equal((await read()).buffer_before_minutes,9);
 await undo(updated.actionNo);assert.equal((await read()).buffer_before_minutes,7);
 assert.equal((await read()).version,1);assert.deepEqual(await app(update),updated,'retry after undo still returns original acknowledgement');
 console.log('PASS N191 calendar fields, version conflicts, exact replay and undo');

 activeStep='field validation and owner isolation';
 for(const invalid of [
  {weekdays:[7]}, {weekdays:[0,0]}, {firstDate:'2026-02-30'}, {lastDate:'2028-03-08'},
  {start:{time:'25:00'}}, {start:{time:'02:15',fold:2}}, {start:{time:'02:15',fold:'0'}},
  {extra:'not accepted'}, {zone:'UTC'}, {seriesId:randomUUID()},
 ])await assert.rejects(app({...createInput(),patch:{...input.patch,weekly_rule:{...rule,...invalid}}}),error=>error.code==='22023');
 await assert.rejects(app({...createInput(),patch:{...input.patch,buffer_after_minutes:-1}}),error=>error.code==='23514');
 await assert.rejects(app({...createInput(),patch:{...input.patch,user_id:other}}),/Unknown patch field/);
 await as('authenticated',other);
 assert.equal((await q('select id from public.calendar_blocks where id=$1',[id])).length,0);
 await assert.rejects(app(envelope('calendar_blocks','update',{buffer_after_minutes:1},{target:{id},expectedVersion:1})),/not found/i);
 await as('anon');await assert.rejects(app(createInput()));
 console.log('PASS N191 recurrence shape validation and owner isolation');

 activeStep='DST gap repair through MCP exception command';
 await as('authenticated',owner);
 const occurrences=async()=>{
  const block=await read();const changes=await one("select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) result from public.calendar_occurrence_changes c where series_id=$1",[id]);
  return one('select public.lemma_calendar_occurrences($1,$2,$3,$4,$5) result',
   [id,JSON.stringify(block),JSON.stringify(changes),'2026-03-08T00:00:00Z','2026-03-09T00:00:00Z']);
 };
 assert.equal(await occurrences(),null,'unresolved spring gap blocks admission');
 const move=envelope('calendar_occurrence_changes','create',{series_id:id,original_date:'2026-03-08',original_zone:'America/New_York',
  revision:1,kind:'move',starts_local:'2026-03-08T03:15',ends_local:'2026-03-08T03:45'},{expectedVersion:0});
 await as('service_role');const moved=await mcp(move);assert.equal(moved.status,'ok');assert.ok(moved.actionNo>0);
 assert.deepEqual(await mcp(move),moved);
 await as('authenticated',owner);const repaired=await occurrences();assert.equal(repaired.length,1);
 assert.equal(Date.parse(repaired[0].startsAt),Date.parse('2026-03-08T07:15:00Z'));
 assert.equal(repaired[0].bufferBeforeMinutes,7);assert.equal(repaired[0].bufferAfterMinutes,11);
 assert.equal(repaired[0].revision,1);
 await assert.rejects(app(envelope('calendar_blocks','update',{time_zone:'UTC'},{target:{id},expectedVersion:1})),/original series identity/);
 assert.equal((await exception({...move,operationId:randomUUID()})).status,'conflict','concurrent duplicate revision cannot append');
 assert.equal((await exception({...move,patch:{...move.patch,kind:'cancel',starts_local:null,ends_local:null}})).status,'conflict');
 await as('authenticated',other);await assert.rejects(exception({...move,operationId:randomUUID()}),/not found/i);
 await as('authenticated',owner);
 const cancel=envelope('calendar_occurrence_changes','create',{series_id:id,original_date:'2026-03-08',original_zone:'America/New_York',
  revision:2,kind:'cancel'},{expectedVersion:1});
 const cancelled=await exception(cancel);assert.equal(cancelled.status,'ok');assert.deepEqual(await occurrences(),[]);
 await undo(cancelled.actionNo);assert.equal((await occurrences())[0].revision,1,'undo restores prior exception');
 await undo(moved.actionNo);assert.equal(await occurrences(),null,'undo repair returns unresolved gap');
 await as();
 assert.equal(await one('select source result from public.actions where no=$1',[moved.actionNo]),'chatgpt');
 console.log('PASS N191 MCP recurrence corrections, DST gap repair, stale revisions and undo');

 activeStep='DST fold validation and rollback';
 await as('authenticated',owner);
 const foldedInput=createInput();foldedInput.patch.weekly_rule={firstDate:'2026-11-01',lastDate:'2026-11-01',weekdays:[0],start:{time:'01:15'},end:{time:'01:45',fold:1}};
 const folded=await app(foldedInput);const foldId=folded.changed[0].id;
 const foldMove=envelope('calendar_occurrence_changes','create',{series_id:foldId,original_date:'2026-11-01',original_zone:'America/New_York',revision:1,
  kind:'move',starts_local:'2026-11-01T01:15',ends_local:'2026-11-01T01:45',end_fold:1},{expectedVersion:0});
 await assert.rejects(exception(foldMove),/resolved DST/);
 const explicit={...foldMove,patch:{...foldMove.patch,start_fold:0}};
 await db.exec('begin');const provisional=await exception(explicit);assert.equal(provisional.status,'ok');await db.exec('rollback');
 assert.equal((await q('select * from public.calendar_occurrence_changes where series_id=$1',[foldId])).length,0);
 assert.equal((await q('select * from public.command_receipts where operation_id=$1',[explicit.operationId])).length,0);
 const admitted=await exception(explicit);assert.equal(admitted.status,'ok');
 assert.equal((await exception({...explicit,operationId:randomUUID()})).status,'conflict');
 const c=await one("select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) result from public.calendar_occurrence_changes c where series_id=$1",[foldId]);
 const b=await one('select to_jsonb(b) result from public.calendar_blocks b where id=$1',[foldId]);
 const resolved=await one('select public.lemma_calendar_occurrences($1,$2,$3,$4,$5) result',
  [foldId,JSON.stringify(b),JSON.stringify(c),'2026-11-01T00:00:00Z','2026-11-02T00:00:00Z']);
 assert.equal(Date.parse(resolved[0].endsAt)-Date.parse(resolved[0].startsAt),90*60000);
 console.log('PASS N191 explicit fold selection, transaction rollback and retry');
}catch(error){
 console.error('N191 calendar regression at '+activeStep+': '+(error.code||error.name)+': '+error.message);
 throw error;
}finally{await db.close();}
