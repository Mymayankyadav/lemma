// @vitest-environment node
import {afterAll, beforeAll, beforeEach, expect, it} from 'vitest';
import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

let db: any, owner: string, project: string, checkpoint: string;
const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows;
async function as(role = 'authenticated', user = owner) {
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','',false)");
  await q("select set_config('test.uid',$1,false)", [user]);
  if (role !== 'admin') await db.exec('set role ' + role);
}
async function command(resource: string, operation: string, extra: Record<string, unknown> = {}, mcp = false) {
  const envelope = JSON.stringify({schemaVersion: 1, operationId: randomUUID(), resource, operation, patch: {}, ...extra});
  return (await q(mcp ? "select public.mcp_command($2,'chatgpt',$1::jsonb) r" : `select public.${resource}_command($1::jsonb) r`, mcp ? [envelope, owner] : [envelope]))[0].r;
}
async function plannedDeadline(mcp = false) {
  await as();
  const dates = (await q("select (current_date+1)::text start, (current_date+5)::text due"))[0];
  const created = await command('deadlines', 'create', {patch: {title: 'Exam', kind: 'exam', due_kind: 'date', due_date: dates.due, remaining_minutes: 60, estimate_source: 'owner', project_id: project, checkpoint_id: checkpoint}});
  const id = created.changed[0].id;
  const draft = await command('period_plans', 'create', {patch: {period: 'week', start_date: dates.start}});
  const plan = (await q('select * from public.period_plans where id=$1', [draft.changed[0].id]))[0];
  const placements = plan.placements.filter((p: any) => p.deadline_id === id);
  expect(placements.length).toBeGreaterThan(0);
  await command('period_plans', 'commit', {target: {id: plan.id}, expectedVersion: plan.version, patch: {placement_ids: placements.map((p: any) => p.id)}});
  if (mcp) await as('service_role', '');
  return {created, id};
}
beforeAll(async () => {
  const {PGlite} = await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $auth$
    select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
      nullif(current_setting('test.uid',true),'')::uuid) $auth$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql') && !f.includes('_storage')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
}, 60000);
beforeEach(async () => {
  owner = randomUUID(); project = randomUUID(); checkpoint = randomUUID();
  await as('admin');
  await q('insert into auth.users(id) values($1)', [owner]);
  await q("insert into public.settings(user_id,connector_secret,time_zone) values($1,$2,'UTC')", [owner, owner.replaceAll('-', '') + 'a'.repeat(16)]);
  await q("insert into public.projects(id,user_id,slug,title) values($1,$2,'review','Review')", [project, owner]);
  await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,'CP1',1,'Checkpoint','Learn','Explain','[\"Practice\"]')", [checkpoint, owner, project]);
  await as();
});
afterAll(async () => { await db?.close(); });

for (const mcp of [false, true]) {
  it(`deletes a planned deadline and restores its linked blocks through undo (${mcp ? 'MCP' : 'app'})`, async () => {
    const {id} = await plannedDeadline(mcp);
    if (mcp) await as('admin');
    const before = await q('select id,deadline_id,status,version from public.calendar_blocks where user_id=$1 order by id', [owner]);
    if (mcp) await as('service_role', '');
    expect((await command('deadlines', 'delete', {target: {id}, expectedVersion: 99}, mcp)).status).toBe('conflict');
    const envelope = {target: {id}, expectedVersion: 1};
    const deleted = await command('deadlines', 'delete', envelope, mcp);
    expect(deleted.status).toBe('ok');
    await as();
    expect(await q('select id from public.deadlines where id=$1', [id])).toEqual([]);
    const blocks = await q('select id,deadline_id,status,version from public.calendar_blocks where user_id=$1 order by id', [owner]);
    expect(blocks).toEqual(before.map((b: any) => ({...b, deadline_id: null, status: 'cancelled', version: b.version + 1})));
    if (mcp) await as('service_role', '');
    await q('select public.undo_action($1,$2,false)', [owner, deleted.actionNo]);
    await as();
    expect(await q('select id,deadline_id,status,version from public.calendar_blocks where user_id=$1 order by id', [owner])).toEqual(before);
    expect(await q('select id from public.deadlines where id=$1', [id])).toEqual([{id}]);
  });
  it(`undoes creation of a deadline after planning it (${mcp ? 'MCP' : 'app'})`, async () => {
    const {id, created} = await plannedDeadline(mcp);
    await q('select public.undo_action($1,$2,false)', [owner, created.actionNo]);
    await as();
    expect(await q('select id from public.deadlines where id=$1', [id])).toEqual([]);
    const blocks = await q('select deadline_id,status from public.calendar_blocks where user_id=$1', [owner]);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b: any) => b.deadline_id === null && b.status === 'cancelled')).toBe(true);
  });
}

