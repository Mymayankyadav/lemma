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
  'create table public.checkpoints(id uuid primary key,user_id uuid,project_id uuid,code text,title text,position int,status text,current_step int,steps jsonb,objective text);',
  'create table public.checkpoint_prereqs(user_id uuid,checkpoint_id uuid,prereq_id uuid);',
  'create table public.notes(id uuid primary key,user_id uuid,project_id uuid,checkpoint_id uuid,no bigint,front text,back text,type text,kind text,status text);',
  'create table public.cards(id uuid primary key,user_id uuid,note_id uuid,state int,due timestamptz);',
  'create table public.sessions(id uuid primary key,user_id uuid,project_id uuid,checkpoint_id uuid,number int,resume_step int,resume_question text,last_activity_at timestamptz,state text);',
  'create table public.sources(id uuid primary key,user_id uuid,project_id uuid,title text,position int);',
  'create table public.card_comments(id uuid primary key,user_id uuid,note_id uuid,status text);',
  'create table public.settings(user_id uuid primary key,reviews_per_day int,new_per_day int,time_zone text,rollover_hour int);',
  'create table public.reviews(id uuid primary key,user_id uuid,state_before int,undone_at timestamptz,reviewed_at timestamptz);',
  'create table public.proposals(id uuid primary key,user_id uuid,status text);',
  'grant usage on schema public to authenticated;',
  'grant select on all tables in schema public to authenticated;'
 ].join('\n'))
 for(const name of ['subjects','projects','checkpoints','checkpoint_prereqs','notes','cards','sessions','sources','card_comments','settings','reviews','proposals']){
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
  "insert into public.sessions values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','77777777-7777-7777-7777-777777777772',3,2,'Why closure?',now(),'open');",
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
 assert.equal(summaries.some(x=>x.slug==='system'||x.slug==='private'),false)
 console.log('PASS ST-5 project summaries, checkpoint progress, counts and RLS')
 const percent=(await q("select public.search_cards_page('%',null,50,0) item")).map(x=>x.item)
 assert.deepEqual(percent.map(x=>x.noteNo),[12]);assert.equal(percent[0].openComments,1)
 const underscore=(await q("select public.search_cards_page('_',null,50,0) item")).map(x=>x.item)
 assert.deepEqual(underscore.map(x=>x.noteNo),[12])
 assert.equal((await q("select count(*)::int n from public.search_cards_page('',null,50,50)"))[0].n,0)
 console.log('PASS ST-5 literal search, comments and bounded pages')
 const home=(await q('select public.home_summary() result'))[0].result
 assert.deepEqual(home.projects.map(x=>x.slug),['algebra'])
 assert.equal(home.due,2);assert.equal(home.pendingProposals,1)
 assert.equal(home.resume.checkpointCode,'CP2');assert.equal(home.resume.step,2)
 assert.equal(home.resume.question,'Why closure?');assert.equal(home.resume.objective,'Prove closure')
 console.log('PASS ST-5 Today resume, due quotas and archive exclusion')
 await db.exec('reset role')
 await db.exec("update public.settings set reviews_per_day=1,new_per_day=0 where user_id='"+owner+"'")
 await db.exec('set role authenticated')
 assert.equal((await q('select public.home_summary() result'))[0].result.due,1)
 await db.exec("select set_config('test.uid','"+other+"',false)")
 const privateHome=(await q('select public.home_summary() result'))[0].result
 assert.deepEqual(privateHome.projects.map(x=>x.slug),['private'])
 assert.equal(privateHome.pendingProposals,0);assert.equal(privateHome.due,1)
 console.log('PASS ST-5 review caps and cross-owner isolation')
} finally {await db.close()}
