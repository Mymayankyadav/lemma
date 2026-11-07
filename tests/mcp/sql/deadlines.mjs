// N42.1: full-migration PGlite for isolated owner deadlines schema.
// D8(b) command lifecycle, projections, undo and generic MCP are N42.2.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const reject=async(sql,args=[])=>assert.rejects(q(sql,args),
  /constraint|violates|permission denied|row.level security/i);
const add=async(user,kind,dueKind,dueDate,dueAt,more='')=>{
  return q('insert into public.deadlines(user_id,title,kind,due_kind,due_date,due_at'+
    (more?',remaining_minutes,estimate_source':'')+
    ') values($1,$2,$3,$4,$5,$6'+(more?',$7,$8':'')+') returning *',
    [user,'Math exam',kind,dueKind,dueDate,dueAt,
      ...(more?[30,'owner']:[])]);
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema extensions;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $auth$
    select coalesce(
     nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid)
   $auth$;
   create function extensions.gen_random_bytes(n int) returns bytea language sql as
     $bytes$select decode(repeat('00',n),'hex')$bytes$;
   grant usage on schema auth to authenticated;
   grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261107070000_deadlines_base.sql'));
 for(const migration of migrations)await db.exec(await readFile(new URL(migration,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [other,'2'.repeat(48)]);
 const originalCount=(await q('select count(*)::int n from public.deadlines'))[0].n;
 assert.equal(originalCount,0,'existing project/checkpoint targets must never be copied');

 const mine=(await add(owner,'exam','date','2026-11-30',null,'estimate'))[0];
 const theirs=(await add(other,'seminar','instant',null,'2026-12-01T15:30:00+05:30'))[0];
 assert.equal(mine.version,1);
 assert.equal(mine.status,'open');
 assert.equal(mine.source,'app');
 assert.equal(mine.estimate_source,'owner');
 assert.equal(mine.remaining_minutes,30);
 assert.equal(mine.due_at,null);
 assert.equal(theirs.due_date,null);
 assert.equal(theirs.user_id,other);
 assert.ok(mine.updated_at&&mine.created_at);
 assert.notEqual(mine.id,theirs.id);

 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date,due_at) values($1,$2,$3,$4,$5,$6)',
  [owner,'Both','exam','date','2026-11-30','2026-11-30T12:00:00Z']);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind) values($1,$2,$3,$4)',
  [owner,'Missing','exam','instant']);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [owner,' ','exam','date','2026-11-30']);
 for(const kind of ['invalid',null])
  await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
   [owner,'Bad kind',kind,'date','2026-11-30']);
 await reject('update public.deadlines set remaining_minutes=-1,estimate_source=$1 where id=$2',
  ['owner',mine.id]);
 await reject('update public.deadlines set remaining_minutes=20,estimate_source=null where id=$1',
  [mine.id]);
 await reject('update public.deadlines set remaining_minutes=null,estimate_source=$1 where id=$2',
  ['derived',mine.id]);
 await reject('update public.deadlines set estimate_source=$1 where id=$2',['fake',mine.id]);
 await reject('update public.deadlines set status=$1 where id=$2',['unknown',mine.id]);

 const otherSubject='33333333-3333-3333-3333-333333333333';
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Biology','B','lime')",
  [otherSubject,other]);
 await reject('update public.deadlines set subject_id=$1 where id=$2',
  [otherSubject,mine.id]);

 // N42.1 must not expose writes before command receipts and registered undo.
 // Verify both ordinary permissions AND RLS independently: if Supabase grants
 // DML by default, the absent write policies must still prevent owner writes.
 const grants=(await q(`select
  has_table_privilege('authenticated','public.deadlines','SELECT') can_read,
  has_table_privilege('authenticated','public.deadlines','INSERT') can_insert,
  has_table_privilege('authenticated','public.deadlines','UPDATE') can_update,
  has_table_privilege('authenticated','public.deadlines','DELETE') can_delete`))[0];
 assert.deepEqual(grants,{can_read:true,can_insert:false,can_update:false,can_delete:false});
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const visible=await q('select id from public.deadlines order by id');
 assert.deepEqual(visible.map(r=>r.id),[mine.id]);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [owner,'Blocked direct insert','milestone','date','2026-12-15']);
 await reject("update public.deadlines set status='done' where id=$1",[mine.id]);
 await reject('delete from public.deadlines where id=$1',[mine.id]);
 await db.exec('reset role');
 // Test the defensive policy separately with permissive fixture-only grants.
 // This is not a migration grant and does not loosen the production table.
 await db.exec('grant insert,update,delete on public.deadlines to authenticated');
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [owner,'RLS blocked','milestone','date','2026-12-15']);
 assert.deepEqual(await q('update public.deadlines set title=$1 where id=$2 returning id',
  ['RLS blocked own update',mine.id]),[]);
 assert.deepEqual(await q('delete from public.deadlines where id=$1 returning id',[mine.id]),[]);
 assert.deepEqual(await q('update public.deadlines set title=$1 where id=$2 returning id',
  ['Cross-owner',theirs.id]),[]);
 await db.exec('reset role');
 // Admin-only setup still exercises triggers and the domain invariants.
 const modified=(await q("update public.deadlines set status='done' where id=$1 returning *",[mine.id]))[0];
 assert.equal(modified.status,'done');
 assert.ok(new Date(modified.updated_at).getTime()>=new Date(mine.updated_at).getTime());
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='deadlines'"))[0].n,3,
  'two inserts and one status change are audited, failed writes are not');
 const fks=await q("select condeferrable from pg_constraint where conrelid='public.deadlines'::regclass and contype='f'");
 assert.equal(fks.filter(row=>row.condeferrable).length,3);
 const policies=await q("select policyname,cmd from pg_policies where tablename='deadlines'");
 assert.ok(policies.some(r=>r.policyname==='deadlines_owner_select'));
 assert.ok(policies.every(r=>r.cmd==='SELECT'||r.cmd==='select'),
  'no owner DML policy until N42.2');
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/deadlines.json',import.meta.url),'utf8'));
 const cols=await q("select column_name from information_schema.columns where table_schema='public' and table_name='deadlines'");
 assert.deepEqual(Object.keys(doc.columns).sort(),cols.map(c=>c.column_name).sort(),
  'capability registry must classify every persisted deadline field');
 for(const [field,meta] of Object.entries(doc.columns)){
  assert.ok(meta.classification&&meta.appPath&&meta.mcpPath&&meta.exportPolicy&&meta.deletionPolicy,field);
 }

 // N42.2.1: physical and projected deadlines share one owner-scoped feed.
 // Source dates remain civil dates, and refreshing the source changes the
 // projection without materializing any additional deadline row.
 const ownProject='66666666-6666-6666-6666-666666666666';
 const foreignProject='77777777-7777-7777-7777-777777777777';
 const ownCheckpoint='88888888-8888-8888-8888-888888888888';
 const foreignCheckpoint='99999999-9999-9999-9999-999999999999';
 // The action journal requires one owner per statement/transaction.
 await q(`insert into public.projects(id,user_id,slug,title,target_date)
   values($1,$2,'math-plan','Mathematics path','2026-12-15')`,
   [ownProject,owner]);
 await q(`insert into public.projects(id,user_id,slug,title,target_date)
   values($1,$2,'foreign-plan','Foreign path','2026-11-29')`,
   [foreignProject,other]);
 await q(`insert into public.checkpoints
   (id,user_id,project_id,code,position,title,objective,criterion,due_on)
   values($1,$2,$3,'CP1',1,'Algebra checkpoint','Show mastery','Solve', '2026-12-02')`,
   [ownCheckpoint,owner,ownProject]);
 await q(`insert into public.checkpoints
   (id,user_id,project_id,code,position,title,objective,criterion,due_on)
   values($1,$2,$3,'CP1',1,'Foreign checkpoint','Other work','Explain','2026-12-03')`,
   [foreignCheckpoint,other,foreignProject]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const feed=await q('select * from public.deadline_feed()');
 assert.equal(feed.length,3,'one physical deadline and two owner projections');
 const byOrigin=Object.fromEntries(feed.map(row=>[row.origin,row]));
 assert.deepEqual(Object.keys(byOrigin).sort(),['checkpoint','deadline','project']);
 assert.equal(byOrigin.deadline.source_id,mine.id);
 assert.equal(byOrigin.deadline.projected,false);
 assert.equal(byOrigin.deadline.status,'done','physical status stays authoritative');
 assert.equal(byOrigin.deadline.due_kind,'date');
 assert.equal(byOrigin.project.source_id,ownProject);
 assert.equal(byOrigin.project.projected,true);
 assert.equal(byOrigin.project.project_id,ownProject);
 assert.equal(String(byOrigin.project.due_date).slice(0,10),'2026-12-15');
 assert.equal(byOrigin.checkpoint.source_id,ownCheckpoint);
 assert.equal(byOrigin.checkpoint.checkpoint_id,ownCheckpoint);
 assert.equal(byOrigin.checkpoint.project_id,ownProject);
 assert.equal(byOrigin.checkpoint.projected,true);
 assert.equal(String(byOrigin.checkpoint.due_date).slice(0,10),'2026-12-02');
 assert.equal((await q('select origin from public.deadline_feed(1,1)'))[0].origin,
   'checkpoint','bounded pages have stable due-date ordering');
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.deadlines'))[0].n,2,
   'projections never create physical deadlines');
 await q('update public.projects set target_date=null where id=$1',[ownProject]);
 await q('update public.checkpoints set due_on=null where id=$1',[ownCheckpoint]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 assert.deepEqual((await q('select origin from public.deadline_feed()')).map(x=>x.origin),
   ['deadline'],'clearing source dates removes projections without writes');
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[other]);
 await db.exec('set role authenticated');
 const foreignFeed=await q('select origin,source_id from public.deadline_feed()');
 assert.deepEqual(foreignFeed.map(x=>x.source_id).sort(),
   [theirs.id,foreignProject,foreignCheckpoint].sort(),
   'a second owner sees only her own physical and projected rows');
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 assert.deepEqual(await q('select origin from public.deadline_feed()'),[],
   'an unsigned session cannot read the projections');
 assert.equal((await q('select count(*)::int n from public.deadlines'))[0].n,2);

 console.log('PASS N42.1 owner deadlines schema, date/instant exclusivity, estimates, FKs, RLS, audit and inventory');
}finally{await db.close()}
