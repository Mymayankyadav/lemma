// NOTIF-1b isolated PostgreSQL acceptance: atomic actions, rollback and owner isolation.
// Runs in PGlite only; never connects to a live Supabase project.
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
const migrationUrl=new URL('../../supabase/migrations/20261101123000_notify_actions.sql',import.meta.url)
const migration=await readFile(migrationUrl,'utf8')
const notify=async(kind,key,facts={})=>(await q(
  "insert into public.notifications(user_id,kind,key,title,body,url,facts,due_at) values($1,$2,$3,'Test','Test body','#/review',$4::jsonb,now()) returning id",
  [owner,kind,key,JSON.stringify(facts)]
))[0].id
const act=async(id,action,extra={},user=owner)=>(await q(
  'select public.notify_act($1,$2,$3,$4::jsonb) result',
  [user,id,action,JSON.stringify(extra)]
))[0].result
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
 await q('insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,$3,$4,$5)',
   [subject,owner,'Analysis','A','amber'])
 await q('insert into public.projects(id,user_id,subject_id,slug,title,goal,status) values($1,$2,$3,$4,$5,$6,$7)',
   [project,owner,subject,'analysis','Analysis','Study','active'])
 const proposals=[]
 for(let i=0;i<5;i++){
   proposals.push((await q(
     "insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card',$3::jsonb,'claude') returning id,no",
     [owner,project,JSON.stringify({front:'Question '+i,back:'Answer '+i})]
   ))[0])
 }
 const invalid=(await q(
   "insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card',$3::jsonb,'claude') returning id",
   [owner,project,JSON.stringify({back:'Missing front'})]
 ))[0].id
 const otherSubject='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 const otherProject='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 await q('insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,$3,$4,$5)',
   [otherSubject,other,'Other','A','amber'])
 await q('insert into public.projects(id,user_id,subject_id,slug,title,goal,status) values($1,$2,$3,$4,$5,$6,$7)',
   [otherProject,other,otherSubject,'other','Other','Study','active'])
 const foreignProposal=(await q(
   "insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card',$3::jsonb,'claude') returning id",
   [other,otherProject,JSON.stringify({front:'Private',back:'Other owner'})]
 ))[0].id
 const tutor=await notify('tutor','tutor:batch')
 const due=await notify('due','due:today')
 const foreign=(await q(
   "insert into public.notifications(user_id,kind,key,title,body,url,due_at) values($1,'due','due:foreign','Test','Other','#/',now()) returning id",
   [other]
 ))[0].id
 const grants=await q(`select
  has_function_privilege('anon','public.notify_act(uuid,bigint,text,jsonb)','EXECUTE') anon,
  has_function_privilege('authenticated','public.notify_act(uuid,bigint,text,jsonb)','EXECUTE') authenticated,
  has_function_privilege('service_role','public.notify_act(uuid,bigint,text,jsonb)','EXECUTE') service,
  has_function_privilege('anon','public.approve_card_proposals(uuid,uuid[])','EXECUTE') batch_anon,
  has_function_privilege('authenticated','public.approve_card_proposals(uuid,uuid[])','EXECUTE') batch_authenticated`)
 assert.deepEqual(grants[0],{anon:false,authenticated:false,service:true,batch_anon:false,batch_authenticated:false})
 await db.exec('set role authenticated')
 await assert.rejects(act(due,'open'),/permission denied/)
 await db.exec('reset role')
 console.log('PASS NOTIF-1b service-only grants; no browser execution')

 await db.exec('set role service_role')
 assert.equal((await act(foreign,'open',{},owner)).status,'already_done')
 assert.equal((await q('select action from public.notifications where id=$1',[foreign]))[0].action,null)
 await assert.rejects(act(due,'approve_cards',{ids:proposals.map(p=>p.id)}),/bad_action/)
 assert.equal((await q('select action from public.notifications where id=$1',[due]))[0].action,null)
 const foreignBatch=(await q('select public.approve_card_proposals($1,ARRAY[$2::uuid]) result',
   [owner,foreignProposal]))[0].result
 assert.equal(foreignBatch.action,null)
 assert.deepEqual(foreignBatch.approved,[])
 assert.equal((await q('select status from public.proposals where id=$1',[foreignProposal]))[0].status,'pending')
 console.log('PASS NOTIF-1b foreign-owner claim, proposal batch and wrong-kind rollback')

 const before=(await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n
 const result=await act(tutor,'approve_cards',{ids:proposals.map(p=>p.id)})
 assert.equal(result.status,'done')
 assert.equal(result.kind,'tutor')
 assert.equal(result.approved.length,5)
 assert.ok(result.action)
 assert.ok(result.confirmId)
 const confirmation=(await q('select status,sent_at from public.notifications where id=$1 and user_id=$2',
   [result.confirmId,owner]))[0]
 assert.equal(confirmation.status,'sent','confirmation is returned by the service worker, never re-queued')
 assert.ok(confirmation.sent_at,'confirmation is already delivered to the action response')
 const afterConfirm=(await q('select public.notify_candidates($1,now()) data',[owner]))[0].data.history
 assert.equal(afterConfirm.sentToday,0,'confirmation does not consume daily notification cap')
 assert.equal(afterConfirm.lastSentAt,null,'confirmation does not delay ordinary notifications')
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,before+1)
 assert.equal((await q("select count(*)::int n from public.proposals where user_id=$1 and status='approved'",[owner]))[0].n,5)
 assert.equal((await q('select count(*)::int n from public.cards where user_id=$1',[owner]))[0].n,5)
 assert.equal((await act(tutor,'approve_cards',{ids:proposals.map(p=>p.id)})).status,'already_done')
 assert.equal((await q('select count(*)::int n from public.notifications where user_id=$1 and kind=$2',[owner,'confirm']))[0].n,1)
 console.log('PASS NOTIF-1b five approvals, one journal action, confirm and idempotency')

 const undo=await act(result.confirmId,'undo',{action:result.action})
 assert.equal(undo.status,'done')
 assert.equal((await q("select count(*)::int n from public.proposals where user_id=$1 and status='pending'",[owner]))[0].n,6)
 assert.equal((await q('select count(*)::int n from public.cards where user_id=$1',[owner]))[0].n,0)
 assert.equal((await act(result.confirmId,'undo',{action:result.action})).status,'already_done')
 console.log('PASS NOTIF-1b atomic undo and replay prevention')

 const bad=await notify('tutor','tutor:invalid')
 const actionsBefore=(await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n
 await assert.rejects(act(bad,'approve_cards',{ids:[invalid]}),/null value|not-null|violates/)
 assert.equal((await q('select action from public.notifications where id=$1',[bad]))[0].action,null)
 assert.equal((await q('select count(*)::int n from public.actions where user_id=$1',[owner]))[0].n,actionsBefore)
 console.log('PASS NOTIF-1b failed approval rolls back claim and journal')

 const later=await act(due,'later',{scope:'due'})
 assert.equal(later.status,'done')
 assert.equal((await q('select count(*)::int n from public.notify_holds where user_id=$1 and scope=$2',[owner,'due']))[0].n,1)
 const notToday=await notify('rhythm','rhythm:today')
 assert.equal((await act(notToday,'not_today',{scope:'rhythm'})).status,'done')
 assert.equal((await q('select count(*)::int n from public.notify_holds where user_id=$1 and scope=$2',[owner,'rhythm']))[0].n,1)
 const holdHours=async(scope)=>Number((await q(
   'select extract(epoch from ("until"-now()))/3600 as hours from public.notify_holds where user_id=$1 and scope=$2',
   [owner,scope]))[0].hours)
 assert.ok((await holdHours('due'))>1.9&&(await holdHours('due'))<2.1)
 assert.ok((await holdHours('rhythm'))>71.9&&(await holdHours('rhythm'))<72.1)
 const tutorLater=await notify('tutor','tutor:later')
 assert.equal((await act(tutorLater,'later',{scope:'tutor'})).status,'done')
 assert.ok((await holdHours('tutor'))>2.9&&(await holdHours('tutor'))<3.1)
 console.log('PASS NOTIF-1b Later (due 2h, tutor 3h) and Not today (rhythm 3d) holds')

 await db.exec('reset role')
 const privilegeBefore=await q(`select grantee,privilege_type,routine_name from information_schema.role_routine_grants
 where specific_schema='public' and routine_name in ('notify_act','approve_card_proposals')
 order by routine_name,grantee,privilege_type`)
 await db.exec('drop function public.notify_act(uuid,bigint,text,jsonb);drop function public.approve_card_proposals(uuid,uuid[])')
 await db.exec(migration)
 const privilegeAfter=await q(`select grantee,privilege_type,routine_name from information_schema.role_routine_grants
 where specific_schema='public' and routine_name in ('notify_act','approve_card_proposals')
 order by routine_name,grantee,privilege_type`)
 assert.deepEqual(privilegeAfter,privilegeBefore)
 console.log('PASS NOTIF-1b down/up grants parity')
}finally{await db.close()}