it('keeps the deadline checkpoint on its committed calendar blocks', async () => {
  const {id} = await plannedDeadline();
  const blocks = await q('select checkpoint_id from public.calendar_blocks where deadline_id=$1', [id]);
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.every((b: any) => b.checkpoint_id === checkpoint)).toBe(true);
});

it('preserves completed work and another owner when unlinking a deleted deadline', async () => {
  const {id} = await plannedDeadline();
  const other = randomUUID();
  await as('admin');
  await q('insert into auth.users(id) values($1)', [other]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)', [other, 'b'.repeat(48)]);
  await as('authenticated', other);
  await expect(command('deadlines', 'delete', {target: {id}, expectedVersion: 1})).rejects.toThrow('Deadline not found for owner');
  await as('admin');
  await q("update public.calendar_blocks set status='done',version=version+1 where deadline_id=$1", [id]);
  await as();
  await command('deadlines', 'delete', {target: {id}, expectedVersion: 1});
  const blocks = await q('select deadline_id,status from public.calendar_blocks where user_id=$1', [owner]);
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.every((b: any) => b.deadline_id === null && b.status === 'done')).toBe(true);
});

it('fails an abandoned eighth notification claim but permits a live final claim to finish', async () => {
  await as('admin');
  const notices = await q(`insert into public.notifications(user_id,kind,key,title,body,url,due_at,delivery_attempts,delivery_claimed_at)
    values($1,'tutor','expired','Exam','Study','#/calendar',now(),8,now()-interval '3 minutes'),
      ($1,'tutor','live','Exam','Study','#/calendar',now(),8,now()),
      ($1,'tutor','retry','Exam','Study','#/calendar',now(),7,now()-interval '3 minutes') returning id,key`, [owner]);
  await as('service_role', '');
  const claimed = await q('select * from public.notify_claim($1,10)', [owner]);
  expect(claimed.map((n: any) => n.id)).toEqual([notices.find((n: any) => n.key === 'retry').id]);
  await q("select public.notify_record($1,$2,'sent')", [owner, notices.find((n: any) => n.key === 'live').id]);
  await as('admin');
  const rows = await q('select key,status,reason,delivery_claimed_at from public.notifications where user_id=$1 order by key', [owner]);
  expect(rows.find((n: any) => n.key === 'expired')).toMatchObject({status: 'failed', reason: 'push_error', delivery_claimed_at: null});
  expect(rows.find((n: any) => n.key === 'live')).toMatchObject({status: 'sent'});
  expect(rows.find((n: any) => n.key === 'retry')).toMatchObject({status: 'queued'});
});

it('handles export offsets beyond the end without overflowing the cursor', async () => {
  const snapshot = (await q('select public.begin_owner_export() r'))[0].r;
  const page = (await q("select public.owner_export_page($1,'projects',2147483647,100) r", [snapshot]))[0].r;
  expect(page).toEqual({rows: [], nextCursor: null});
});

it('exports every snapshot row once across full, partial and empty pages after live rows are removed', async () => {
  await as('admin');
  const originals = await q("insert into public.tasks(user_id,title) select $1,'Task '||n from generate_series(1,251) n returning id", [owner]);
  await as();
  const snapshot = (await q('select public.begin_owner_export() r'))[0].r;
  await as('admin');
  await q('delete from public.tasks where user_id=$1', [owner]);
  await as();
  const collected: string[] = [];
  for (const [offset, size, next] of [[0, 100, '100'], [100, 100, '200'], [200, 51, null], [251, 0, null]] as const) {
    const page = (await q("select public.owner_export_page($1,'tasks',$2,100) r", [snapshot, offset]))[0].r;
    expect(page.rows).toHaveLength(size);
    expect(page.nextCursor).toBe(next);
    collected.push(...page.rows.map((r: any) => r.id));
  }
  expect(collected.sort()).toEqual(originals.map((r: any) => r.id).sort());
  const settings = (await q("select public.owner_export_page($1,'settings',0,100) r", [snapshot]))[0].r;
  expect(settings.rows[0]).not.toHaveProperty('connector_secret');
  await as('authenticated', randomUUID());
  await expect(q("select public.owner_export_page($1,'tasks',0,100)", [snapshot])).rejects.toThrow('Export expired');
  await as();
  await q('select public.end_owner_export($1)', [snapshot]);
  await expect(q("select public.owner_export_page($1,'tasks',0,100)", [snapshot])).rejects.toThrow('Export expired');
});
