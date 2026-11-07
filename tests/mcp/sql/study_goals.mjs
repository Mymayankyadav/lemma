// N45.1: full-migration PGlite acceptance of study goals schema and secure create.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
let serial=0;
const make=(patch,extras={})=>({
  operationId:'ba5e0000-1111-4111-8111-'+String(++serial).padStart(12,'0'),
  schemaVersion:1,resource:'study_goals',operation:'create',patch,...extras,
});
const call=async input=>(await q('select public.study_goals_command($1::jsonb) value',
  [JSON.stringify(input)]))[0].value;
const as=async id=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
const admin=async()=>{
  await db.exec('reset role');
  await q("select set_config('test.uid','',false)");
};
const rejects=async(p,re)=>assert.rejects(call(p),re);
try{
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
  const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
  assert.ok(names.includes('20261107230000_study_goals_create.sql'));
  for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
  await q('insert into auth.users(id) values($1),($2)',[owner,other]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [owner,'1'.repeat(48)]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [other,'2'.repeat(48)]);
  const subject1='33333333-3333-3333-3333-333333333333';
  const project1='44444444-4444-4444-4444-444444444444';
  const subject2='55555555-5555-5555-5555-555555555555';
  // The action journal forbids writing two owners in a single SQL statement.
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','∑','amber')",
    [subject1,owner]);
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Other','O','cyan')",
    [subject2,other]);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Proofs','Learn theorems')",
    [project1,owner,subject1]);
  const tablePriv=(await q(`select
    has_table_privilege('authenticated','public.study_goals','SELECT') read,
    has_table_privilege('authenticated','public.study_goals','INSERT') can_insert,
    has_table_privilege('authenticated','public.study_goals','UPDATE') can_update,
    has_table_privilege('authenticated','public.study_goals','DELETE') del,
    has_function_privilege('anon','public.study_goals_command(jsonb)','EXECUTE') anon,
    has_function_privilege('authenticated','public.study_goals_command(jsonb)','EXECUTE') owner`))[0];
  assert.equal(tablePriv.read,true);
  assert.equal(tablePriv.anon,false);assert.equal(tablePriv.owner,true);
  // Default table grants may expose write privileges; RLS alone must still
  // prevent direct unaudited owner DML without going through the command.
  await db.exec('set role anon');
  await rejects(make({period:'week'}),/permission denied|Authentication required/i);
  await as(owner);
  await assert.rejects(q("insert into public.study_goals(period,start_date,end_date,time_zone,target_minutes) values('week','2026-11-02','2026-11-08','Asia/Kolkata',240)"),/permission denied|row-level security/i);
  const data={period:'week',start_date:'2026-11-02',end_date:'2026-11-08',
    time_zone:'Asia/Kolkata',target_minutes:240,subject_id:subject1,project_id:project1};
  const firstReq=make(data);
  const first=await call(firstReq);
  assert.equal(first.status,'ok');assert.ok(first.actionNo>0);
  assert.equal(first.changed[0].version,1);
  const id=first.changed[0].id;
  const visible=(await q('select * from public.study_goals where id=$1',[id]))[0];
  assert.equal(visible.user_id,owner);assert.equal(visible.target_minutes,240);
  assert.equal(visible.source,'app');assert.equal(visible.archived_at,null);
  // A real existing row must remain unchanged under an authenticated direct
  // UPDATE: Supabase may grant table UPDATE, but no write RLS policy exists.
  // A deployment may grant table UPDATE by default (RLS then hides rows),
  // or not grant it at all (permission denied). Both must block direct writes.
  let directUpdate=[];
  try {
    directUpdate=await q("update public.study_goals set target_minutes=7 returning id");
  } catch (error) {
    assert.match(String(error),/permission denied|row-level security/i);
  }
  assert.deepEqual(directUpdate,[],'no unaudited owner UPDATE is permitted');
  assert.equal((await q('select target_minutes from public.study_goals where id=$1',[id]))[0].target_minutes,240);
  assert.ok(visible.created_at&&visible.updated_at);
  const actions=(await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n;
  assert.deepEqual(await call(firstReq),first,'idempotent create returns exact receipt');
  assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,actions);
  const conflict=await call({...firstReq,patch:{...data,target_minutes:250}});
  assert.equal(conflict.status,'conflict','same id with different payload fails');
  assert.equal(conflict.actionNo,null);
  // Authenticated callers can set arbitrary custom GUCs before invoking
  // SECURITY DEFINER RPCs. Neither persisted row nor action receipt may
  // claim worker/MCP provenance as a result.
  for(const [spoofSource,startDate,endDate] of [
    ['worker','2027-02-01','2027-02-07'],
    ['mcp','2027-03-01','2027-03-07'],
  ]){
    await q("select set_config('lemma.source',$1,false)",[spoofSource]);
    await q("select set_config('lemma.tool','forged-mcp-tool',false)");
    await q("select set_config('lemma.summary','FORGED WORKER SUMMARY',false)");
    const request=make({...data,start_date:startDate,end_date:endDate});
    const result=await call(request);
    assert.equal(result.status,'ok','spoofed session GUC cannot abort valid create');
    const row=(await q('select source from public.study_goals where id=$1',
      [result.changed[0].id]))[0];
    assert.equal(row.source,'app','goal provenance cannot be forged by user GUC');
    const action=(await q('select source,tool,summary from public.actions where no=$1',
      [result.actionNo]))[0];
    assert.equal(action.source,'app','journal provenance cannot be forged by user GUC');
    assert.equal(action.tool,null,'journal tool cannot be forged by user GUC');
    assert.ok(!String(action.summary).includes('FORGED WORKER SUMMARY'),
      'journal summary must describe the audited database mutation');
  }
  await q("select set_config('lemma.source','',false)");
  await q("select set_config('lemma.tool','',false)");
  await q("select set_config('lemma.summary','',false)");
  await rejects(make({...data,start_date:'2026-11-08',end_date:'2026-11-15'}),
    /Overlapping active goal/);
  const adjacent=await call(make({...data,start_date:'2026-11-09',end_date:'2026-11-15'}));
  assert.equal(adjacent.status,'ok','adjacent nonoverlapping civil dates work');
  const otherPeriod=await call(make({...data,period:'month'}));
  assert.equal(otherPeriod.status,'ok','different periods can overlap');
  // Keep invalid field probes outside existing goal windows: otherwise the
  // overlap BEFORE trigger correctly fails before field CHECK constraints.
  const invalidDates={...data,start_date:'2027-01-04',end_date:'2027-01-10'};
  await rejects(make({...invalidDates,subject_id:subject2}),/constraint|violates/i);
  await rejects(make({...invalidDates,target_minutes:0}),/constraint|violates/i);
  await rejects(make({...invalidDates,target_minutes:100001}),/constraint|violates/i);
  await rejects(make({...invalidDates,target_minutes:1.5}),/whole minutes/i);
  await rejects(make({...invalidDates,start_date:'2026-2-2'}),/YYYY-MM-DD/i);
  await rejects(make({...invalidDates,end_date:'2026-11-01'}),/constraint|violates/i);
  await rejects(make({...invalidDates,time_zone:'Not/AZone'}),/constraint|violates/i);
  await rejects(make({...data,user_id:other}),/Unknown study goal patch field/);
  await rejects(make({...data}, {expectedVersion:2}),/expectedVersion/i);
  await rejects(make({...data}, {operation:'update'}),/Unsupported study goal/i);
  await as(other);
  assert.deepEqual(await q('select id from public.study_goals where id=$1',[id]),[],
    'RLS must hide another owner');
  const otherRow=await call(make({...data,subject_id:subject2,project_id:null}));
  assert.equal(otherRow.status,'ok','another owner can use the same dates');
  await as(owner);
  assert.deepEqual(await q('select id from public.study_goals where id=$1',
    [otherRow.changed[0].id]),[]);
  // N45 full lifecycle: owner-version conflict, overlap-safe restore, undo
  // and generic service-role MCP are delivered in this one migration.
  const envelope=(operation,patch={},target=null,version=null)=>({
    ...make(patch),operation,
    ...(target?{target:{id:target}}:{}),
    ...(version!==null?{expectedVersion:version}:{})
  });
  const updateReq=envelope('update',{target_minutes:300},id,1);
  const updated=await call(updateReq);
  assert.equal(updated.status,'ok');
  assert.equal(updated.changed[0].version,2);
  assert.equal((await q('select target_minutes from public.study_goals where id=$1',[id]))[0].target_minutes,300);
  assert.deepEqual(await call(updateReq),updated);
  assert.equal((await call({...updateReq,patch:{target_minutes:301}})).status,'conflict');
  const stale=await call(envelope('update',{target_minutes:310},id,1));
  assert.equal(stale.status,'conflict');assert.equal(stale.conflict.currentVersion,2);
  const archived=await call(envelope('archive',{},id,2));
  assert.equal(archived.status,'ok');assert.equal(archived.changed[0].version,3);
  assert.ok((await q('select archived_at from public.study_goals where id=$1',[id]))[0].archived_at);
  await rejects(envelope('update',{target_minutes:320},id,3),/archived goal/);
  await rejects(envelope('archive',{},id,3),/already archived/);
  // An archived period can be occupied by another active goal with the same
  // exact scope. Restoring must recheck the complete overlap constraint.
  const blocker=await call(envelope('create',{
    ...data,start_date:'2026-11-04',end_date:'2026-11-05'}));
  assert.equal(blocker.status,'ok');
  await rejects(envelope('restore',{},id,3),/Overlapping active goal/);
  assert.ok((await q('select archived_at from public.study_goals where id=$1',[id]))[0].archived_at);
  const deletedBlocker=await call(envelope('delete',{},blocker.changed[0].id,1));
  assert.equal(deletedBlocker.status,'ok');
  const restored=await call(envelope('restore',{},id,3));
  assert.equal(restored.status,'ok');assert.equal(restored.changed[0].version,4);
  assert.equal((await q('select archived_at from public.study_goals where id=$1',[id]))[0].archived_at,null);
  const deleteRequest=envelope('delete',{},id,4);
  const deleted=await call(deleteRequest);
  assert.equal(deleted.status,'ok');
  assert.equal((await q('select count(*)::int n from public.study_goals where id=$1',[id]))[0].n,0);
  assert.deepEqual(await call(deleteRequest),deleted,'physical delete must remain idempotent');
  const deletedUndo=(await q('select public.undo_action($1,$2,false) result',
   [owner,deleted.actionNo]))[0].result;
  assert.equal(deletedUndo.undone,deleted.actionNo);
  assert.equal((await q('select version from public.study_goals where id=$1',[id]))[0].version,4);
  // Undoing a versioned update must restore the old version exactly; the
  // overlap trigger must not increment versions on the generic inverse.
  const undoCreate=await call(envelope('create',{
   ...data,start_date:'2028-01-01',end_date:'2028-01-07',
   target_minutes:15}));
  const undoId=undoCreate.changed[0].id;
  const undoUpdate=await call(envelope('update',{target_minutes:20},undoId,1));
  assert.equal(undoUpdate.changed[0].version,2);
  const inverse=(await q('select public.undo_action($1,$2,false) result',
   [owner,undoUpdate.actionNo]))[0].result;
  assert.equal(inverse.undone,undoUpdate.actionNo);
  const restoredOriginal=(await q('select target_minutes,version from public.study_goals where id=$1',
   [undoId]))[0];
  assert.equal(restoredOriginal.target_minutes,15);
  assert.equal(restoredOriginal.version,1);
  await as(other);
  await rejects(envelope('update',{target_minutes:999},id,4),/not found for owner/);
  await rejects(envelope('delete',{},id,4),/not found for owner/);
  await as(owner);
  assert.deepEqual(await q('select id from public.study_goals where user_id=$1',[other]),[]);
  // The app cannot claim MCP provenance through arbitrary set_config GUCs.
  await q("select set_config('lemma.source','worker',false)");
  const hardened=await call(envelope('update',{target_minutes:25},undoId,1));
  assert.equal(hardened.status,'ok');
  assert.equal(hardened.goal.source,'app');
  await q("select set_config('lemma.source','',false)");
  await admin();
  await db.exec('set role service_role');
  const mcpInput=envelope('create',{
   ...data,start_date:'2029-01-01',end_date:'2029-01-07'});
  const mcp=(await q("select public.mcp_command($1::uuid,'chatgpt',$2::jsonb) receipt",
    [owner,JSON.stringify(mcpInput)]))[0].receipt;
  assert.equal(mcp.status,'ok');
  assert.ok(mcp.actionNo);
  await admin();
  assert.equal((await q('select source from public.study_goals where id=$1',
    [mcp.changed[0].id]))[0].source,'mcp');
  assert.equal((await q('select source from public.actions where no=$1',
    [mcp.actionNo]))[0].source,'chatgpt');
  assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='study_goals'"))[0].n,1);
  assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='study_goals'"))[0].n,1);
  await admin();
  assert.equal((await q('select count(*)::int n from public.study_goals'))[0].n,8,
    'includes two independent forged-GUC regression inserts');
  const docs=JSON.parse(await readFile(
    new URL('../../../docs/v6/capability-registry/study_goals.json',import.meta.url),'utf8'));
  const fields=(await q("select attname from pg_attribute where attrelid='public.study_goals'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname);
  assert.deepEqual(Object.keys(docs.columns).sort(),fields.sort(),
    'capability registry exactly covers SQL columns');
  for(const field of fields){
    assert.ok(docs.columns[field].classification);
    for(const prop of ['appPath','mcpPath','exportPolicy','deletionPolicy'])
      assert.ok(docs.columns[field][prop]);
  }
  console.log('PASS N45 create/update/archive/restore/delete, exact undo, MCP, RLS, conflict, overlap and registry');
}finally{await db.close()}
