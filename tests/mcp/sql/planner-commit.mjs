// N107: full-migration PGlite proof of single-action planner placement commits.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(s,p=[])=>(await db.query(s,p)).rows;
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
let serial=0;
const command=days=>({schemaVersion:1,resource:'day_plans',operation:'commit_placements',
 operationId:'aaaa1111-1111-4111-8111-'+String(++serial).padStart(12,'0'),
 patch:{days}});
const call=async input=>(await q('select public.day_plans_command($1::jsonb) result',
 [JSON.stringify(input)]))[0].result;
const admin=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
const as=async who=>{await admin();await q("select set_config('test.uid',$1,false)",[who]);
 await db.exec('set role authenticated')};
const count=async table=>(await q('select count(*)::int n from public.'+table+
 ' where user_id=$1',[a]))[0].n;
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $auth$ "+
  "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
  "nullif(current_setting('test.uid',true),'')::uuid) $auth$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as "+
  "$bytes$select decode(repeat('00',n),'hex')$bytes$;"+
  "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(names.includes('20261123120000_day_plans_atomic_placements.sql'));
 for(const file of names)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[a,b]);
 for(const [who,secret] of [[a,'a'.repeat(48)],[b,'b'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[who,secret]);
 const task=(await q("insert into public.tasks(user_id,title) values($1,'Proof') returning id,version",[a]))[0];
 const extra=(await q("insert into public.tasks(user_id,title) values($1,'Extra') returning id,version",[a]))[0];
 const foreign=(await q("insert into public.tasks(user_id,title) values($1,'Foreign') returning id,version",[b]))[0];
 const busy=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone,status) values($1,'busy','Meeting','2028-01-10T12:00:00Z','2028-01-10T13:00:00Z','UTC','planned') returning id,version",[a]))[0];
 const focus=(await q("insert into public.study_entries(user_id,source,status,intent,saved_at) values($1,'manual','saved','Focus',now()) returning id,version",[a]))[0];
 await q("insert into public.study_intervals(user_id,entry_id,kind,started_at,ended_at) values($1,$2,'focus','2028-01-10T13:00:00Z','2028-01-10T14:00:00Z')",[a,focus.id]);
 const sources=()=>[
  {resource:'tasks',id:task.id,version:task.version},
  {resource:'tasks',id:extra.id,version:extra.version},
  {resource:'calendar_blocks',id:busy.id,version:busy.version},
  {resource:'study_entries',id:focus.id,version:focus.version}
 ];
 const day=(date,start)=>({plan_date:date,time_zone:'UTC',intention:'Two-day study',
  capacity_minutes:120,sources:sources(),
  placements:[{task_id:task.id,title:'Study',starts_at:start,
   ends_at:new Date(Date.parse(start)+3600000).toISOString(),position:0}],
  unplaced:[{task_id:extra.id,reason:'No room',position:1}]});
 const fixture=[day('2028-01-10','2028-01-10T08:00:00Z'),
  day('2028-01-11','2028-01-11T08:00:00Z')];
 await as(a);
 const request=command(fixture),received=await call(request);
 assert.equal(received.status,'ok');assert.equal(received.plans.length,2);
 assert.equal(received.blockIds.length,2);
 assert.deepEqual(received.changed.map(c=>c.resource).sort(),[
  'calendar_blocks','calendar_blocks','day_plan_items','day_plan_items',
  'day_plan_items','day_plan_items','day_plans','day_plans'].sort());
 assert.ok(received.actionNo>0);
 assert.deepEqual(await call(request),received,'exact replay changed receipt');
 const changed=await call({...request,patch:{days:[
  {...fixture[0],intention:'Different'},fixture[1]]}});
 assert.equal(changed.status,'conflict','changed payload retried');
 assert.equal(await count('day_plans'),2);
 assert.equal(await count('day_plan_items'),4);
 assert.equal(await count('calendar_blocks'),3);
 const reverted=(await q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [a,received.actionNo]))[0].result;
 assert.equal(Number(reverted.undone),Number(received.actionNo));
 assert.equal(await count('day_plans'),0);
 assert.equal(await count('day_plan_items'),0);
 assert.equal(await count('calendar_blocks'),1,'undo removed unrelated busy block');
 const totals=async()=>[await count('day_plans'),await count('day_plan_items'),
  await count('calendar_blocks')];
 const before=await totals();
 for(const kind of ['tasks','calendar_blocks','study_entries']){
  const days=structuredClone(fixture);
  days.forEach(d=>{d.sources.find(x=>x.resource===kind).version++});
  const refused=await call(command(days));
  assert.equal(refused.status,'conflict','stale '+kind+' source accepted');
  assert.equal(refused.actionNo,null);
  assert.deepEqual(await totals(),before,'stale '+kind+' made partial writes');
 }
 const overlap=structuredClone(fixture);
 overlap[0].placements[0].starts_at='2028-01-10T12:15:00Z';
 overlap[0].placements[0].ends_at='2028-01-10T12:30:00Z';
 assert.equal((await call(command(overlap))).status,'conflict',
  'calendar collision accepted');
 assert.deepEqual(await totals(),before);
 const ownerSwap=structuredClone(fixture);
 ownerSwap[0].sources[0]={resource:'tasks',id:foreign.id,version:foreign.version};
 assert.equal((await call(command(ownerSwap))).status,'conflict',
  'foreign task snapshot accepted');
 await as(b);
 assert.equal((await call(command(fixture))).status,'conflict',
  'foreign owner replayed another owner source snapshot');
 assert.equal((await q('select count(*)::int n from public.day_plans'))[0].n,0);
 await admin();
 await db.exec('set role service_role');
 const mcpCommand=command([day('2028-01-12','2028-01-12T08:00:00Z')]);
 const viaMcp=(await q("select public.mcp_command($1::uuid,'chatgpt',$2::jsonb) result",
  [a,JSON.stringify(mcpCommand)]))[0].result;
 assert.equal(viaMcp.status,'ok','MCP owner dispatcher refused batch');
 await admin();
 assert.equal((await q('select source from public.actions where no=$1',
  [viaMcp.actionNo]))[0].source,'chatgpt');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='day_plans' and \"schema\"->'operations' ? 'commit_placements'"))[0].n,1);

 // The single undo must refuse if a later owner write edited a created block.
 const newBlockId=viaMcp.blockIds[0];
 assert.ok(newBlockId,'atomic MCP reply omitted the created block ID');
 await q("update public.calendar_blocks set title='Newer owner edit',version=version+1 where id=$1",
  [newBlockId]);
 await as(a);
 await assert.rejects(q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [a,viaMcp.actionNo]),/Undo [0-9]+ first/i,
  'newer owner change must block the original batch undo');
 await admin();
 assert.equal((await q('select title from public.calendar_blocks where id=$1',
  [newBlockId]))[0].title,'Newer owner edit');
 assert.equal((await q('select count(*)::int n from public.day_plans where id=$1',
  [viaMcp.plans[0].id]))[0].n,1,
  'failed undo must not partially delete the owner plan');

 console.log('PASS N107 two-day atomic owner/MCP planner, typed conflict, exact replay and whole undo');
}finally{await db.close()}
