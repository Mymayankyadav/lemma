// @vitest-environment node
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {readFile, readdir} from 'node:fs/promises';
import {createLiveStudyApi} from '../../../src/data/study/live';
import {liveClient} from '../../../src/data/live/client';
import {effortSummary, periodFor} from '../../../src/features/progress-v6/model';

vi.mock('../../../src/data/live/client', () => ({liveClient: vi.fn()}));

let db: any;
const owner = '11111111-1111-4111-8111-111111111111';
const envelopes: any[] = [];
const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows;

beforeAll(async () => {
  const path = process.env.PGLITE_MODULE!;
  const {PGlite} = await import(/* @vite-ignore */ path);
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $auth$
      select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
        nullif(current_setting('test.uid',true),'')::uuid) $auth$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as
      $bytes$ select decode(repeat('00',n),'hex') $bytes$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(n => n.endsWith('.sql') && !n.includes('_storage')).sort()) {
    await db.exec(await readFile(new URL(file, dir), 'utf8'));
  }
  await q('insert into auth.users(id) values($1)', [owner]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)', [owner, 'a'.repeat(48)]);
  await q("select set_config('test.uid',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const client = {
    from(table: string) {
      let key = '';
      const query = {
        select() {return query;},
        eq(column: string, value: string) {if (column === 'id') key = value; return query;},
        async maybeSingle() {
          if (table !== 'study_entries') throw Error('Unexpected table ' + table);
          const rows = await q(`select to_jsonb(e) || jsonb_build_object('study_intervals',
            coalesce((select jsonb_agg(to_jsonb(i)) from public.study_intervals i where i.entry_id=e.id), '[]'::jsonb)) as data
            from public.study_entries e where e.id=$1`, [key]);
          return {data: rows[0]?.data ?? null, error: null};
        },
      };
      return query;
    },
    async rpc(name: string, {p}: {p: unknown}) {
      envelopes.push(p);
      try {
        const rows = await q('select public.study_command($1::jsonb) as data', [JSON.stringify(p)]);
        if (rows[0].data.status === 'conflict') console.info('SQL rejected envelope', JSON.stringify({envelope: p, receipt: rows[0].data}));
        return {data: rows[0].data, error: null};
      } catch (error) {return {data: null, error: {message: (error as Error).message}};}
    },
  };
  vi.mocked(liveClient).mockReturnValue(client as never);
}, 60_000);

afterAll(async () => {await db?.close();});

it('lets the current lease owner finish and save the same running timer', async () => {
  const api = createLiveStudyApi();
  const started = await api.startStudyEntry({source: 'timer', intent: 'Proof'});
  const leased = await api.takeLease(started.record.id, started.record.version);
  const paused = await api.pauseStudyEntry(leased.record.id, leased.record.version);
  expect(paused.record.status).toBe('paused');
  const resumed = await api.resumeStudyEntry(paused.record.id, paused.record.version);
  expect(resumed.record.status).toBe('running');
  const saved = await api.saveStudyEntry(resumed.record.id, resumed.record.version, {minutes: 25, reflection: 'Finished'})
    .then(receipt => ({receipt}), error => ({error}));
  // Control: saving without the app's always-present minutes patch uses the lease correctly.
  if ('error' in saved) {
    const control = await api.saveStudyEntry(resumed.record.id, resumed.record.version, {reflection: 'Control'});
    expect(control.record.status).toBe('saved');
  }
  expect(saved).toMatchObject({receipt: {record: {status: 'saved'}}});
}, 30_000);

it('applies a real SQL exclusion to the app Progress total', async () => {
  const api = createLiveStudyApi(), now = Date.now();
  const manual = await api.createManualStudyEntry({intent: 'Exclusion verification', intervals: [{
    kind: 'focus', start: new Date(now - 25 * 60_000).toISOString(), end: new Date(now).toISOString(),
  }]});
  const excluded = await api.excludeMinutes(manual.record.id, manual.record.version, 10, 'Distracted');
  expect(excluded.record.excludedIntervals).toHaveLength(1);
  const summary = effortSummary([excluded.record], periodFor('day', new Date(), 'UTC'), 'UTC', new Date().toISOString());
  expect(summary.minutes).toBe(15);
}, 30_000);

it('uses the canonical Pomodoro transition for app and device Break and Resume',async()=>{
 const preset=(await q("insert into public.presets(user_id,label,mode,focus_minutes,break_minutes,long_break_minutes,cycles) values($1,'Pomo','pomodoro',25,5,15,4) returning id",[owner]))[0].id;
 const entry=(await q("insert into public.study_entries(user_id,source,status,preset_id,intent) values($1,'timer','draft',$2,'Proof') returning id",[owner,preset]))[0].id;
 const started=(await q('select public.study_command($1::jsonb) r',[JSON.stringify({schemaVersion:1,operationId:crypto.randomUUID(),resource:'study_entries',operation:'start',target:{id:entry},expectedVersion:1,patch:{}})]))[0].r;
 const api=createLiveStudyApi(),paused=await api.breakStudyEntry(entry,started.changed[0].version);
 expect(paused.record).toMatchObject({phase:'break',status:'paused',cycle:1});
 expect(paused.record.intervals.at(-1)?.kind).toBe('break');
 const resumed=await api.resumeStudyEntry(entry,paused.record.version);
 expect(resumed.record).toMatchObject({phase:'focus',status:'running',cycle:2});
 expect(resumed.record.intervals.at(-1)?.kind).toBe('focus');
 await api.saveStudyEntry(entry,resumed.record.version);
});
