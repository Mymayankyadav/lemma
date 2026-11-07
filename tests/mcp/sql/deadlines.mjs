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
 await q('insert into public.settings(user_id,connector_secret) values($1,$2),($3,$4)',
  [owner,'1'.repeat(48),other,'2'.repeat(48)]);
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

 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const visible=await q('select id from public.deadlines order by id');
 assert.deepEqual(visible.map(r=>r.id),[mine.id]);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [other,'Spoofed owner','milestone','date','2026-12-15']);
 assert.deepEqual(await q('update public.deadlines set title=$1 where id=$2 returning id',
  ['Cross-owner',theirs.id]),[]);
 const modified=(await q("update public.deadlines set status='done' where id=$1 returning *",[mine.id]))[0];
 assert.equal(modified.status,'done');
 assert.ok(new Date(modified.updated_at).getTime()>=new Date(mine.updated_at).getTime());
 await db.exec('reset role');
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='deadlines'"))[0].n,3,
  'two inserts and one status change are audited, failed writes are not');
 const fks=await q("select condeferrable from pg_constraint where conrelid='public.deadlines'::regclass and contype='f'");
 assert.equal(fks.filter(row=>row.condeferrable).length,3);
 const policies=await q("select policyname from pg_policies where tablename='deadlines'");
 assert.ok(policies.some(r=>r.policyname==='deadlines_owner'));
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/deadlines.json',import.meta.url),'utf8'));
 const cols=await q("select column_name from information_schema.columns where table_schema='public' and table_name='deadlines'");
 assert.deepEqual(Object.keys(doc.columns).sort(),cols.map(c=>c.column_name).sort(),
  'capability registry must classify every persisted deadline field');
 for(const [field,meta] of Object.entries(doc.columns)){
  assert.ok(meta.classification&&meta.appPath&&meta.mcpPath&&meta.exportPolicy&&meta.deletionPolicy,field);
 }
 console.log('PASS N42.1 owner deadlines schema, date/instant exclusivity, estimates, FKs, RLS, audit and inventory');
}finally{await db.close()}
