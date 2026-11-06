// N21: run on isolated PGlite, never the deployed Supabase database.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const owner = '11111111-1111-1111-1111-111111111111';
const other = '99999999-9999-9999-9999-999999999999';
const subject = '22222222-2222-2222-2222-222222222222';
const task = '33333333-3333-3333-3333-333333333333';
const q = async (sql, params=[]) => (await db.query(sql, params)).rows;
const as = async (id) => {
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())
    await db.exec(await readFile(new URL(name,dir),'utf8'));

  await q('insert into auth.users(id) values ($1),($2)',[owner,other]);
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values ($1,$2,'Math','M','amber')",[subject,owner]);

  const schema=(await q("select relrowsecurity from pg_class where oid='public.tasks'::regclass"))[0];
  assert.equal(schema.relrowsecurity,true,'tasks has owner RLS');
  const index=await q("select indexname from pg_indexes where schemaname='public' and tablename='tasks'");
  assert.ok(index.some(x=>x.indexname==='tasks_owner_status_position'),'owner/status/position query is indexed');

  await as(owner);
  const inserted=await q(`insert into public.tasks
    (id,title,body,subject_id,estimate_minutes,priority,due_kind,due_date,position)
    values ($1,'Prove compactness','Explain the proof',$2,25,'high','date','2026-11-08',3)
    returning *`,[task,subject]);
  assert.equal(inserted.length,1);
  assert.equal(inserted[0].user_id,owner);
  assert.equal(inserted[0].status,'backlog');
  assert.equal(inserted[0].version,1);
  assert.equal(inserted[0].due_kind,'date');
  assert.equal(inserted[0].due_at,null);
  assert.equal(inserted[0].estimate_minutes,25);
  assert.equal((await q('select count(*)::int n from public.tasks'))[0].n,1);

  const updated=await q(`update public.tasks set title='Revised proof',
    status='in_progress',version=version+1,updated_at=now()
    where id=$1 returning title,status,version`,[task]);
  assert.deepEqual(updated,[{title:'Revised proof',status:'in_progress',version:2}]);

  const completed=await q(`update public.tasks set status='completed',completed_at='2026-11-07T12:00:00Z',
    version=version+1 where id=$1 returning status,completed_at,version`,[task]);
  assert.equal(completed[0].status,'completed');
  assert.equal(completed[0].version,3);
  assert.equal(new Date(completed[0].completed_at).toISOString(),'2026-11-07T12:00:00.000Z');

  await assert.rejects(q("insert into public.tasks(title,status) values ('No completed instant','completed')"),
    /tasks_completion_consistent|check constraint/i);
  await assert.rejects(q("insert into public.tasks(title,completed_at) values ('Premature timestamp',now())"),
    /tasks_completion_consistent|check constraint/i);
  await assert.rejects(q("update public.tasks set completed_at=null where id=$1",[task]),
    /tasks_completion_consistent|check constraint/i);
  await assert.rejects(q("insert into public.tasks(title,status) values ('Invalid','waiting')"),
    /check constraint/i);
  await assert.rejects(q("insert into public.tasks(title,due_kind) values ('Missing date','date')"),
    /tasks_due_kind_matches_value|check constraint/i);
  await assert.rejects(q("insert into public.tasks(title,due_kind,due_date,due_at) values ('Both','instant','2026-11-07',now())"),
    /tasks_due_kind_matches_value|check constraint/i);
  await assert.rejects(q("insert into public.tasks(title,estimate_minutes) values ('Negative',-1)"),
    /check constraint/i);
  await assert.rejects(q("insert into public.tasks(title) values ('  ')"),
    /check constraint/i);

  const timed=await q(`insert into public.tasks(title,due_kind,due_at)
    values ('Watch seminar','instant','2026-11-09T15:30:00Z') returning due_kind,due_date,due_at`);
  assert.equal(timed[0].due_kind,'instant');
  assert.equal(timed[0].due_date,null);

  await as(other);
  assert.deepEqual(await q('select id from public.tasks'),[],'second owner cannot list first owner tasks');
  assert.deepEqual(await q("update public.tasks set title='Stolen' where id=$1 returning id",[task]),[],
    'second owner cannot edit the first owner task');
  assert.deepEqual(await q('delete from public.tasks where id=$1 returning id',[task]),[],
    'second owner cannot delete first owner task');
  await assert.rejects(q("insert into public.tasks(id,user_id,title) values ($1,$2,'Spoof owner')",
    ['44444444-4444-4444-4444-444444444444',owner]),/row-level security|violates row.level security/i);
  await assert.rejects(q("insert into public.tasks(title,subject_id) values ('Cross owner link',$1)",[subject]),
    /foreign key|constraint/i);
  const theirs=await q("insert into public.tasks(title,priority) values ('Own list','low') returning user_id");
  assert.equal(theirs[0].user_id,other);
  assert.equal((await q('select count(*)::int n from public.tasks'))[0].n,1);

  await as(owner);
  assert.equal((await q('select count(*)::int n from public.tasks'))[0].n,2);
  const deleted=await q('delete from public.tasks where id=$1 returning id',[task]);
  assert.deepEqual(deleted,[{id:task}],'owner can delete own task');
  assert.equal((await q('select count(*)::int n from public.tasks'))[0].n,1);
  console.log('N21 tasks schema: owner CRUD, RLS, composite owner links, dates, status and completion constraints passed');
} finally {
  await db.close();
}
