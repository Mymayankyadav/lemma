// N109: complete migration chain in PGlite; no remote owner or production writes.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const as=async uid=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[uid??'']);
 if(uid)await db.exec('set role authenticated');
};
const command=(operation,patch={},target={},expectedVersion,operationId=randomUUID(),resource='study_entries')=>({
 schemaVersion:1,resource,operation,operationId,patch,target,
 ...(expectedVersion===undefined?{}:{expectedVersion}),
});
const mcp=async (p,uid=owner)=>(await q(
 'select public.mcp_study_command($1::uuid,$2::text,$3::jsonb) result',
 [uid,'chatgpt',JSON.stringify(p)]))[0].result;
const ok=r=>{assert.equal(r.status,'ok',JSON.stringify(r));assert.ok(r.actionNo>0);return r};
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid) $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(files.includes('20261208100000_n109_mcp_study_links.sql'));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 const registry=await q("select resource,\"schema\" from public.lemma_command_resources where resource in ('study_entries','calendar_blocks') order by resource");
 const study=registry.find(x=>x.resource==='study_entries').schema;
 const blocks=registry.find(x=>x.resource==='calendar_blocks').schema;
 for(const value of ['calendar_block_id','preset_id','energy'])
  assert(study.fields.includes(value),value+' not in MCP study registry');
 for(const op of ['take_lease','next_phase','exclude_minutes'])
  assert(study.operations.includes(op),op+' not in MCP study operations');
 assert(blocks.fields.includes('task_id'),'MCP calendar block task link missing');
 const manifest=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/lemma_command_resources.json',import.meta.url),'utf8'));
 for(const row of registry)assert.deepEqual(row.schema,manifest.resources.find(x=>x.resource===row.resource).schema);
 await as(null);
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'b'.repeat(48)]);
 const studyBlock=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'study','Owner study','2020-11-01T09:00:00Z','2020-11-01T10:00:00Z','UTC') returning id",[owner]))[0].id;
 const busyBlock=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'busy','Owner busy','2020-11-01T10:00:00Z','2020-11-01T11:00:00Z','UTC') returning id",[owner]))[0].id;
 const foreignBlock=(await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'study','Other study','2020-11-01T09:00:00Z','2020-11-01T10:00:00Z','UTC') returning id",[other]))[0].id;
 const preset=(await q("insert into public.presets(user_id,label,mode,focus_minutes) values($1,'Owner sprint','pomodoro',35) returning id",[owner]))[0].id;
 const archived=(await q("insert into public.presets(user_id,label,archived_at) values($1,'Archived sprint',now()) returning id",[owner]))[0].id;
 const foreignPreset=(await q("insert into public.presets(user_id,label) values($1,'Private preset') returning id",[other]))[0].id;
 await db.exec('set role service_role');
 const create=command('create',{source:'timer',intent:'Linked study draft',
  calendar_block_id:studyBlock,preset_id:preset});
 const made=ok(await mcp(create));
 const entry=made.changed[0].id;
 assert.deepEqual(await mcp(create),made,'MCP exact draft create replay');
 await as(null);
 const draft=(await q('select calendar_block_id,preset_id,status,version from public.study_entries where id=$1',[entry]))[0];
 assert.deepEqual(draft,{calendar_block_id:studyBlock,preset_id:preset,status:'draft',version:1});
 await db.exec('set role service_role');
 const rejects=[
  {source:'timer',calendar_block_id:foreignBlock},
  {source:'timer',calendar_block_id:busyBlock},
  {source:'timer',preset_id:foreignPreset},
  {source:'timer',preset_id:archived},
 ];
 for(const patch of rejects)
  await assert.rejects(mcp(command('create',patch)),/owned study block|owned and active/i);
 await as(null);
 assert.equal((await q('select count(*)::integer n from public.study_entries where user_id=$1',[owner]))[0].n,1,
  'A rejected foreign/non-study/archived link leaked a draft');
 await db.exec('set role service_role');
 const start=ok(await mcp(command('start',{}, {id:entry},draft.version)));
 assert.equal(start.changed[0].version,2);
 await as(null);
 const after=(await q('select mode,preset_id,config,calendar_block_id from public.study_entries where id=$1',[entry]))[0];
 assert.equal(after.mode,'pomodoro');
 assert.equal(after.config.focus_minutes,35,'N52 must capture linked preset at start');
 assert.equal(after.calendar_block_id,studyBlock);
 const task=(await q("insert into public.tasks(user_id,title) values($1,'Block task') returning id",[owner]))[0].id;
 await db.exec('set role service_role');
 const blockMade=ok(await mcp(command('create',{
  kind:'study',title:'Task linked block',task_id:task,
  starts_at:'2020-11-01T11:00:00Z',ends_at:'2020-11-01T12:00:00Z',time_zone:'UTC'
 },{},undefined,randomUUID(),'calendar_blocks')));
 await as(null);
 assert.equal((await q('select task_id from public.calendar_blocks where id=$1',[blockMade.changed[0].id]))[0].task_id,task);
 await db.exec('set role service_role');
 const undoCandidate=ok(await mcp(command('create',{source:'timer',intent:'Undo MCP link',
  calendar_block_id:studyBlock,preset_id:preset})));
 await as(owner);
 await q('select public.undo_action($1::uuid,$2::bigint,false)',[owner,undoCandidate.actionNo]);
 assert.equal((await q('select count(*)::integer n from public.study_entries where id=$1',
  [undoCandidate.changed[0].id]))[0].n,0,'MCP linked create not undone');
 await as(other);
 assert.equal((await q('select count(*)::integer n from public.study_entries where id=$1',[entry]))[0].n,0,
  'Foreign app owner could read linked study entry');
 await db.exec('reset role');
 console.log('PASS N109 MCP calendar/preset links, archived/foreign refusal, start snapshot, replay, registry and undo');
} finally {
 await db.close();
}
