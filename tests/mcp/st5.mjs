// ST-5 SQL integration: run against isolated PostgreSQL, never the owner's data.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
const owner='11111111-1111-1111-1111-111111111111'
const other='99999999-9999-9999-9999-999999999999'
const q=async(sql)=>(await db.query(sql)).rows
try {
 await db.exec([
  'create role authenticated; create role anon; create role service_role;',
  'create schema auth;',
  "create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;',
  'create table public.subjects(id uuid primary key,user_id uuid,name text,glyph text,hue text,position int);',
  'create table public.projects(id uuid primary key,user_id uuid,subject_id uuid,slug text,title text,status text,pinned boolean,system boolean,target_date date,target_label text,last_activity_at timestamptz);',
  'create table public.checkpoints(id uuid primary key,user_id uuid,project_id uuid,code text,title text,position int,status text,current_step int,steps jsonb,objective text,stage text,due_on date);',
  'create table public.checkpoint_prereqs(user_id uuid,checkpoint_id uuid,prereq_id uuid);',
  'create table public.notes(id uuid primary key,user_id uuid,project_id uuid,checkpoint_id uuid,no bigint,front text,back text,type text,kind text,status text);',
  'create table public.cards(id uuid primary key,user_id uuid,note_id uuid,state int,due timestamptz);',
  'create table public.sessions(id uuid primary key,user_id uuid,project_id uuid,checkpoint_id uuid,number int,resume_step int,resume_question text,last_activity_at timestamptz,state text,started_at timestamptz,minutes int);',
  'create table public.sources(id uuid primary key,user_id uuid,project_id uuid,title text,position int);',
  'create table public.card_comments(id uuid primary key,user_id uuid,note_id uuid,status text);',
  'create table public.settings(user_id uuid primary key,reviews_per_day int,new_per_day int,time_zone text,rollover_hour int);',
  'create table public.reviews(id uuid primary key,user_id uuid,state_before int,undone_at timestamptz,reviewed_at timestamptz,rating int,confidence text,duration_ms int);',
  'create table public.proposals(id uuid primary key,user_id uuid,status text);',
  'create table public.session_events(id uuid primary key,user_id uuid,kind text,outcome text,created_at timestamptz);',
  'create table public.concepts(id uuid primary key,user_id uuid,name text);',
  'create table public.misconceptions(id uuid primary key,user_id uuid,concept_id uuid,label text,times int);',
  'grant usage on schema public to authenticated;',
  'grant select on all tables in schema public to authenticated;'
 ].join('\n'))
 for(const name of ['subjects','projects','checkpoints','checkpoint_prereqs','notes','cards','sessions','sources','card_comments','settings','reviews','proposals','session_events','concepts','misconceptions']){
  await db.exec('alter table public.'+name+' enable row level security; create policy owner_read on public.'+name+' for select to authenticated using(user_id=(select auth.uid()));')
 }
 await db.exec(await readFile(new URL('../../supabase/migrations/20261031012600_st5_paged_reads.sql',import.meta.url),'utf8'))
 await db.exec([
  "insert into public.subjects values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Algebra','∫','amber',0),('66666666-6666-6666-6666-666666666666','99999999-9999-9999-9999-999999999999','Private','X','slate',0);",
  "insert into public.projects values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','algebra','Algebra','active',true,false,'2027-01-01','Exam',now()),('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','archive','Archive','archived',false,false,null,null,now()-interval '1 day'),('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','system','System','active',false,true,null,null,now()),('66666666-6666-6666-6666-666666666666','99999999-9999-9999-9999-999999999999','66666666-6666-6666-6666-666666666666','private','Private','active',false,false,null,null,now());",
  'insert into public.checkpoints values '+
   "('77777777-7777-7777-7777-777777777771','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','CP1','Start',1,'demonstrated',1,'[\"Read\"]','Definitions'),"+
   "('77777777-7777-7777-7777-777777777772','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','CP2','Groups',2,'in_progress',2,'[\"Read\",\"Prove\",\"Practice\"]','Prove closure'),"+
   "('77777777-7777-7777-7777-777777777773','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','CP3','Rings',3,'not_started',0,'[\"Read\"]','Study rings');",
  "insert into public.checkpoint_prereqs values('11111111-1111-1111-1111-111111111111','77777777-7777-7777-7777-777777777773','77777777-7777-7777-7777-777777777772');",
  "insert into public.sources values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','Textbook',0);",
  "insert into public.sessions(id,user_id,project_id,checkpoint_id,number,resume_step,resume_question,last_activity_at,state) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','77777777-7777-7777-7777-777777777772',3,2,'Why closure?',now(),'open');",
  "insert into public.notes values('88888888-8888-8888-8888-888888888881','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','77777777-7777-7777-7777-777777777772',12,'A % literal','Back with _ literal','basic','theorem','active'),('88888888-8888-8888-8888-888888888882','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',null,13,'Fresh note','Answer','basic','why','active'),('88888888-8888-8888-8888-888888888883','99999999-9999-9999-9999-999999999999','66666666-6666-6666-6666-666666666666',null,14,'Private %','Hidden','basic','why','active');",
  "insert into public.cards values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888881',2,now()-interval '1 hour'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888882',0,now()),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','99999999-9999-9999-9999-999999999999','88888888-8888-8888-8888-888888888883',2,now()-interval '1 hour');",
  "insert into public.card_comments values('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888881','open');",
  "insert into public.settings values('11111111-1111-1111-1111-111111111111',200,20,'UTC',4),('99999999-9999-9999-9999-999999999999',200,20,'UTC',4);",
  "insert into public.proposals values('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','pending');"
 ].join('\n'))
 await db.exec("select set_config('test.uid','"+owner+"',false); set role authenticated;")
 const summaries=(await q('select public.project_summaries() item')).map(x=>x.item)
 assert.equal(summaries.length,2)
 const project=summaries.find(x=>x.slug==='algebra')
 assert.equal(project.total,3);assert.equal(project.done,1)
 assert.equal(project.current.code,'CP2');assert.equal(project.current.stepsTotal,3)
 assert.equal(project.cardsCount,2);assert.deepEqual(project.sourceTitles,['Textbook'])
 // Unstaged plans must be grouped by checkpoint order, not returned as 36 ticks.
 assert.deepEqual(project.stageProgress.map(x=>x.label),['CP1–CP3'])
 assert.equal(project.stageProgress[0].done,1)
 assert.equal(project.stageProgress[0].total,3)
 assert.equal(project.stageProgress[0].schedule,'unscheduled')
 assert.equal(project.scheduleHeadline,'Dates planned')
 // Explicit stages keep their names and include overdue counts without extra RPCs.
 await db.exec('reset role')
 await db.exec("update public.checkpoints set stage=case when code in ('CP1','CP2') then 'Basics' else 'Rings' end, due_on=case when code='CP3' then current_date-1 else current_date+2 end where project_id='33333333-3333-3333-3333-333333333333'")
 await db.exec('set role authenticated')
 const staged=(await q('select public.project_summaries() item')).map(x=>x.item).find(x=>x.slug==='algebra')
 assert.deepEqual(staged.stageProgress.map(x=>x.label),['Basics','Rings'])
 assert.deepEqual(staged.stageProgress.map(x=>x.total),[2,1])
 assert.deepEqual(staged.stageProgress.map(x=>x.done),[1,0])
 assert.deepEqual(staged.stageProgress.map(x=>x.schedule),['dated','behind'])
 assert.equal(staged.stageProgress[1].overdue,1)
 assert.equal(staged.scheduleHeadline,'1 overdue')
 assert.equal(summaries.some(x=>x.slug==='system'||x.slug==='private'),false)
 console.log('PASS ST-5 project summaries, checkpoint progress, counts and RLS')
 const percent=(await q("select public.search_cards_page('%',null,50,0) item")).map(x=>x.item)
 assert.deepEqual(percent.map(x=>x.noteNo),[12]);assert.equal(percent[0].openComments,1)
 const underscore=(await q("select public.search_cards_page('_',null,50,0) item")).map(x=>x.item)
 assert.deepEqual(underscore.map(x=>x.noteNo),[12])
 assert.equal((await q("select count(*)::int n from public.search_cards_page('',null,50,50)"))[0].n,0)
 console.log('PASS ST-5 literal search, comments and bounded pages')

 // D6: filters run in SQL *before* paging, and never return another owner.
 const filtered=(args)=>q('select public.search_cards_filtered_page('+args+') item')
 const pageAll=(await filtered("'',null,null,null,null,null,0")).map(x=>x.item)
 assert.deepEqual(pageAll.map(x=>x.noteNo),[13,12])
 assert.deepEqual((await filtered("'%',null,null,null,null,null,0")).map(x=>x.item.noteNo),[12])
 assert.deepEqual((await filtered("'',null,'CP2',null,null,null,0")).map(x=>x.item.noteNo),[12])
 assert.deepEqual((await filtered("'',null,null,0,null,null,0")).map(x=>x.item.noteNo),[13])
 assert.deepEqual((await filtered("'',null,null,2,null,null,0")).map(x=>x.item.noteNo),[12])
 assert.deepEqual((await filtered("'',null,null,null,'active',true,0")).map(x=>x.item.noteNo),[12])
 assert.deepEqual((await filtered("'',null,null,null,'active',false,0")).map(x=>x.item.noteNo),[13])
 assert.deepEqual((await filtered("'',null,null,null,'suspended',null,0")).map(x=>x.item.noteNo),[])
 assert.deepEqual((await filtered("'',null,null,null,null,null,1")).map(x=>x.item.noteNo),[12])
 assert.deepEqual((await filtered("'','private',null,null,null,null,0")).map(x=>x.item.noteNo),[])
 await db.exec("select set_config('test.uid','"+other+"',false)")
 assert.deepEqual((await filtered("'',null,null,null,null,null,0")).map(x=>x.item.noteNo),[14])
 await db.exec("select set_config('test.uid','"+owner+"',false)")
 console.log('PASS ST-5 filtered card pages, stable offsets and owner isolation')

 const home=(await q('select public.home_summary() result'))[0].result
 assert.deepEqual(home.projects.map(x=>x.slug),['algebra'])
 assert.equal(home.due,2);assert.equal(home.pendingProposals,1)
 assert.equal(home.resume.checkpointCode,'CP2');assert.equal(home.resume.step,2)
 assert.equal(home.resume.question,'Why closure?');assert.equal(home.resume.objective,'Prove closure')
 console.log('PASS ST-5 Today resume, due quotas and archive exclusion')
 const deck=(await q('select public.deck_tree() item')).map(x=>x.item)
 assert.equal(deck.length,1)
 assert.equal(deck[0].key,'project:algebra')
 assert.equal(deck[0].due,2)
 assert.deepEqual(deck[0].children.map(x=>x.key),['cp:algebra:CP2'])
 assert.deepEqual(deck[0].children.map(x=>x.due),[1])
 console.log('PASS ST-5 deck hierarchy, daily due counts and unassigned notes')

 await db.exec('reset role')
 await db.exec("update public.settings set reviews_per_day=1,new_per_day=0 where user_id='"+owner+"'")
 await db.exec('set role authenticated')
 assert.equal((await q('select public.home_summary() result'))[0].result.due,1)
 await db.exec("select set_config('test.uid','"+other+"',false)")
 const privateHome=(await q('select public.home_summary() result'))[0].result
 assert.deepEqual(privateHome.projects.map(x=>x.slug),['private'])
 assert.equal(privateHome.pendingProposals,0);assert.equal(privateHome.due,1)
 console.log('PASS ST-5 review caps and cross-owner isolation')

 // Scale regression: 100 unstaged checkpoints must produce 13 bounded groups,
 // not 100 barcode ticks or a second checkpoint download.
 await db.exec('reset role')
 await db.exec([
  "insert into public.projects values ('12121212-1212-1212-1212-121212121212','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','long-plan','Long plan','active',false,false,null,null,now());",
  "insert into public.checkpoints(id,user_id,project_id,code,title,position,status,current_step,steps,objective) select md5('stress-cp-'||n::text)::uuid,'11111111-1111-1111-1111-111111111111','12121212-1212-1212-1212-121212121212','CP'||n,'Checkpoint '||n,n,'not_started',0,jsonb_build_array('Read'),'Study' from generate_series(1,100) n;"
 ].join('\n'))
 await db.exec("select set_config('test.uid','"+owner+"',false); set role authenticated;")
 const longPlan=(await q('select public.project_summaries() item')).map(x=>x.item).find(x=>x.slug==='long-plan')
 assert.equal(longPlan.total,100)
 assert.equal(longPlan.stageProgress.length,13)
 assert.equal(longPlan.stageProgress[0].label,'CP1–CP8')
 assert.equal(longPlan.stageProgress.at(-1).label,'CP97–CP100')
 assert.ok(longPlan.stageProgress.every(x=>x.total<=8))
 await db.exec('reset role')
 await db.exec("update public.checkpoints set stage='Stage ' || (1 + floor((position-1)/7))::int where project_id='12121212-1212-1212-1212-121212121212'")
 await db.exec('set role authenticated')
 const stagedLong=(await q('select public.project_summaries() item')).map(x=>x.item).find(x=>x.slug==='long-plan')
 assert.equal(stagedLong.stageProgress.length,15)
 assert.equal(stagedLong.stageProgress[0].label,'Stage 1')
 assert.equal(stagedLong.stageProgress.at(-1).label,'Stage 15')
 console.log('PASS ST-5 100-checkpoint automatic groups and 15-stage summaries')

 // Populate historical metrics only after the earlier Today/deck quota assertions.
 await db.exec('reset role')
 await db.exec([
  "insert into public.sessions(id,user_id,project_id,checkpoint_id,number,resume_step,resume_question,last_activity_at,state,started_at,minutes) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',null,4,null,null,now(),'ended',now()-interval '10 minutes',45);",
  "insert into public.reviews values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4','11111111-1111-1111-1111-111111111111',2,null,now()-interval '10 minutes',3,'sure',1800),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5','99999999-9999-9999-9999-999999999999',2,null,now()-interval '10 minutes',1,'guess',2000);",
  "insert into public.session_events values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111','evidence','demonstrated',now()-interval '10 minutes');",
  "insert into public.concepts values('ffffffff-ffff-ffff-ffff-ffffffffffff','11111111-1111-1111-1111-111111111111','Groups');",
  "insert into public.misconceptions values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef','11111111-1111-1111-1111-111111111111','ffffffff-ffff-ffff-ffff-ffffffffffff','Closure',3);"
 ].join('\n'))
 await db.exec("select set_config('test.uid','"+owner+"',false); set role authenticated;")
 const insights=(await q('select public.insights(7) result'))[0].result
 assert.equal(insights.days,7)
 assert.equal(insights.reviewDays.length,7)
 assert.equal(insights.reviews,1);assert.equal(insights.right,1)
 assert.equal(insights.reviewDays.reduce((sum,d)=>sum+d.good,0),1)
 assert.deepEqual(insights.calibration.map(x=>x.confidence),['sure','unsure','guess'])
 assert.deepEqual(insights.calibration.map(x=>x.total),[1,0,0])
 assert.equal(insights.sessions,1);assert.equal(insights.minutes,45)
 assert.equal(insights.typicalSession,45)
 assert.equal(insights.subjectMinutes.length,1)
 assert.equal(insights.subjectMinutes[0].subject.name,'Algebra')
 assert.equal(insights.subjectMinutes[0].minutes,45)
 assert.equal(insights.checkpointDays.length,28)
 assert.equal(insights.checkpointDays.reduce((sum,d)=>sum+d.demonstrated,0),1)
 assert.deepEqual(insights.mostRevisited,{label:'Closure',times:3,conceptName:'Groups'})
 assert.equal((await q('select public.insights(900) result'))[0].result.reviewDays.length,90)
 await db.exec("select set_config('test.uid','"+other+"',false)")
 const otherInsights=(await q('select public.insights(7) result'))[0].result
 assert.equal(otherInsights.reviews,1);assert.equal(otherInsights.right,0)
 assert.equal(otherInsights.sessions,0);assert.equal(otherInsights.minutes,0)
 assert.equal(otherInsights.mostRevisited,null)
 assert.deepEqual(otherInsights.subjectMinutes,[])
 console.log('PASS ST-5 bounded Insights aggregates, study metrics and owner isolation')

 // Large library: pagination is capped at 50, ordered consistently, and
 // does not fetch the remaining 70 rows until requested.
 await db.exec('reset role')
 await db.exec("insert into public.notes(id,user_id,project_id,checkpoint_id,no,front,back,type,kind,status) "+
  "select md5('st5-page-note-'||n::text)::uuid,'"+owner+"','12121212-1212-1212-1212-121212121212',null,1000+n,"+
  "'Paged card '||n,'Answer','basic','why','active' from generate_series(1,120) n")
 await db.exec("select set_config('test.uid','"+owner+"',false); set role authenticated;")
 const pageAt=async(offset)=>(await q("select public.search_cards_filtered_page('', 'long-plan', null, null, null, null, "+offset+") item")).map(x=>x.item)
 const firstPage=await pageAt(0),secondPage=await pageAt(50),thirdPage=await pageAt(100)
 assert.deepEqual([firstPage.length,secondPage.length,thirdPage.length,(await pageAt(150)).length],[50,50,20,0])
 assert.equal(firstPage[0].noteNo,1120)
 assert.equal(firstPage.at(-1).noteNo,1071)
 assert.equal(secondPage[0].noteNo,1070)
 assert.equal(thirdPage.at(-1).noteNo,1001)
 console.log('PASS ST-5 120-card library uses stable bounded 50-row pages')


 // ST-5/E1 extreme-library acceptance: even with 60 active projects and
 // 100 checkpoints each, Today and Insights must transfer < 200 kB.
 // Build the fixture in the isolated PostgreSQL database, never production.
 await db.exec('reset role')
 await db.exec([
  "insert into public.projects(id,user_id,subject_id,slug,title,status,pinned,system,last_activity_at) select md5('st5-scale-project-'||n)::uuid,'"+owner+"','22222222-2222-2222-2222-222222222222','scale-'||n,'Scale project '||n,'active',false,false,now() from generate_series(1,58) n;",
  "insert into public.checkpoints(id,user_id,project_id,code,title,position,status,current_step,steps,objective) select md5('st5-scale-checkpoint-'||p.n||'-'||c.n)::uuid,'"+owner+"',md5('st5-scale-project-'||p.n)::uuid,'CP'||c.n,'Checkpoint '||c.n,c.n,'not_started',0,jsonb_build_array('Read'),'Study' from generate_series(1,58) p(n) cross join generate_series(1,100) c(n);"
 ].join('\n'))
 await db.exec("select set_config('test.uid','"+owner+"',false); set role authenticated;")
 const scaleSummaries=(await q('select public.project_summaries() item')).map(x=>x.item)
 assert.equal(scaleSummaries.filter(x=>x.status==='active').length,60)
 assert.ok(scaleSummaries.filter(x=>x.slug.startsWith('scale-')).every(x=>x.stageProgress.length===13))
 const scaleHome=(await q('select public.home_summary() result'))[0].result
 assert.equal(scaleHome.projects.length,60)
 assert.ok(Buffer.byteLength(JSON.stringify(scaleHome),'utf8')<200000,
  'Today aggregate must transfer under 200 kB')
 assert.ok(!scaleHome.projects.some(x=>'sourceTitles' in x),
  'Today excludes source-title arrays')
 // A project may have 100 checkpoints but zero due. The deck RPC must
 // return only due checkpoint children, not download the entire plan tree.
 const scaleDeck=(await q('select public.deck_tree() item')).map(x=>x.item)
 assert.equal(scaleDeck.length,60)
 assert.ok(scaleDeck.every(p=>p.children.every(c=>c.due>0)))
 assert.ok(scaleDeck.filter(p=>p.key.startsWith('project:scale-'))
  .every(p=>p.children.length===0))
 assert.ok(Buffer.byteLength(JSON.stringify(scaleDeck),'utf8')<200000,
  'Review deck tree must remain bounded for 60 projects / 6,000 checkpoints')
 const scaleInsights=(await q('select public.insights(90) result'))[0].result
 assert.ok(Buffer.byteLength(JSON.stringify(scaleInsights),'utf8')<200000,
  'Insights aggregate must transfer under 200 kB')
 console.log('PASS ST-5 60-project/5,900-checkpoint aggregate transfer budgets')


} finally {await db.close()}
