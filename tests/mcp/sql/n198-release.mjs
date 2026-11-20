import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {openN191Postgres} from './fixtures/n191-pg-fixture.mjs';

const db = process.env.NOTIF_TEST_DATABASE_URL ? await openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL)
  : new (await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')).PGlite();
const migrations = new URL('../../../supabase/migrations/', import.meta.url);
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const owner = randomUUID(), other = randomUUID();

async function as(role, run) {
  await db.exec('set role ' + role);
  try { return await run(); }
  finally { await db.exec('reset role'); }
}

try {
  for (const role of ['anon', 'authenticated', 'service_role'])
    if (!(await q('select 1 from pg_roles where rolname=$1', [role])).length) await db.exec('create role ' + role);
  await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const files = (await readdir(migrations)).filter(name => name.endsWith('.sql') && !name.includes('_storage')).sort();
  const launch = files.filter(name => name.includes('_n198_'));
  for (const name of files.filter(name => !launch.includes(name)))
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));

  // Choose a civil date whose midnight was at least twelve hours ago.
  const [day] = await q(`with choice as (select case when extract(hour from now() at time zone 'UTC') < 12
    then 'Etc/GMT+12' else 'UTC' end as zone)
    select zone, date_trunc('day', now() at time zone zone) at time zone zone as midnight from choice`);
  const time = minutes => new Date(new Date(day.midnight).getTime() + minutes * 60000).toISOString();
  const add = async (user, exclusions, intervals, savedAt = time(60)) => {
    const [entry] = await q(`insert into public.study_entries(user_id,source,status,saved_at,excluded_intervals)
      values($1,'manual','saved',$2,$3::jsonb) returning id`, [user, savedAt, JSON.stringify(exclusions)]);
    for (const [kind, start, end] of intervals)
      await q(`insert into public.study_intervals(user_id,entry_id,kind,started_at,ended_at)
        values($1,$2,$3,$4,$5)`, [user, entry.id, kind, time(start), time(end)]);
    return entry.id;
  };
  await q('insert into auth.users(id) values($1),($2)', [owner, other]);
  for (const [user, preference, key] of [[owner, null, 'a'], [other, 'legacy', 'b']])
    await q(`insert into public.settings(user_id,time_zone,scheduling_algorithm,connector_secret)
      values($1,$2,$3,repeat($4,48))`, [user, day.zone, preference, key]);
  const crossedMidnight = await add(owner, [], [['focus', -10, 30], ['break', 5, 15]]);
  await add(other, [{from:time(5), to:time(15)}], [['focus', -15, 30]]);
  for (const name of launch) await db.exec(await readFile(new URL(name, migrations), 'utf8'));

  const spent = async user => as('service_role', async () => {
    const [{host}] = await q('select public.lemma_agenda_snapshot($1) as host', [user]);
    assert.equal(host.calendar.status, 'ok');
    assert.equal(Object.keys(host.spentByDate).length, 1, 'One owner-local civil day is evaluated');
    return Object.values(host.spentByDate)[0];
  });
  assert.equal(await spent(owner), 20, 'Cross-midnight focus excludes the saved break');
  assert.equal(await spent(other), 20, 'Drift exclusions reduce capacity consumed for their own entry');

  await q(`update public.study_entries set excluded_intervals=$2::jsonb where id=$1`,
    [crossedMidnight, JSON.stringify([{from:time(10), to:time(20)}, {from:time(19), to:time(22)}])]);
  await add(owner, [{from:time(31), to:time(32)}], [['focus', 20, 30], ['focus', 26, 35]]);
  await add(owner, [], [['focus', 31, 55]], time(1500));
  assert.equal(await spent(owner), 19, 'Overlapping focus and exclusions are counted once, ignoring future saves');
  assert.equal(await spent(other), 20, 'Changing one owner’s saved study cannot affect another owner');
  console.log('N198 owner-day agenda capacity, overlap, saved breaks and drift passed');

  const release = async () => (await q('select public.lemma_plan_released() as enabled'))[0].enabled;
  await as('anon', () => assert.rejects(release(), /permission denied/));
  for (const role of ['authenticated', 'service_role']) await as(role, async () => {
    assert.equal(await release(), false, 'An upgraded database starts with the release held');
    await assert.rejects(q('insert into lemma_release.plan_control(enabled) values(true)'), /permission denied/);
    await assert.rejects(q('update lemma_release.plan_control set enabled=true'), /permission denied/);
  });
  const preferences = () => q('select user_id,scheduling_algorithm from public.settings order by user_id');
  const original = await preferences();
  await q('insert into lemma_release.plan_control(enabled) values(true)');
  for (const role of ['authenticated', 'service_role']) assert.equal(await as(role, release), true);
  await q('update lemma_release.plan_control set enabled=false');
  for (const role of ['authenticated', 'service_role']) assert.equal(await as(role, release), false);
  assert.deepEqual(await preferences(), original, 'Activation and rollback preserve both owner preferences');
  assert.equal(await spent(owner), 19, 'The read-only snapshot remains available for shadow qualification');
  console.log('N198 authenticated and service release control, operator privileges and rollback passed');
} finally {
  await db.close();
}
