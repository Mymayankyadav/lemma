// NOTIF-1b X-profile candidate budget: 60 projects, 2,400 checkpoints,
// 30,000 due cards. One owner-scoped SQL query, no Edge per-project loops.
// Isolated PGlite only; no live Supabase access.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import {buildReadOnlyExplain} from './notif1b-diagnostic.mjs'
import './notif1b-diagnostic.test.mjs'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
const owner='11111111-1111-1111-1111-111111111111'
const subject='22222222-2222-2222-2222-222222222222'
// One immutable instant for fixture and candidate, even across rollover.
const snapshotAt=new Date().toISOString()
const q=async(sql,params=[])=>(await db.query(sql,params)).rows
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 const dir=new URL('../../supabase/migrations/',import.meta.url)
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
   await db.exec(await readFile(new URL(file,dir),'utf8'))
 await q('insert into auth.users(id) values($1)',[owner])
 await db.exec("select set_config('test.uid','"+owner+"',false)")
 await db.exec('select public.bootstrap()')
 await q('insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,$3,$4,$5)',
   [subject,owner,'Analysis','A','amber'])
 await q(`insert into public.projects(user_id,subject_id,slug,title,goal,status)
   select $1,$2,'p'||g.i,'Project '||g.i,'Study','active'
   from generate_series(1,60) as g(i)`,[owner,subject])
 // Only disable the reversible-action audit trigger while generating synthetic
 // stress data. Production migrations and tests keep every trigger enabled.
 await db.exec('alter table public.notes disable trigger lemma_log_change;alter table public.cards disable trigger lemma_log_change')
 await q(`with projects as (
   select id,row_number() over(order by slug) rn from public.projects where user_id=$1
 ) insert into public.notes(user_id,project_id,front)
 select $1,p.id,'Question '||g.n
 from generate_series(1,30000) as g(n)
 join projects p on p.rn=1+((g.n-1)%60)`,[owner])
 await q(`insert into public.cards(user_id,note_id,ord,state,due)
 select $1,id,1,2,now()-interval '1 day' from public.notes where user_id=$1`,[owner])
 await db.exec('alter table public.notes enable trigger lemma_log_change;alter table public.cards enable trigger lemma_log_change')
 await db.exec('alter table public.checkpoints disable trigger lemma_log_change')
 await q(`insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps,due_on)
 select $1,p.id,'CP'||g.i,g.i*10,'Checkpoint '||g.i,'Study','Prove','["Step"]'::jsonb,
   ((($2::timestamptz at time zone s.time_zone)-make_interval(hours=>s.rollover_hour))::date+1)
 from public.projects p join public.settings s on s.user_id=p.user_id
 cross join generate_series(1,40) as g(i) where p.user_id=$1`,[owner,snapshotAt])
 await db.exec('alter table public.checkpoints enable trigger lemma_log_change')
 // Exercise the diagnostic-only EXPLAIN syntax on every CI run, even when
 // the strict first-attempt query is fast and the failure branch is skipped.
 const explainSmoke=await q(buildReadOnlyExplain('select $1::uuid'),[owner])
 assert.ok(explainSmoke.length>0,'planner-only EXPLAIN must parse on PGlite')
 const counts=await q('select (select count(*)::int from public.projects where user_id=$1) projects,(select count(*)::int from public.cards where user_id=$1) cards,(select count(*)::int from public.checkpoints where user_id=$1) checkpoints',[owner])
 assert.deepEqual(counts[0],{projects:60,cards:30000,checkpoints:2400})
 // Regression-first: owner/note lookup must cover the three fields used by
 // due-card sibling ranking, rather than visiting 30k heap tuples per query.
 const covering=await q("select indexdef from pg_indexes where schemaname='public' and tablename='cards' and indexname='cards_notify_owner_note_due_cover'")
 assert.equal(covering.length,1,'notification card lookup needs its covering index')
 assert.match(covering[0].indexdef,/INCLUDE\s*\(state, due, id\)/i)
 let queryCount=0
 const start=performance.now()
 queryCount++
 const snapshot=(await q('select public.notify_candidates($1,$2::timestamptz) data',[owner,snapshotAt]))[0].data
 const elapsed=performance.now()-start
 assert.ok(queryCount<12,'one bounded candidate query, not N+1 project reads')
 assert.equal(snapshot.due.backlog,30000)
 assert.equal(snapshot.due.count,200)
 assert.equal(snapshot.due.minutes,84)
 assert.ok(snapshot.tomorrow.length<=20)
 assert.equal(new Set(snapshot.tomorrow.map(row=>row.slug)).size,20,
   'K2 bound must represent 20 different projects before repeating one')
 assert.ok(snapshot.late.length<=20)
 assert.ok(snapshot.pastTarget.length<=20)
 assert.equal(snapshot.devices.enabled,0)
 console.log('NOTIF-1b X candidate snapshot',JSON.stringify({projects:60,checkpoints:2400,cards:30000,queryCount,elapsedMs:Number(elapsed.toFixed(1))}))
 // Diagnostic EXPLAIN is never used for acceptance: the first call above
 // remains the only timed attempt and always fails if it exceeded the budget.
 if(elapsed>=150){
   // Never execute a second candidate/CTE query after the first-attempt gate
   // has failed. PGlite's EXPLAIN ANALYZE can outlive statement_timeout and
   // cancel the entire 10-minute mcp-sql job, concealing the measured failure.
   // Planner-only EXPLAIN preserves plan shape, estimates and index choices.
   await db.exec("set statement_timeout = '3000ms'")
   try{
     const plan=await q(buildReadOnlyExplain('select public.notify_candidates($1,now())'),[owner])
     console.log('NOTIF-1b X estimated diagnostic plan',
       plan.map(row=>row['QUERY PLAN']).join('\n').slice(0,6000))
     const migrationSql=await readFile(new URL('../../supabase/migrations/20261101171500_notify_candidates_card_first.sql',import.meta.url),'utf8')
     const cteBody=migrationSql.split('\nwith\n')[1]?.split("\nselect jsonb_build_object(\n  'tz'")[0]
     assert.ok(cteBody?.startsWith('prefs as ('),'candidate CTE diagnostics must match the migration')
     const ctes=('with\n'+cteBody).replace(/\bp_user\b/g,'$1::uuid').replace(/\bp_now\b/g,'$2::timestamptz')
     for(const name of ['due_candidates','top_due','prioritized','quota','tomorrow_rows','study_summary']){
       const detail=await q(buildReadOnlyExplain(ctes+'\nselect count(*) from '+name),
         [owner,new Date().toISOString()])
       console.log('NOTIF-1b X estimated CTE '+name+'\n'+
         detail.map(row=>row['QUERY PLAN']).join('\n').slice(0,6000))
     }
   }catch(error){
     // Diagnostics cannot replace the original first-attempt failure. Log a
     // bounded code only; do not expose SQL parameters or secrets.
     console.log('NOTIF-1b X planner diagnostic unavailable',String(error?.code||'unknown').slice(0,60))
   }finally{
     await db.exec('reset statement_timeout')
   }
 }
 // Guard the cold-X optimization structurally as well as with the unchanged
 // first-attempt 150ms timing gate: sibling cards must be deduplicated before
 // the 30k-card path joins the notes/projects tables. This deliberately fails
 // on the pre-fix migration, which deduplicates after those joins.
 const optimizedSql=await readFile(new URL('../../supabase/migrations/20261101171500_notify_candidates_card_first.sql',import.meta.url),'utf8').catch(()=> '')
 assert.match(optimizedSql,/due_candidates as \(\s*select n\.id note_id,n\.no,c\.state,c\.due,c\.id card_id\s+from \(\s*select distinct on \(c\.note_id\)/,
   'X candidate path must deduplicate sibling cards before joining notes/projects')
 // Regression: a function-local hash-join preference must not leave the
 // tomorrow K2 lookup as a per-project LATERAL nested-loop dependency.
 // Rank eligible checkpoints once, then take one per project. The existing
 // snapshot checks above assert the exact twenty-project K2 semantics.
 assert.match(optimizedSql,/set enable_nestloop\s*=\s*off/i,
   'X due-card scan requires the function-local non-nested-loop planner path');
 assert.match(optimizedSql,/tomorrow_ranked as \(\s*select[\s\S]*?row_number\(\) over\(partition by pr\.id order by c\.position,c\.id\)/i,
   'K2 must rank eligible checkpoints once per project, without per-project LATERAL scans');
 assert.doesNotMatch(optimizedSql,/join lateral\s*\(\s*select c\.code/i,
   'K2 LATERAL must not be planned under the global non-nested-loop preference');
 assert.ok(elapsed<150,'X candidate query must finish under 150ms (first attempt)')
 // The fixture correctness checks run AFTER the single timed cold query,
 // so they cannot warm checkpoint buffers or improve its first-attempt budget.
 // Regression-first: the X checkpoint fixture must mean "tomorrow" in the
 // owner's study-day, not the PostgreSQL session's UTC calendar day.
 // At UTC 00:00–04:00 with UTC rollover 04:00, current_date+1 is a day late.
 const dueDateCheck=await q(`select count(*)::int total,
   count(*) filter(where c.due_on=((($2::timestamptz at time zone s.time_zone)
     -make_interval(hours=>s.rollover_hour))::date+1))::int matching
   from public.checkpoints c join public.settings s on s.user_id=c.user_id
   where c.user_id=$1`,[owner,snapshotAt])
 assert.deepEqual(dueDateCheck[0],{total:2400,matching:2400},
   'all X checkpoints must be due tomorrow by the owner study-day, even across UTC midnight')
 const fixtureSource=await readFile(new URL(import.meta.url),'utf8')
 assert.doesNotMatch(fixtureSource,/::jsonb,\s*current_date\s*\+\s*1/i,
   'the X checkpoint insert must not regress to UTC current_date+1')
 // Deterministic rollover regression, intentionally AFTER the original one-query
 // first-attempt <150ms acceptance. These extra untimed queries cannot warm
 // that measurement. Use the same 60 projects, 2,400 checkpoints and 30k cards.
 // Anchor four fixed clock instants to the snapshot's UTC date, so this test
 // remains valid in later years without depending on when CI happens to run.
 const utcDay=snapshotAt.slice(0,10)
 const previousUtcDay=new Date(Date.parse(utcDay+'T00:00:00Z')-86400000).toISOString().slice(0,10)
 const followingUtcDay=new Date(Date.parse(utcDay+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 const boundaryInstants=[
   ['before UTC midnight',previousUtcDay+'T23:59:59.000Z',utcDay],
   ['after UTC midnight',utcDay+'T00:00:01.000Z',utcDay],
   ['before 04:00 rollover',utcDay+'T03:59:59.000Z',utcDay],
   ['after 04:00 rollover',utcDay+'T04:00:01.000Z',followingUtcDay],
 ]
 const ownerClock=await q('select time_zone,rollover_hour from public.settings where user_id=$1',[owner])
 assert.equal(ownerClock[0].time_zone,'UTC','X fixture boundary assumes the bootstrap UTC time zone')
 assert.equal(ownerClock[0].rollover_hour,4,'X fixture boundary assumes the bootstrap 04:00 rollover')
 // The original 2,400-row insert already disables the synthetic action-log
 // trigger. Keep the same isolation for these test-only date rewrites.
 await db.exec('alter table public.checkpoints disable trigger lemma_log_change')
 try{
   for(const [label,instant,expectedTomorrow] of boundaryInstants){
     await q(`update public.checkpoints c
       set due_on=((($2::timestamptz at time zone s.time_zone)
         -make_interval(hours=>s.rollover_hour))::date+1)
       from public.settings s
       where c.user_id=$1 and s.user_id=c.user_id`,[owner,instant])
     const dates=await q('select min(due_on)::text first,max(due_on)::text last,count(*)::int total from public.checkpoints where user_id=$1',[owner])
     assert.deepEqual(dates[0],{first:expectedTomorrow,last:expectedTomorrow,total:2400},
       label+' must create 2,400 owner-study-day tomorrow checkpoints')
     const boundary=(await q('select public.notify_candidates($1,$2::timestamptz) data',[owner,instant]))[0].data
     assert.equal(new Set(boundary.tomorrow.map(row=>row.slug)).size,20,
       label+' must return 20 distinct K2 projects')
     assert.ok(boundary.tomorrow.length<=20,label+' K2 remains bounded')
     assert.equal(boundary.due.backlog,30000,label+' retains the 30k-card X fixture')
     console.log('NOTIF-1b X rollover boundary',JSON.stringify({label,instant,expectedTomorrow,projects:20}))
   }
 }finally{
   await db.exec('alter table public.checkpoints enable trigger lemma_log_change')
 }
 console.log('PASS NOTIF-1b X 60-project/30k-card first-attempt query budget')
}finally{await db.close()}
