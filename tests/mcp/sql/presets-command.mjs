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
  assert.ok(migrations.includes('20261107120100_presets_reference_guard.sql'));
  assert.ok(migrations.includes('20261107120115_presets_lifecycle_preview.sql'));
  assert.ok(migrations.includes('20261107120120_presets_lifecycle_lock.sql'));
  assert.ok(!migrations.includes('20261107120105_presets_lifecycle_preview.sql'),
    'superseded unapplied lifecycle preview migration must not deploy');
  assert.ok(!migrations.includes('20261107210000_presets_reference_guard.sql'),
    'superseded unmerged version must not be redeployed out of order');
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
  // N41.2.2.2.1 previews archive/restore/delete without enabling writes.
  const auditBeforePreview=(await q("select count(*)::int n from public.action_changes where table_name='presets'"))[0].n;
  const preview=async p=>(await q('select public.lemma_preset_lifecycle_preview($1::jsonb) result',
    [JSON.stringify(p)]))[0].result;
  const locked=async p=>(await q('select public.lemma_preset_lifecycle_lock($1::jsonb) result',
    [JSON.stringify(p)]))[0].result;
  await as(owner);
  const deleteEnvelope=request('delete',{}, {target:{id},expectedVersion:3});
  const preReference=await preview(deleteEnvelope);
  assert.equal(preReference.status,'ok');
  assert.equal(preReference.currentVersion,3);
  assert.equal(preReference.effectiveOperation,'delete');
  assert.equal(preReference.referencesStudyEntries,false);
  assert.equal(preReference.archived,false);
  assert.deepEqual(await locked(deleteEnvelope),preReference,
    'row-locked preview must preserve the same owner and version decision');
  const upperOperation={...deleteEnvelope,operationId:deleteEnvelope.operationId.toUpperCase()};
  const upperPreview=await preview(upperOperation);
  const upperLocked=await locked(upperOperation);
  assert.deepEqual(upperLocked,upperPreview,
    'locked helper must canonicalize uppercase UUID operationId identically to preview');
  assert.equal(upperLocked.operationId,deleteEnvelope.operationId.toLowerCase());
  const upperConflict={...upperOperation,expectedVersion:2};
  assert.deepEqual(await locked(upperConflict),await preview(upperConflict),
    'even optimistic conflicts must canonicalize UUID operationId consistently');
  assert.equal((await locked(request('delete',{}, {target:{id},expectedVersion:2}))).status,'conflict',
    'stale version after a row lock may not advance');
  await assert.rejects(locked({...deleteEnvelope,patch:{label:'Tampered'}}),/Lifecycle patch/);
  await assert.rejects(locked({...deleteEnvelope,target:{id:otherId}}),/Preset not found/);
  assert.equal((await preview(request('archive',{}, {target:{id},expectedVersion:3}))).effectiveOperation,'archive');
  assert.equal((await preview(request('restore',{}, {target:{id},expectedVersion:3}))).effectiveOperation,'restore');
  const versionConflict=await preview(request('delete',{}, {target:{id},expectedVersion:2}));
  assert.equal(versionConflict.status,'conflict');
  assert.equal(versionConflict.currentVersion,3);
  await assert.rejects(preview({...deleteEnvelope,user_id:other}),/Unknown lifecycle envelope field/);
  await assert.rejects(preview({...deleteEnvelope,operation:'create'}),/Unsupported preset lifecycle/);
  await assert.rejects(preview({...deleteEnvelope,resource:'other'}),/Unsupported lifecycle resource/);
  await assert.rejects(preview({...deleteEnvelope,schemaVersion:2}),/schemaVersion/);
  await assert.rejects(preview({...deleteEnvelope,patch:{label:'Bypass'}}),/Lifecycle patch/);
  await assert.rejects(preview({...deleteEnvelope,expectedVersion:0}),/expectedVersion/);
  await assert.rejects(preview({...deleteEnvelope,expectedVersion:2147483648}),/exceeds int4/);
  await assert.rejects(preview({...deleteEnvelope,target:{id,user_id:other}}),/Unknown lifecycle target/);
  await assert.rejects(preview({...deleteEnvelope,target:{id:'not-a-uuid'}}),/uuid/i);
  await assert.rejects(preview({...deleteEnvelope,target:{id:otherId}}),/Preset not found/);
  await db.exec('set role anon');
  await assert.rejects(preview(deleteEnvelope),/permission denied|Authentication required/i);
  await admin();
  const registered=(await q("select count(*)::int n from public.lemma_command_resources where resource='presets'"))[0].n;
  assert.equal(registered,0,'registry activation belongs to N41.2.2, preserving N41.1 historical assertions');
 // N41.2.2.1: owner-bound reference detection, before and after N52's
 // optional preset_id column. All schema simulation is in memory only.
 await as(owner);
 const refQuery='select public.lemma_preset_has_entry_ref($1::uuid,$2::uuid) referenced';
 assert.equal((await q(refQuery,[owner,id]))[0].referenced,false);
 await assert.rejects(q(refQuery,[other,id]),/Not authorized/);
 await admin();
 await q('alter table public.study_entries add column preset_id uuid');
 await q("insert into public.study_entries(user_id,source,intent,preset_id) values($1,'manual','Preset reference fixture',$2)",
   [owner,id]);
 await as(owner);
 const afterReference=await preview(deleteEnvelope);
 assert.equal(afterReference.status,'ok');
 assert.equal(afterReference.effectiveOperation,'archive',
   'deleting a preset with historical entries must archive instead');
 assert.equal(afterReference.referencesStudyEntries,true);
 assert.equal((await locked(deleteEnvelope)).effectiveOperation,'archive',
   'locked decision must preserve a referenced preset instead of deleting history');
 assert.equal((await q(refQuery,[owner,id]))[0].referenced,true,
   'linked study entry requires archive instead of physical deletion');
 assert.equal((await q(refQuery,[owner,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']))[0].referenced,false);
 await as(other);
 await assert.rejects(q(refQuery,[owner,id]),/Not authorized/);
 assert.equal((await q(refQuery,[other,id]))[0].referenced,false);
 await assert.rejects(preview(deleteEnvelope),/Preset not found/,
   'lifecycle preview must not leak foreign owner preset details');
 await assert.rejects(locked(deleteEnvelope),/Preset not found/,
   'lifecycle row lock must not leak or lock foreign owner data');
 assert.equal((await preview(request('delete',{}, {target:{id:otherId},expectedVersion:1}))).effectiveOperation,'delete');
 await admin();
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='presets'"))[0].n,
   auditBeforePreview,'read-only lifecycle preview must not generate journal writes');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='presets'"))[0].n,
   0,'do not activate registry before scoped N41.2.2.2.2 and bug #1024');

  // Snapshot race regression: a STABLE preview retains the outer statement's
  // original snapshot even when a VOLATILE command advances a preset in the
  // same statement. The old lock helper called STABLE preview again after
  // FOR UPDATE and incorrectly returned status=ok/version=3. The fixed helper
  // must report the current locked tuple's version=4. This deterministic
  // PGlite case exercises the same stale-snapshot issue as a second session
  // committing while the row lock waits, without requiring a second PGlite
  // backend (PGlite intentionally supports only one backend connection).
  await as(owner);
  const competingUpdate=request('update',{label:'After old snapshot'},{
    target:{id},expectedVersion:3});
  const race=await q(`with advanced as materialized (
      select public.presets_command($1::jsonb) receipt
    )
    select advanced.receipt, public.lemma_preset_lifecycle_lock($2::jsonb) locked
      from advanced where advanced.receipt ->> 'status' = 'ok'`,
    [JSON.stringify(competingUpdate),JSON.stringify(deleteEnvelope)]);
  assert.equal(race.length,1,'the competing update must commit inside the statement');
  assert.equal(race[0].receipt.status,'ok');
  assert.equal(race[0].receipt.changed[0].version,4);
  assert.equal(race[0].locked.status,'conflict',
    'post-lock recheck cannot reuse the STABLE preview statement snapshot');
  assert.equal(race[0].locked.currentVersion,4,
    'post-lock check must use the tuple locked by SELECT FOR UPDATE');
  const afterRace=await locked({...deleteEnvelope,expectedVersion:4});
  assert.equal(afterRace.status,'ok');
  assert.equal(afterRace.currentVersion,4);
  assert.equal(afterRace.effectiveOperation,'archive',
    'a matching new version still preserves referenced study-entry history');
  await admin();
  assert.equal((await q("select count(*)::int n from public.presets where id=$1",[id]))[0].n,1);
  assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='presets'"))[0].n,0);

  console.log('PASS N41.2.1 create/update/reorder, receipts, retry, versions, validation and owner isolation');
} finally {await db.close();}
