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
  assert.ok(names.includes('20261107110000_study_goals_create.sql'));
  for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
  await q('insert into auth.users(id) values($1),($2)',[owner,other]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [owner,'1'.repeat(48)]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [other,'2'.repeat(48)]);
  const subject1='33333333-3333-3333-3333-333333333333';
  const project1='44444444-4444-4444-4444-444444444444';
  const subject2='55555555-5555-5555-5555-555555555555';
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','∑','amber'),($3,$4,'Other','O','cyan')",
    [subject1,owner,subject2,other]);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Proofs','Learn theorems')",
    [project1,owner,subject1]);
  const tablePriv=(await q(`select
    has_table_privilege('authenticated','public.study_goals','SELECT') read,
    has_table_privilege('authenticated','public.study_goals','INSERT') insert,
    has_table_privilege('authenticated','public.study_goals','UPDATE') update,
    has_table_privilege('authenticated','public.study_goals','DELETE') del,
    has_function_privilege('anon','public.study_goals_command(jsonb)','EXECUTE') anon,
    has_function_privilege('authenticated','public.study_goals_command(jsonb)','EXECUTE') owner`))[0];
  assert.equal(tablePriv.read,true);assert.equal(tablePriv.insert,false);
  assert.equal(tablePriv.update,false);assert.equal(tablePriv.del,false);
  assert.equal(tablePriv.anon,false);assert.equal(tablePriv.owner,true);
  await db.exec('set role anon');
  await rejects(make({period:'week'}),/permission denied|Authentication required/i);
  await as(owner);
  await assert.rejects(q("insert into public.study_goals(period,start_date,end_date,time_zone,target_minutes) values('week','2026-11-02','2026-11-08','Asia/Kolkata',240)"),/permission denied/i);
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
  assert.ok(visible.created_at&&visible.updated_at);
  const actions=(await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n;
  assert.deepEqual(await call(firstReq),first,'idempotent create returns exact receipt');
  assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,actions);
  const conflict=await call({...firstReq,patch:{...data,target_minutes:250}});
  assert.equal(conflict.status,'conflict','same id with different payload fails');
  assert.equal(conflict.actionNo,null);
  await rejects(make({...data,start_date:'2026-11-08',end_date:'2026-11-15'}),
    /Overlapping active goal/);
  const adjacent=await call(make({...data,start_date:'2026-11-09',end_date:'2026-11-15'}));
  assert.equal(adjacent.status,'ok','adjacent nonoverlapping civil dates work');
  const otherPeriod=await call(make({...data,period:'month'}));
  assert.equal(otherPeriod.status,'ok','different periods can overlap');
  await rejects(make({...data,subject_id:subject2}),/constraint|violates/i);
  await rejects(make({...data,target_minutes:0}),/constraint|violates/i);
  await rejects(make({...data,target_minutes:100001}),/constraint|violates/i);
  await rejects(make({...data,target_minutes:1.5}),/whole minutes/i);
  await rejects(make({...data,start_date:'2026-2-2'}),/YYYY-MM-DD/i);
  await rejects(make({...data,end_date:'2026-11-01'}),/constraint|violates/i);
  await rejects(make({...data,time_zone:'Not/AZone'}),/constraint|violates/i);
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
  await admin();
  assert.equal((await q('select count(*)::int n from public.study_goals'))[0].n,4);
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
  console.log('PASS N45.1 secure create, owner RLS, overlap, receipt/retry, bounds and registry');
}finally{await db.close()}
