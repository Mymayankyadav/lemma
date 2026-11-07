// N41.2.1: full-migration PGlite create/update/reorder command acceptance.
// N41.2.2 will test archive/restore/delete, registry, undo, and MCP parity.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
let sequence=0;
const request=(operation,patch={},extra={})=>({
  operationId:'feed0000-feed-4000-8000-'+String(++sequence).padStart(12,'0'),
  schemaVersion:1,resource:'presets',operation,patch,...extra,
});
const call=async p=>(await q('select public.presets_command($1::jsonb) value',[JSON.stringify(p)]))[0].value;
const as=async id=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
const admin=async()=>{
  await db.exec('reset role');
  await q("select set_config('test.uid','',false)");
};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $auth$
      select coalesce(
        nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
        nullif(current_setting('test.uid',true),'')::uuid)
    $auth$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql
      as $bytes$select decode(repeat('00',n),'hex')$bytes$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  const migrations=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
  assert.ok(migrations.includes('20261107060000_presets_command_core.sql'));
  for(const f of migrations)await db.exec(await readFile(new URL(f,dir),'utf8'));
  await q('insert into auth.users(id) values($1),($2)',[owner,other]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [owner,'1'.repeat(48)]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [other,'2'.repeat(48)]);
  const otherSubject='33333333-3333-3333-3333-333333333333';
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Biology','B','lime')",
    [otherSubject,other]);

  const perms=(await q(`select
    has_function_privilege('anon','public.presets_command(jsonb)','execute') anon,
    has_function_privilege('authenticated','public.presets_command(jsonb)','execute') member`))[0];
  assert.equal(perms.anon,false);
  assert.equal(perms.member,true);
  await db.exec('set role anon');
  await assert.rejects(call(request('create',{label:'Anon'})),/permission denied|Authentication required/);
  await as(owner);

  const create=request('create',{label:'Math',mode:'pomodoro',focus_minutes:25,
    break_minutes:5,long_break_minutes:15,cycles:4,position:0});
  const result=await call(create);
  assert.equal(result.status,'ok');
  assert.ok(Number.isSafeInteger(result.actionNo)&&result.actionNo>0);
  assert.equal(result.changed[0].version,1);
  const id=result.changed[0].id;
  const row=(await q('select * from public.presets where id=$1',[id]))[0];
  assert.equal(row.user_id,owner);
  assert.equal(row.label,'Math');
  assert.equal(row.source,'app');

  const receiptCount=(await q('select count(*)::int n from public.command_receipts'))[0].n;
  const actionCount=(await q('select count(*)::int n from public.actions'))[0].n;
  assert.deepEqual(await call(create),result,'same operationId and payload reuses exact receipt');
  assert.equal((await q('select count(*)::int n from public.command_receipts'))[0].n,receiptCount);
  assert.equal((await q('select count(*)::int n from public.actions'))[0].n,actionCount,
    'retry must not journal another write');
  const reused=await call({...create,patch:{label:'Different'}});
  assert.equal(reused.status,'conflict','changed-payload operationId cannot be reused');
  assert.equal(reused.actionNo,null);

  const stale=await call(request('update',{label:'Old'},{
    target:{id},expectedVersion:55}));
  assert.equal(stale.status,'conflict');
  assert.equal(stale.conflict.currentVersion,1);
  assert.equal((await q('select version from public.presets where id=$1',[id]))[0].version,1);

  const update=await call(request('update',{label:'Math revised',focus_minutes:480},{
    target:{id},expectedVersion:1}));
  assert.equal(update.status,'ok');
  assert.equal(update.changed[0].version,2);
  assert.equal((await q('select focus_minutes from public.presets where id=$1',[id]))[0].focus_minutes,480);
  const reordered=await call(request('reorder',{position:7},{
    target:{id},expectedVersion:2}));
  assert.equal(reordered.status,'ok');
  assert.equal(reordered.changed[0].version,3);
  assert.equal((await q('select position from public.presets where id=$1',[id]))[0].position,7);
  await assert.rejects(call(request('reorder',{position:-1},{
    target:{id},expectedVersion:3})),/constraint|violates/i);
  await assert.rejects(call(request('update',{position:2},{
    target:{id},expectedVersion:3})),/Unknown preset patch field/);
  await assert.rejects(call(request('update',{user_id:other},{
    target:{id},expectedVersion:3})),/Unknown preset patch field/);
  await assert.rejects(call(request('create',{label:'Bad',subject_id:otherSubject})),
    /constraint|violates/i);
  await assert.rejects(call(request('archive',{},{
    target:{id},expectedVersion:3})),/Unsupported preset operation/,
    'archive/restore/delete intentionally finish in N41.2.2');

  await as(other);
  const second=await call(request('create',{label:'Other owner'}));
  assert.equal(second.status,'ok');
  const otherId=second.changed[0].id;
  await assert.rejects(call(request('update',{label:'Stolen'},{
    target:{id},expectedVersion:3})),/Preset not found/);
  assert.deepEqual(await q('select id from public.presets where id=$1',[id]),[],
    'RLS must hide first owner');
  await as(owner);
  await assert.rejects(call(request('reorder',{position:9},{
    target:{id:otherId},expectedVersion:1})),/Preset not found/);
  assert.deepEqual(await q('select id from public.presets where id=$1',[otherId]),[]);
  await admin();
  const owned=await q('select id,user_id,label,version,position from public.presets order by user_id');
  assert.equal(owned.length,2);
  assert.deepEqual(owned.map(v=>[v.user_id,v.label,v.version,v.position]),
    [[owner,'Math revised',3,7],[other,'Other owner',1,0]]);
  const registered=(await q("select count(*)::int n from public.lemma_command_resources where resource='presets'"))[0].n;
  assert.equal(registered,0,'registry activation belongs to N41.2.2, preserving N41.1 historical assertions');

  // N41.2.2.1: delete is versioned, owner-scoped, journaled and retry-safe.
  await as(owner);
  const spare=await call(request('create',{label:'Temporary preset'}));
  const spareId=spare.changed[0].id;
  const staleDelete=await call(request('delete',{},{
    target:{id:spareId},expectedVersion:88}));
  assert.equal(staleDelete.status,'conflict');
  assert.equal((await q('select count(*)::int n from public.presets where id=$1',
    [spareId]))[0].n,1);
  await assert.rejects(call(request('delete',{label:'not allowed'},{
    target:{id:spareId},expectedVersion:1})),/Unknown preset patch field/);
  const deletion=request('delete',{},{
    target:{id:spareId},expectedVersion:1});
  const deleted=await call(deletion);
  assert.equal(deleted.status,'ok');
  assert.equal(deleted.changed[0].id,spareId);
  assert.equal(deleted.changed[0].deleted,true);
  assert.equal((await q('select count(*)::int n from public.presets where id=$1',
    [spareId]))[0].n,0);
  assert.deepEqual(await call(deletion),deleted,'deletion receipt must be replay-safe');
  const deletionChange=await q(
    "select count(*)::int n from public.action_changes where table_name='presets' and row_pk->>'id'=$1",
    [spareId]);
  assert.equal(deletionChange[0].n,2,'create and delete each journal one change');

  // Future N52 adds study_entries.preset_id. Simulate its persisted link now:
  // delete must archive, without rewriting the saved study-entry reference.
  await admin();
  await db.exec('alter table public.study_entries add column if not exists preset_id uuid');
  await q("insert into public.study_entries(user_id,source,status,preset_id) values($1,'manual','saved',$2)",
    [owner,id]);
  await as(owner);
  const referencedDelete=request('delete',{},{
    target:{id},expectedVersion:3});
  const archived=await call(referencedDelete);
  assert.equal(archived.status,'ok');
  assert.equal(archived.changed[0].version,4);
  const stillHere=(await q('select archived_at,version,source from public.presets where id=$1',[id]))[0];
  assert.ok(stillHere.archived_at,'referenced delete archives instead of erasing');
  assert.equal(stillHere.version,4);
  assert.equal(stillHere.source,'app');
  assert.equal((await q('select count(*)::int n from public.study_entries where preset_id=$1',
    [id]))[0].n,1,'historical reference must remain');
  assert.deepEqual(await call(referencedDelete),archived,'archive fallback replays receipt');
  await assert.rejects(call(request('delete',{},{
    target:{id},expectedVersion:4})),/already archived/);
  await as(other);
  await assert.rejects(call(request('delete',{},{
    target:{id},expectedVersion:4})),/Preset not found/);
  await admin();
  assert.equal((await q('select count(*)::int n from public.presets where id=$1',[id]))[0].n,1);
  console.log('PASS N41.2.1 create/update/reorder, receipts, retry, versions, validation and owner isolation');
} finally {await db.close();}
