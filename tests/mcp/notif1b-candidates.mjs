// NOTIF-1b: owner-scoped candidate snapshot and deck-tree quota parity.
// Isolated PGlite only; no external Supabase or notification delivery.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
const owner='11111111-1111-1111-1111-111111111111'
const other='99999999-9999-9999-9999-999999999999'
const subject='22222222-2222-2222-2222-222222222222'
const project='33333333-3333-3333-3333-333333333333'
const q=async(sql,params=[])=>(await db.query(sql,params)).rows
const setUser=async(id)=>db.exec("select set_config('test.uid','"+id+"',false)")
const facts=async(user=owner,at=new Date().toISOString())=>(await q(
 'select public.notify_candidates($1,$2::timestamptz) data',[user,at]))[0].data
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 const dir=new URL('../../supabase/migrations/',import.meta.url)
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
   await db.exec(await readFile(new URL(file,dir),'utf8'))
 await q('insert into auth.users(id) values($1),($2)',[owner,other])
 await setUser(owner)
 await db.exec('select public.bootstrap()')
 await q('update public.settings set time_zone=$1,rollover_hour=$2 where user_id=$3',['Asia/Calcutta',4,owner])
 await q('insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,$3,$4,$5)',
   [subject,owner,'Analysis','A','amber'])
 await q('insert into public.projects(id,user_id,subject_id,slug,title,goal,status,target_date) values($1,$2,$3,$4,$5,$6,$7,$8)',
   [project,owner,subject,'analysis','Analysis','Study','active','2026-10-29'])
 for(const [code,dueOn] of [['CP1','2026-11-02'],['CP2','2026-11-01'],['CP3','2026-10-25']]){
   await q('insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,due_on,steps) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
     [owner,project,code,Number(code.slice(2))*10,code+' Title','Learn','Prove',dueOn,JSON.stringify(['Understand'])])
 }
 let firstNote
 for(let i=0;i<2;i++){
   const note=(await q('insert into public.notes(user_id,project_id,front) values($1,$2,$3) returning id',
     [owner,project,'Question '+i]))[0].id
   if(i===0) firstNote=note
   await q('insert into public.cards(user_id,note_id,ord,state,due) values($1,$2,1,$3,$4)',
     [owner,note,i===0?0:2,'2026-10-20T00:00:00Z'])
 }
 // Two eligible siblings of the same note must still contribute only one
 // candidate, with the due review card preferred to the new sibling.
 await q('insert into public.cards(user_id,note_id,ord,state,due) values($1,$2,2,2,$3)',
   [owner,firstNote,'2026-10-19T00:00:00Z'])
 const proposals=[]
 for(let i=0;i<3;i++){
   proposals.push((await q(
     "insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card',$3::jsonb,'claude') returning id,no",
     [owner,project,JSON.stringify({front:'Card '+i,back:'Answer'})]
   ))[0])
 }
 await q("insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,'https://push.example.test/owner','publickey','authkey','Phone','android_web')",[owner])
 await db.exec('set role service_role')
 const current=await facts()
 assert.equal(current.tz,'Asia/Calcutta')
 assert.equal(current.rollover,4)
 assert.equal(current.due.count,2)
 assert.equal(current.due.backlog,2)
 assert.equal(current.devices.enabled,1)
 assert.equal(current.tutor.pending.card,3)
 assert.deepEqual(current.tutor.cardIds,proposals.map(p=>p.id))
 assert.deepEqual(current.tutor.cardNumbers,proposals.map(p=>Number(p.no)))
 assert.equal(current.week.daysStudied,0)
 assert.ok(current.history.lastByKey)
 assert.ok(current.history.dismissStreak)
 // Neither archived projects nor hidden system fixtures may generate a
 // reminder, even when their cards are overdue.
 for(const [slug,status,system] of [['archived-notify','archived',false],['zz-selftest-notify','active',true]]){
   const hiddenProject=(await q(
     'insert into public.projects(user_id,subject_id,slug,title,goal,status,system) values($1,$2,$3,$4,$5,$6,$7) returning id',
     [owner,subject,slug,slug,'Study',status,system]))[0].id
   const hiddenNote=(await q(
     'insert into public.notes(user_id,project_id,front) values($1,$2,$3) returning id',
     [owner,hiddenProject,'Hidden question']))[0].id
   await q('insert into public.cards(user_id,note_id,ord,state,due) values($1,$2,1,2,$3)',
     [owner,hiddenNote,'2026-10-20T00:00:00Z'])
 }
 const visibleOnly=await facts()
 assert.equal(visibleOnly.due.count,2)
 assert.equal(visibleOnly.due.backlog,2)
 console.log('PASS NOTIF-1b archived/system projects excluded from reminders')
 console.log('PASS NOTIF-1b K1/K5/K6/K8 shape and stable proposal IDs')
 // Backoff counts only consecutive dismissals, never total dismissals in the
 // last three actions. A tap resets the streak.
 for(const [i,action] of ['dismiss','open','dismiss'].entries()){
   await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at,action,action_at) values($1,'due',$2,'Test','Hello','#/',now(),$3,$4::timestamptz)",
     [owner,'due:streak:'+i,action,new Date(Date.now()-(5-i)*60000).toISOString()])
 }
 assert.equal((await facts()).history.dismissStreak.due,1)
 for(let i=3;i<5;i++){
   await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at,action,action_at) values($1,'due',$2,'Test','Hello','#/',now(),'dismiss',$3::timestamptz)",
     [owner,'due:streak:'+i,new Date(Date.now()-(5-i)*60000).toISOString()])
 }
 assert.equal((await facts()).history.dismissStreak.due,3)
 // Backoff is independent for each kind that changes its cadence or switches
 // off after three dismissals. A tap resets that kind, not every kind.
 for(const kind of ['behind','resume','rhythm']){
   for(let i=0;i<3;i++)await q(
     "insert into public.notifications(user_id,kind,key,title,body,url,due_at,action,action_at) values($1,$2,$3,'Test','Hello','#/',now(),'dismiss',$4::timestamptz)",
     [owner,kind,kind+':streak:'+i,new Date(Date.now()-(3-i)*60000).toISOString()])
 }
 let streaks=(await facts()).history.dismissStreak
 assert.deepEqual(Object.keys(streaks).sort(),['behind','due','resume','rhythm'])
 for(const kind of ['due','behind','resume','rhythm'])assert.equal(streaks[kind],3,kind+' streak')
 await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at,action,action_at) values($1,'behind','behind:reset','Test','Hello','#/',now(),'open',now())",[owner])
 await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at,action,action_at) values($1,'rhythm','rhythm:foreign','Test','Hello','#/',now(),'open',now())",[other])
 streaks=(await facts()).history.dismissStreak
 assert.equal(streaks.behind,0,'tap resets only behind')
 assert.equal(streaks.due,3)
 assert.equal(streaks.resume,3)
 assert.equal(streaks.rhythm,3,'other owner cannot reset rhythm')
 await q("update public.notifications set action_at=now()-interval '31 days' where user_id=$1 and kind='rhythm'",[owner])
 assert.equal((await facts()).history.dismissStreak.rhythm,0,'backoff expires after thirty days')
 console.log('PASS NOTIF-1b independent due/behind/resume/rhythm dismissal streaks and owner isolation')
 console.log('PASS NOTIF-1b dismissal streak resets on open and reaches three consecutive')
 await db.exec('reset role')
 await db.exec('set role authenticated')
 const deck=await q('select item from public.deck_tree() as t(item)')
 const total=deck.reduce((n,r)=>n+Number(r.item.due),0)
 assert.equal(current.due.count,total,'due quota must match the app deck_tree()')
 await assert.rejects(facts(),/permission denied/)
 await db.exec('reset role')
 console.log('PASS NOTIF-1b due.count equals deck_tree and owner-only function grants')

 await db.exec('set role service_role')
 const india=await facts(owner,'2026-11-01T01:00:00Z')
 assert.equal(india.today,'2026-11-01')
 assert.ok(india.tomorrow.some(x=>x.code==='CP1'))
 assert.ok(india.late.some(x=>x.code==='CP3'))
 assert.ok(india.pastTarget.some(x=>x.slug==='analysis'))
 assert.ok(india.tomorrow.length<=20&&india.late.length<=20&&india.pastTarget.length<=20)
 await db.exec('reset role')
 await q('update public.settings set time_zone=$1 where user_id=$2',['Europe/London',owner])
 await db.exec('set role service_role')
 const london=await facts(owner,'2026-11-01T01:00:00Z')
 assert.equal(london.today,'2026-10-31')
 assert.ok(london.tomorrow.some(x=>x.code==='CP2'))
 assert.ok(!london.tomorrow.some(x=>x.code==='CP1'))
 console.log('PASS NOTIF-1b Asia/Calcutta and Europe/London study-day rollover')
 await db.exec('reset role')

 await setUser(other)
 // The isolated test's fake random-byte extension is deterministic; assign a
 // distinct test-only connector token instead of colliding with the owner.
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'f'.repeat(48)])
 await q("insert into public.subjects(user_id,name,glyph,hue) values($1,'Other','A','amber')",[other])
 const otherSubject=(await q('select id from public.subjects where user_id=$1 limit 1',[other]))[0].id
 const otherProject=(await q("insert into public.projects(user_id,subject_id,slug,title,goal,status) values($1,$2,'other','Other','Study','active') returning id",[other,otherSubject]))[0].id
 await q("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card',$3::jsonb,'claude')",
   [other,otherProject,JSON.stringify({front:'Foreign',back:'Hidden'})])
 await db.exec('set role service_role')
 const isolated=await facts(owner)
 assert.equal(isolated.tutor.pending.card,3)
 assert.ok(!isolated.tutor.projects.includes('Other'))
 const foreign=await facts(other)
 assert.equal(foreign.tutor.pending.card,1)
 assert.equal(foreign.devices.enabled,0)
 console.log('PASS NOTIF-1b two-owner isolation for candidate facts')

 await db.exec('reset role')
 const migration=await readFile(new URL('../../supabase/migrations/20261101123100_notify_candidates.sql',import.meta.url),'utf8')
 const before=await q("select has_function_privilege('service_role','public.notify_candidates(uuid,timestamptz)','EXECUTE') ok")
 await db.exec('drop function public.notify_candidates(uuid,timestamptz)')
 await db.exec(migration)
 const after=await q("select has_function_privilege('service_role','public.notify_candidates(uuid,timestamptz)','EXECUTE') ok")
 assert.deepEqual(after,before)
 console.log('PASS NOTIF-1b candidate function down/up grants parity')
}finally{await db.close()}
