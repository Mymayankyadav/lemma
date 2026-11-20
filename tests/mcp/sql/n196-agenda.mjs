// Isolated SQL gate. PGLite runs locally; NOTIF_TEST_DATABASE_URL uses the existing native PG17 fixture.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const foundation=process.env.N196_FOUNDATION_DIR||root;
const fixture=pathToFileURL(resolve(foundation,'tests/mcp/sql/fixtures/n191-pg-fixture.mjs'));
const db=process.env.NOTIF_TEST_DATABASE_URL ? await (await import(fixture)).openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL)
  : new (await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')).PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
try {
  for(const role of ['anon','authenticated','service_role'])
    if(!(await q('select 1 from pg_roles where rolname=$1',[role])).length)await db.exec('create role '+role);
  await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  await db.exec(`create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const paths=new Map();
  for(const dir of [foundation,root]){
    const migrations=resolve(dir,'supabase/migrations');
    for(const name of await readdir(migrations))
      if(name.endsWith('.sql')&&!name.includes('_storage')) paths.set(name,resolve(migrations,name));
  }
  for(const name of [...paths.keys()].sort()) await db.exec(await readFile(paths.get(name),'utf8'));
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  for(const [id,key] of [[owner,'a'],[other,'b']]){
    await q('insert into auth.users(id) values($1)',[id]);
    await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',[id,key.repeat(48)]);
    await q('insert into public.tasks(user_id,title,estimate_minutes) values ($1,$2,15)',[id,'task '+key]);
  }
  await db.exec('set role authenticated');
  await assert.rejects(q('select public.lemma_agenda_snapshot($1)',[other]),/permission denied|Verified owner/);
  await db.exec('reset role; set role service_role');
  const [row]=await q('select public.lemma_agenda_snapshot($1) as host',[owner]), snapshot=row.host;
  assert.equal(snapshot.calendar.status,'ok');
  assert.equal(snapshot.watermark,snapshot.calendar.watermark);
  assert.deepEqual(snapshot.tasks.map(t=>t.title),['task a']);
  assert.equal(snapshot.rows.settings.connector_secret,undefined);
  const empty=snapshot.calendar.availability;
  assert.equal(empty,null,'unset capacity stays unknown');
  assert.ok(!JSON.stringify(snapshot).includes('task b'));
  console.log('N196 native owner snapshot, SQL grants, clock, capacity and scope passed');
}finally{await db.close();}
