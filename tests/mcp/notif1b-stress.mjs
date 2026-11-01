// NOTIF-1b X-profile candidate budget: 60 projects, 2,400 checkpoints,
// 30,000 due cards. One owner-scoped SQL query, no Edge per-project loops.
// Isolated PGlite only; no live Supabase access.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
const owner='11111111-1111-1111-1111-111111111111'
const subject='22222222-2222-2222-2222-222222222222'
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
 select $1,p.id,'CP'||g.i,g.i*10,'Checkpoint '||g.i,'Study','Prove','["Step"]'::jsonb,current_date+1
 from public.projects p cross join generate_series(1,40) as g(i) where p.user_id=$1`,[owner])
 await db.exec('alter table public.checkpoints enable trigger lemma_log_change')
 const counts=await q('select (select count(*)::int from public.projects where user_id=$1) projects,(select count(*)::int from public.cards where user_id=$1) cards,(select count(*)::int from public.checkpoints where user_id=$1) checkpoints',[owner])
 assert.deepEqual(counts[0],{projects:60,cards:30000,checkpoints:2400})
 let queryCount=0
 const start=performance.now()
 queryCount++
 const snapshot=(await q('select public.notify_candidates($1,now()) data',[owner]))[0].data
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
   const plan=await q('explain (analyze, buffers) select public.notify_candidates($1,now())',[owner])
   console.log('NOTIF-1b X diagnostic plan',plan.map(row=>row['QUERY PLAN']).join('\n'))
   // Profile individual CTEs only after the strict first-attempt gate fails.
   // No diagnostic rerun can change the first-attempt acceptance measurement.
   const migrationSql=await readFile(new URL('../../supabase/migrations/20261101123100_notify_candidates.sql',import.meta.url),'utf8')
   const cteBody=migrationSql.split('\nwith\n')[1]?.split("\nselect jsonb_build_object(\n  'tz'")[0]
   assert.ok(cteBody?.startsWith('prefs as ('),'candidate CTE diagnostics must match the migration')
   const ctes=('with\n'+cteBody).replace(/\bp_user\b/g,'$1::uuid').replace(/\bp_now\b/g,'$2::timestamptz')
   for(const name of ['due_candidates','top_due','prioritized','quota','tomorrow_rows','study_summary']){
     const t0=performance.now()
     const detail=await q('explain (analyze,buffers) '+ctes+'\nselect count(*) from '+name,[owner,new Date().toISOString()])
     console.log('NOTIF-1b X CTE '+name+' '+(performance.now()-t0).toFixed(1)+'ms\n'+
       detail.map(row=>row['QUERY PLAN']).join('\n').slice(0,6000))
   }
 }
 // Guard the cold-X optimization structurally as well as with the unchanged
 // first-attempt 150ms timing gate: sibling cards must be deduplicated before
 // the 30k-card path joins the notes/projects tables. This deliberately fails
 // on the pre-fix migration, which deduplicates after those joins.
 const optimizedSql=await readFile(new URL('../../supabase/migrations/20261101171500_notify_candidates_card_first.sql',import.meta.url),'utf8').catch(()=> '')
 assert.match(optimizedSql,/due_candidates as \\(\\s*select n\\.id note_id,n\\.no,c\\.state,c\\.due,c\\.id card_id\\s+from \\(\\s*select distinct on \\(c\\.note_id\\)/,
   'X candidate path must deduplicate sibling cards before joining notes/projects')
 assert.ok(elapsed<150,'X candidate query must finish under 150ms (first attempt)')
 console.log('PASS NOTIF-1b X 60-project/30k-card first-attempt query budget')
}finally{await db.close()}
