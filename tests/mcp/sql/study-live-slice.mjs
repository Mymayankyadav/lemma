// N35.1: full-migration PGlite parity only, never Supabase production.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';
const {dayCapacity,calendarRange}=await tsImport('../../../src/features/calendar/model.ts',import.meta.url);
const {periodFor,effortSummary}=await tsImport('../../../src/features/progress-v6/model.ts',import.meta.url);
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
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
let count=0;
const env=(resource,operation,extra={})=>({
 operationId:'eeee0000-0000-4000-8000-'+String(++count).padStart(12,'0'),
 schemaVersion:1,resource,operation,...extra
});
const app=async(p)=>(await q('select public.study_command($1::jsonb) result',[JSON.stringify(p)]))[0].result;
const mcp=async(id,client,p)=>(await q(
 'select public.mcp_study_command($1::uuid,$2::text,$3::jsonb) result',
 [id,client,JSON.stringify(p)]
))[0].result;
function success(receipt){
 assert.equal(receipt.status,'ok');
 assert.ok(Number.isSafeInteger(receipt.actionNo)&&receipt.actionNo>0);
 return receipt.changed[0];
}
const iso=v=>new Date(v).toISOString();
const readEntries=async()=>{
 const rows=await q('select * from public.study_entries order by created_at,id');
 const intervals=await q('select * from public.study_intervals order by started_at,id');
 return rows.map(x=>({
  id:x.id,intent:x.intent,source:x.source,status:x.status,version:x.version,
  subjectId:x.subject_id,projectId:x.project_id,checkpointId:x.checkpoint_id,
  sessionId:x.session_id,reflection:x.reflection,rating:x.rating,
  createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),
  savedAt:x.saved_at?iso(x.saved_at):null,
  intervals:intervals.filter(i=>i.entry_id===x.id).map(i=>({
   id:i.id,kind:i.kind,start:iso(i.started_at),end:i.ended_at?iso(i.ended_at):null
  }))
 }));
};
try {
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 
 // Browser owner writes through the public study_command used by StudyApi.
 await as(owner);
 const fromApp=success(await app(env('study_entries','create',{
  patch:{source:'manual',intent:'Read and prove a theorem'}
 })));
 const intervalApp=success(await app(env('study_intervals','create',{
  patch:{entry_id:fromApp.id,kind:'focus',started_at:'2026-11-05T09:00:00Z',ended_at:'2026-11-05T09:30:00Z'}
 })));
 assert.equal(intervalApp.version,2);
 const stale=await app(env('study_entries','save',{
  target:{id:fromApp.id},expectedVersion:1,patch:{reflection:'stale'}
 }));
 assert.equal(stale.status,'conflict');
 const savedApp=success(await app(env('study_entries','save',{
  target:{id:fromApp.id},expectedVersion:2,patch:{reflection:'Proved'}
 })));
 assert.equal(savedApp.version,3);
 
 // Authenticated connector owner writes into the same persisted tables.
 await role('service_role');
 const fromChat=success(await mcp(owner,'chatgpt',env('study_entries','create',{
  patch:{source:'manual',intent:'Tutor session'}
 })));
 const intervalChat=success(await mcp(owner,'chatgpt',env('study_intervals','create',{
  patch:{entry_id:fromChat.id,kind:'focus',started_at:'2026-11-05T10:00:00Z',ended_at:'2026-11-05T10:20:00Z'}
 })));
 assert.equal(intervalChat.version,2);
 const savedChat=success(await mcp(owner,'chatgpt',env('study_entries','save',{
  target:{id:fromChat.id},expectedVersion:2,patch:{reflection:'Explained to tutor'}
 })));
 assert.equal(savedChat.version,3);
 
 // The app's owner-RLS query returns the connector-created entry with the
 // exact receipt version, and the connector has no parallel study store.
 await as(owner);
 const records=await readEntries();
 assert.equal(records.length,2);
 assert.deepEqual(records.map(x=>x.id).sort(),[fromApp.id,fromChat.id].sort());
 assert.equal(records.find(x=>x.id===fromApp.id).version,savedApp.version);
 assert.equal(records.find(x=>x.id===fromChat.id).version,savedChat.version);
 assert.equal(records.find(x=>x.id===fromChat.id).reflection,'Explained to tutor');
 assert.ok(records.every(x=>x.status==='saved'&&x.intervals.length===1));
 
 // Calendar Day and Progress Day consume the same saved focus intervals.
 const span=calendarRange('2026-11-05','UTC');
 const period=periodFor('day',new Date('2026-11-05T12:00:00Z'),'UTC');
 assert.deepEqual(period.span,span);
 const calendar=dayCapacity('2026-11-05','UTC',records,[]);
 const progress=effortSummary(records,period,'UTC','2026-11-06T00:00:00Z');
 assert.equal(calendar.logged,50);
 assert.equal(progress.displayMinutes,50);
 assert.equal(progress.displayMinutes,calendar.logged);
 assert.equal(progress.parts.reduce((sum,p)=>sum+p.minutes,0),50);
 
 // App RLS cannot see any other owner, even if that owner used MCP.
 await as(other);
 assert.deepEqual(await readEntries(),[]);
 await role('service_role');
 const foreign=success(await mcp(other,'claude',env('study_entries','create',{
  patch:{source:'manual',intent:'Private proof'}
 })));
 await as(other);
 assert.deepEqual((await readEntries()).map(x=>x.id),[foreign.id]);
 await as(owner);
 assert.equal((await readEntries()).length,2);
 assert.equal((await q('select count(*)::int n from public.study_entries where id=$1',[foreign.id]))[0].n,0);
 
 // The real journal records owner and source of the connector write.
 await role(null);
 const audit=(await q('select user_id,source,tool from public.actions where user_id=$1 order by no desc limit 1',[owner]))[0];
 assert.equal(audit.user_id,owner);
 assert.equal(audit.source,'chatgpt');
 assert.equal(audit.tool,'study');
 console.log('PASS N35.1 owner-scoped app/MCP parity, stale version and Calendar/Progress totals');
} finally { await db.close(); }
