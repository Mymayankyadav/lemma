// Isolated SQL gate. PGLite runs locally; NOTIF_TEST_DATABASE_URL uses the existing native PG17 fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openN196Postgres} from './fixtures/n196-pg-fixture.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const foundation=process.env.N196_FOUNDATION_DIR||root;
const db=process.env.NOTIF_TEST_DATABASE_URL ? await openN196Postgres(process.env.NOTIF_TEST_DATABASE_URL)
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
  for(const role of ['anon','authenticated','service_role']){
    await db.exec('set role '+role);
    await assert.rejects(q('select * from lemma_export_private.additional_tables'),/permission denied/,
      'Installer-owned export registrations stay private without changing existing ACLs');
    await db.exec('reset role');
  }
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  for(const [id,key] of [[owner,'a'],[other,'b']]){
    await q('insert into auth.users(id) values($1)',[id]);
    await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',[id,key.repeat(48)]);
    await q('insert into public.tasks(user_id,title,estimate_minutes) values ($1,$2,15)',[id,'task '+key]);
  }
  await db.exec('set role authenticated');
  await assert.rejects(q('select public.lemma_agenda_snapshot($1)',[other]),/permission denied|Verified owner/);
  await db.exec('reset role; set role service_role');
  const realCore=(await q("select to_regprocedure('public.lemma_planning_snapshot_mcp(uuid,text,jsonb)') is not null as present"))[0].present;
  if(!realCore){
    const [unknown]=await q('select public.lemma_agenda_snapshot($1) as host',[owner]);
    assert.equal(unknown.host.reason,'Evidence foundation unavailable');
    await db.exec(`reset role;create function public.lemma_planning_snapshot_mcp(p_owner uuid,p_kind text,p_args jsonb)
      returns jsonb language sql stable as $$ select jsonb_build_object('asOf',p_args->'p_as_of','watermark',p_args->'p_watermark')
        ||case when p_kind='calendar' then jsonb_build_object('status','ok','availability',null,'fixed','[]'::jsonb,
          'horizonEnd',p_args->'p_horizon_end') else '{"events":[],"nextAfter":null}'::jsonb end $$;
      set role service_role;`);
  }
  const [row]=await q('select public.lemma_agenda_snapshot($1) as host',[owner]), snapshot=row.host;
  assert.equal(snapshot.calendar.status,'ok');
  assert.equal(snapshot.watermark,snapshot.calendar.watermark);
  assert.deepEqual(snapshot.tasks.map(t=>t.title),['task a']);
  assert.equal(snapshot.rows.settings.connector_secret,undefined);
  const empty=snapshot.calendar.availability;
  assert.equal(empty,null,'unset capacity stays unknown');
  assert.ok(!JSON.stringify(snapshot).includes('task b'));
  console.log('N196 owner snapshot, SQL grants, clock, capacity and scope passed ('+(realCore?'N191':'independent contract fixture')+')');
  await db.exec('reset role');
  const subject=randomUUID(),project=randomUUID(),concept=randomUUID(),item=randomUUID();
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'algebra','Algebra','Prove')",[project,owner,subject]);
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'sets','Sets')",[concept,owner,subject]);
  await q("insert into public.items(id,user_id,origin,text,fingerprint) values($1,$2,'user_supplied','Synthetic proof item','n196-synthetic')",[item,owner]);
  await q(`insert into public.atlas_practice_bank(user_id,item_id,item_version,project_id,concept_id,facet,context,track,policy,bank,rubric,family,
    form,minutes,uncued,novel,valid_until) values($1,$2,1,$3,$4,'use','proof','track','p','bank','rubric','family','whole',15,true,true,now()+interval '3 days')`,
    [owner,item,project,concept]);
  await db.exec('set role service_role');
  const bankSql='select public.lemma_practice_bank_snapshot($1,statement_timestamp()) as bank';
  const [bank]=await q(bankSql,[owner]);assert.equal(bank.bank.length,1);assert.equal(bank.bank[0].arm,'atlas80');
  assert.deepEqual((await q(bankSql,[other]))[0].bank,[]);
  await db.exec('reset role');
  await q("update public.items set text='Revised exercise' where id=$1",[item]);
  await db.exec('set role service_role');
  assert.deepEqual((await q(bankSql,[owner]))[0].bank,[],'A revised item needs a current approved mapping');
  await db.exec('reset role');
  console.log('N196 registered bank owner scope, native route, and item-version invalidation passed');
  const today=(await q("select (now() at time zone 'UTC')::date::text as d"))[0].d;
  const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const start=shift(today,-35),anchors=Array(12).fill(0),pairAnchors=JSON.stringify([anchors,anchors]);
  const trial=randomUUID(),course='test-'+trial,certificate={track:course,bank:'bank1',rubric:'r1',policy:'p1',
    version:1,source:'randomized-pilot',validThrough:shift(today,7),routes:{'0-4':'hard72'},evidence:{'0-4':{
      atlas80:{n:100},hard72:{n:100,eligible:true,bounds:{transfer7:{lower:.1},abandon_rate:{upper:0},
        trigger_rate:{upper:0},feedback_share:{upper:0},idle_share:{upper:0}}}}}};
  const regSql='select public.lemma_trial_register($1,$2,$3,$4,$5)';
  const pairSql='select public.lemma_trial_assign($1,$2,$3::uuid[],$4::jsonb,$5::date) as arms';
  const grade='select public.lemma_trial_outcome($1,$2,$3,$4,$5)';
  const advance='select public.lemma_trial_advance($1,$2,$3) as state';
  const switches='select public.lemma_practice_controls($1,$2,$3)';
  const armSql="select public.lemma_trial_arm($1,$2,'p1','bank1','r1',$3::jsonb,$4) as arm";
  const registration=[trial,'synthetic-fixture',JSON.stringify(certificate),'hard72',start];
  const users=Array.from({length:54},()=>randomUUID());
  await q('insert into auth.users(id) select unnest($1::uuid[])',[users]);
  await db.exec('set role authenticated');
  await assert.rejects(q('select * from public.atlas_practice_pairs'),/denied/);
  await assert.rejects(q(switches,[true,true,true]),/denied|Research service/);
  await assert.rejects(q(regSql,registration),/denied|Research service/);
  await db.exec('reset role;set role service_role');
  await assert.rejects(q(regSql,registration),/current UTC/);
  await assert.rejects(q(regSql,[...registration.slice(0,4),shift(today,1)]),/current UTC/);
  // Only this new, disposable DB has a replay clock. The production function has no arguments and reads statement time.
  await db.exec(`reset role;create schema n196_fixture;create table n196_fixture.clock(at timestamptz not null);
    insert into n196_fixture.clock values(now());
    create or replace function public.lemma_trial_clock() returns timestamptz language sql stable security definer set search_path=''
      as $$select at from n196_fixture.clock$$;
    create function n196_fixture.dated(d date) returns void language sql security definer set search_path=''
      as $$update n196_fixture.clock set at=(d+time '12:00') at time zone 'UTC'$$;
    grant usage on schema n196_fixture to service_role; grant execute on function n196_fixture.dated(date) to service_role;
    set role service_role;`);
  const clock=day=>q('select n196_fixture.dated($1)',[day]);
  await clock(start);await q(regSql,registration);await q(regSql,registration);
  const first=[trial,randomUUID(),users.slice(0,2),pairAnchors,start];
  const nativeArms=['atlas80','atlas80'];
  assert.deepEqual((await q(pairSql,first))[0].arms,nativeArms,'Admission begins disabled');
  await q(switches,[true,true,true]);
  assert.deepEqual((await q(pairSql,[...first.slice(0,3),JSON.stringify([anchors,Array(12).fill(1)]),start]))[0].arms,nativeArms);
  assert.deepEqual((await q(pairSql,[...first.slice(0,3),JSON.stringify([[],anchors]),start]))[0].arms,nativeArms);
  let assigned;
  if(db.native){
    const independent=()=>db.transaction(async client=>{await client.query('set local role service_role');return (await client.query(pairSql,first)).rows[0].arms;});
    const [a,b]=await Promise.all([independent(),independent()]);assert.deepEqual(a,b);assigned=a;
  }else assigned=(await q(pairSql,first))[0].arms;
  assert.deepEqual([...assigned].sort(),['atlas80','hard72']);
  assert.deepEqual((await q(pairSql,first))[0].arms,assigned,'Denied pairs persisted no prior enrollment');
  await assert.rejects(q(pairSql,[trial,first[1],users.slice(0,2).reverse(),pairAnchors,start]),/Conflicting/);
  await assert.rejects(q(grade,[trial,users[0],shift(start,20),shift(start,20),1]),/Future assessment/);
  await assert.rejects(q(advance,[trial,shift(start,7),true]),/Future checkpoint/);
  const assignments=[assigned];
  for(let i=1;i<24;i++)assignments.push((await q(pairSql,[trial,randomUUID(),users.slice(i*2,i*2+2),pairAnchors,start]))[0].arms);
  const overflow=[trial,randomUUID(),users.slice(48,50),pairAnchors,start];
  assert.deepEqual((await q(pairSql,overflow))[0].arms,nativeArms);
  await clock(shift(start,1));
  await assert.rejects(q(pairSql,[trial,randomUUID(),users.slice(50,52),pairAnchors,start]),/current UTC/);
  assert.deepEqual((await q(pairSql,first))[0].arms,assigned,'Historical exact retry retains original randomization');
  const participant=users[assigned.indexOf('hard72')],partner=users[assigned.indexOf('atlas80')];
  assert.equal((await q(armSql,[participant,course,JSON.stringify(anchors),start+'T12:00:00Z']))[0].arm,'hard72');

  // The real question is opened explicitly. Both the arm and rated probability are frozen before any outcome.
  await db.exec(`reset role;create or replace function public.lemma_plan_released() returns boolean language sql stable as $$select true$$;
    grant execute on function public.lemma_plan_released() to service_role;`);
  const project2=randomUUID(),concept2=randomUUID(),subject2=randomUUID(),challenge=randomUUID(),base=randomUUID();
  await q("insert into public.settings(user_id,connector_secret) values ($1,$2)",[participant,'d'.repeat(48)]);
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Synthetic','M','cyan')",[subject2,participant]);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'test','Synthetic','Verify')",[project2,participant,subject2]);
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'test','Concept')",[concept2,participant,subject2]);
  for(const [id,question] of [[challenge,'Question A'],[base,'Question B']]){
    await q("insert into public.items(id,user_id,origin,text,fingerprint) values($1,$2,'user_supplied',$3,$3)",[id,participant,question]);
    await q(`insert into public.atlas_practice_bank(user_id,item_id,item_version,project_id,concept_id,facet,context,track,policy,bank,rubric,
      family,form,minutes,uncued,novel,registered_at,valid_until) values($1,$2,1,$3,$4,'use','proof',$5,'p1','bank1','r1','f','whole',15,true,true,$6,$7)`,
      [participant,id,project2,concept2,course,start,shift(today,7)]);
  }
  await db.exec('set role service_role');
  const deliver='select public.lemma_deliver_practice($1,$2,$3::jsonb) as receipt';
  const selection={scope:{owner:participant,project:project2,concept:concept2,facet:'use',context:'proof',track:course,bank:'bank1',rubric:'r1',policy:'p1'},
    arm:'hard72',questionId:challenge,itemVersion:1,nativeQuestionId:base,nativeVersion:1,native:.74,nativeItemProbability:.81};
  const request=randomUUID(),request2=randomUUID(),delivery=[participant,request,JSON.stringify(selection)];
  assert.equal((await q(deliver,[partner,randomUUID(),JSON.stringify(selection)]))[0].receipt.status,'unavailable');
  let opened;
  if(db.native){
    const independent=()=>db.transaction(async client=>{await client.query('set local role service_role');return (await client.query(deliver,delivery)).rows[0];});
    const [a,b]=await Promise.all([independent(),independent()]);assert.deepEqual(a,b);opened=a;
  }else [opened]=await q(deliver,delivery);
  assert.equal(opened.receipt.question,'Question A');assert.equal(opened.receipt.arm,'hard72');
  assert.equal(opened.receipt.projectId,project2);
  assert.deepEqual((await q(deliver,delivery))[0].receipt,opened.receipt);
  await db.exec('reset role');
  assert.equal((await q('select count(*)::int as n from public.atlas_practice_exposures where user_id=$1 and request_id=$2',[participant,request]))[0].n,1);
  assert.equal((await q('select count(*)::int as n from public.command_receipts where user_id=$1 and operation_id=$2',[participant,request]))[0].n,1);
  const crossCommand=randomUUID();
  for(const resource of ['tasks','study_entries','session_progress']){
    const operation=randomUUID();
    await q('insert into public.command_receipts(user_id,operation_id,resource,result) values($1,$2,$3,$4::jsonb)',
      [participant,operation,resource,JSON.stringify({status:'ok',_request:{resource}})]);
    await db.exec('set role service_role');
    await assert.rejects(q(deliver,[participant,operation,JSON.stringify(selection)]),/operationId payload conflict/);
    await db.exec('reset role');
    assert.equal((await q('select count(*)::int as n from public.atlas_practice_exposures where user_id=$1 and request_id=$2',[participant,operation]))[0].n,0);
  }
  await q('insert into public.command_receipts(user_id,operation_id,resource,result) values($1,$2,\'tasks\',\'{"status":"ok"}\')',[participant,crossCommand]);
  // A legacy receipt is never an authoritative question response.
  await q("update public.command_receipts set result=jsonb_set(result,'{question}','\"Forged receipt text\"') where user_id=$1 and operation_id=$2",[participant,request]);
  await db.exec('set role service_role');
  assert.deepEqual((await q(deliver,delivery))[0].receipt,opened.receipt);
  await q(switches,[false,true,false]); // Disabling forecast and enrollment leaves qualifying serving and follow-up intact.
  assert.equal((await q(armSql,[participant,course,JSON.stringify(anchors),start+'T12:00:00Z']))[0].arm,'hard72');
  assert.deepEqual((await q(pairSql,[trial,randomUUID(),users.slice(50,52),pairAnchors,shift(start,1)]))[0].arms,nativeArms);
  await q(switches,[true,false,false]);
  assert.equal((await q(deliver,[participant,request2,JSON.stringify(selection)]))[0].receipt.question,'Question B');
  assert.equal((await q(deliver,delivery))[0].receipt.status,'unavailable','An old challenger receipt cannot be reissued after rollback');
  await db.exec('reset role');
  const exposures=await q('select assigned_arm,actual_arm,native_probability from public.atlas_practice_exposures where user_id=$1 order by actual_arm',[participant]);
  assert.deepEqual(exposures,[{assigned_arm:'hard72',actual_arm:'atlas80',native_probability:.81},{assigned_arm:'hard72',actual_arm:'hard72',native_probability:.74}]);
  await assert.rejects(q("update public.atlas_practice_exposures set actual_arm='atlas80' where user_id=$1",[participant]),/immutable/);
  // A populated round is a materialized decision. Planning changes may only affect future decisions.
  const reviewRun=randomUUID(),reviewNote=randomUUID(),reviewCard=randomUUID();
  await q("insert into public.notes(id,user_id,project_id,front,back) values($1,$2,$3,'Existing question','Existing answer')",[reviewNote,participant,project2]);
  await q('insert into public.cards(id,user_id,note_id,ord) values($1,$2,$3,1)',[reviewCard,participant,reviewNote]);
  await q("insert into public.review_runs(id,user_id,scheduler_version,settings_version) values($1,$2,'native-v3',1)",[reviewRun,participant]);
  await q('insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version) values($1,$2,0,$3,1)',[participant,reviewRun,reviewCard]);
  const frozenRound=()=>q(`select to_jsonb(r) as run,(select jsonb_agg(to_jsonb(i) order by position) from public.review_run_items i where i.run_id=r.id) as items,
    (select to_jsonb(c) from public.cards c where c.id=$2) as card from public.review_runs r where r.id=$1`,[reviewRun,reviewCard]);
  const beforePreference=await frozenRound();
  await q("update public.settings set scheduling_algorithm='legacy' where user_id=$1",[participant]);
  await db.exec('set role service_role');
  await q(switches,[true,true,false]);
  assert.equal((await q(deliver,delivery))[0].receipt.status,'unavailable','Legacy opt-out prevents reissuing a challenger');
  const legacyRequest=randomUUID(),legacyDelivery=[participant,legacyRequest,JSON.stringify(selection)];
  assert.equal((await q(deliver,legacyDelivery))[0].receipt.arm,'atlas80','Legacy preference overrides independently qualified randomized serving');
  assert.ok((await q(bankSql,[participant]))[0].bank.every(i=>i.arm==='atlas80'));
  await db.exec('reset role');
  await q("update public.settings set scheduling_algorithm='new' where user_id=$1",[participant]);
  await db.exec('set role service_role');
  assert.deepEqual((await q(deliver,delivery))[0].receipt,opened.receipt,'Returning to New retains the original immutable assignment');
  assert.equal((await q(deliver,legacyDelivery))[0].receipt.arm,'atlas80','Changing preference preserves a materialized native question');
  await q(switches,[true,false,false]);
  await db.exec('reset role');
  assert.deepEqual(await frozenRound(),beforePreference,'New/Legacy preferences preserve every materialized round, item and FSRS field');
  await q("update public.atlas_practice_bank set valid_until=$3::date where user_id=$1 and item_id=$2",[participant,base,shift(start,1)]);
  await db.exec('set role service_role');
  assert.equal((await q(deliver,[participant,request2,JSON.stringify(selection)]))[0].receipt.status,'unavailable','Expired bank cannot reissue a native question');
  await db.exec('reset role');
  await q("update public.atlas_practice_bank set valid_until=$3::date where user_id=$1 and item_id=$2",[participant,base,shift(today,7)]);
  await q("update public.items set text='Withdrawn original question' where user_id=$1 and id=$2",[participant,base]);
  await db.exec('set role service_role');
  assert.equal((await q(deliver,[participant,request2,JSON.stringify(selection)]))[0].receipt.status,'unavailable','A revised item cannot reissue an old delivery');
  await db.exec('reset role');
  const session=randomUUID();
  await q("insert into public.sessions(id,user_id,project_id,number,goal,style) values($1,$2,$3,1,'Practice','socratic')",[session,participant,project2]);
  const score='select public.lemma_record_practice($1,$2,$3,$4::jsonb) as receipt';
  const scoreOperation=randomUUID(),outcome={result:'ok',hintLevel:0,novelty:'novel',minutes:12,sessionId:session};
  const scoreArgs=[participant,scoreOperation,request,JSON.stringify(outcome)];
  await db.exec('set role authenticated');
  await assert.rejects(q(score,scoreArgs),/permission denied|Verified owner/);
  await assert.rejects(q('select * from public.atlas_practice_scores'),/denied/);
  await db.exec('reset role;set role service_role');
  await assert.rejects(q(score,[partner,randomUUID(),request,JSON.stringify(outcome)]),/Question delivery not found/);
  await assert.rejects(q(score,[participant,crossCommand,request,JSON.stringify(outcome)]),/operationId payload conflict/);
  await assert.rejects(q(score,[participant,randomUUID(),request,JSON.stringify({...outcome,sessionId:randomUUID()})]),/Practice session outside owner/);
  await db.exec('reset role');
  const closedSession=randomUUID(),futureSession=randomUUID();
  await q("insert into public.sessions(id,user_id,project_id,number,goal,style,state,ended_at) values($1,$2,$3,2,'Old practice','socratic','ended',now())",[closedSession,participant,project2]);
  await q("insert into public.sessions(id,user_id,project_id,number,goal,style,started_at) values($1,$2,$3,3,'Future practice','socratic',now()+interval '1 day')",[futureSession,participant,project2]);
  await db.exec('set role service_role');
  await assert.rejects(q(score,[participant,randomUUID(),request,JSON.stringify({...outcome,sessionId:closedSession})]),/not open/);
  await assert.rejects(q(score,[participant,randomUUID(),request,JSON.stringify({...outcome,sessionId:futureSession})]),/not open yet/);
  for(const patch of [{result:'partial'},{hintLevel:1.5},{hintLevel:5},{novelty:'inferred'},{minutes:-1},{itemId:base}])
    await assert.rejects(q(score,[participant,randomUUID(),request,JSON.stringify({...outcome,...patch})]),/Invalid practice|Unknown practice/);
  let scored;
  if(db.native){
    const independent=()=>db.transaction(async client=>{await client.query('set local role service_role');return (await client.query(score,scoreArgs)).rows[0].receipt;});
    const [a,b]=await Promise.all([independent(),independent()]);assert.deepEqual(a,b);scored=a;
  }else scored=(await q(score,scoreArgs))[0].receipt;
  assert.equal(scored.status,'ok');assert.equal(scored.requestId,request);assert.ok(scored.actionNo);
  assert.deepEqual((await q(score,scoreArgs))[0].receipt,scored,'Lost score acknowledgement safely replays');
  await assert.rejects(q(score,[participant,randomUUID(),request,JSON.stringify(outcome)]),/already scored/);
  await assert.rejects(q(score,[participant,scoreOperation,request,JSON.stringify({...outcome,result:'fail'})]),/already scored/);
  await db.exec('reset role');
  const [canonical]=await q('select * from public.attempts where user_id=$1 and id=$2',[participant,scored.attemptId]);
  assert.equal((await q('select source from public.actions where user_id=$1 and no=$2',[participant,scored.actionNo]))[0].source,'app');
  assert.equal(canonical.grader,'learner');assert.equal(canonical.origin,'user');assert.equal(canonical.session_id,session);
  assert.equal(canonical.weight,1);
  assert.equal(canonical.project_id,project2);assert.equal(canonical.item_id,challenge);
  assert.deepEqual(canonical.context,{practice_request_id:request,item_version:1,novelty:'novel'});
  assert.ok(new Date(canonical.occurred_at)>new Date((await q('select served_at from public.atlas_practice_exposures where user_id=$1 and request_id=$2',[participant,request]))[0].served_at));
  const [tag]=await q('select concept_id,facet,role,result,hint_level from public.attempt_tags where user_id=$1 and attempt_id=$2',[participant,scored.attemptId]);
  assert.deepEqual(tag,{concept_id:concept2,facet:'use',role:'target',result:'ok',hint_level:0});
  assert.equal((await q('select count(*)::int as n from public.atlas_practice_scores where user_id=$1',[participant]))[0].n,1);
  await assert.rejects(q('update public.atlas_practice_scores set outcome=$1 where user_id=$2',[JSON.stringify({result:'fail'}),participant]),/immutable/);
  // A caller with old receipt privileges can neither forge a saved score nor repeat the canonical write.
  await q("update public.command_receipts set result='{}'::jsonb where user_id=$1 and operation_id=$2",[participant,scoreOperation]);
  await db.exec('set role service_role');
  assert.deepEqual((await q(score,scoreArgs))[0].receipt,scored);
  await db.exec('reset role');
  await q('delete from public.command_receipts where user_id=$1 and operation_id=any($2::uuid[])',[participant,[request,scoreOperation]]);
  await db.exec('set role service_role');
  await assert.rejects(q(score,[participant,request,request2,JSON.stringify(outcome)]),/operationId payload conflict/,
    'Deleting a legacy open receipt cannot reuse its immutable exposure ID for a score');
  await assert.rejects(q(deliver,[participant,scoreOperation,JSON.stringify(selection)]),/operationId payload conflict/,
    'Deleting a legacy score receipt cannot reuse its protected operation ID for an open');
  assert.deepEqual((await q(score,scoreArgs))[0].receipt,scored,'Protected acceptance still replays after a legacy receipt is removed');
  const scoreMcp='select public.lemma_record_practice($1,$2,$3,$4::jsonb,$5) as receipt';
  const noSessionArgs=[participant,randomUUID(),request2,JSON.stringify({result:'fail',hintLevel:2,novelty:'familiar'})];
  await assert.rejects(q(scoreMcp,[...noSessionArgs,'system']),/Invalid practice source/);
  const noSession=await q(scoreMcp,[...noSessionArgs,'chatgpt']);
  assert.equal(noSession[0].receipt.status,'ok','Native follow-up remains recordable after challenger rollback');
  assert.deepEqual((await q(score,noSessionArgs))[0].receipt,noSession[0].receipt,'Cross-client acknowledgement replay preserves the original action');
  await db.exec('reset role');
  assert.equal((await q('select source from public.actions where user_id=$1 and no=$2',[participant,noSession[0].receipt.actionNo]))[0].source,'chatgpt');
  assert.equal((await q('select weight from public.attempts where user_id=$1 and id=$2',[participant,noSession[0].receipt.attemptId]))[0].weight,.5);
  await db.exec('set role service_role');
  const [seen]=await q(score,[participant,randomUUID(),legacyRequest,JSON.stringify({result:'ok',hintLevel:0,novelty:'seen_solution'})]);
  await db.exec('reset role');
  assert.equal((await q('select weight from public.attempts where user_id=$1 and id=$2',[participant,seen.receipt.attemptId]))[0].weight,.2,
    'Seeing a solution never becomes full-strength clean evidence');
  await db.exec('set role service_role');
  await q('select public.undo_action($1,$2)',[participant,scored.actionNo]);
  assert.deepEqual((await q(score,scoreArgs))[0].receipt,scored,'Undo does not let an old retry re-add evidence');
  await db.exec('reset role');
  assert.equal((await q('select count(*)::int as n from public.attempts where user_id=$1 and id=$2',[participant,scored.attemptId]))[0].n,0);
  if(realCore){
    const transitions=await q("select kind from public.evidence_revisions where user_id=$1 and source='attempts' and fact_id=$2 order by revision",[participant,scored.attemptId]);
    assert.deepEqual(transitions.map(x=>x.kind),['record','void'],'Canonical score and undo enter immutable evidence history');
    await db.exec('set role service_role');
    const [latest]=await q('select public.lemma_agenda_snapshot($1) as host',[participant]);
    assert.deepEqual(latest.host.prelogged.find(p=>p.requestId===request).details,{form:'whole',family:'f',uncued:true,novel:true});
    const acceptedEvent=latest.host.evidence.find(e=>e.source==='attempts'&&e.payload?.context?.practice_request_id===request2);
    assert.ok(acceptedEvent,
      'The next authoritative decision receives the accepted native outcome through canonical evidence');
    assert.ok(Date.parse(acceptedEvent.occurredAt)<=Date.parse(acceptedEvent.reportedAt)&&Date.parse(acceptedEvent.reportedAt)<=Date.parse(acceptedEvent.knownAt),
      'Server-created practice evidence retains occurrence, reporting and acceptance order');
    await db.exec('reset role');
  }
  console.log('N196 shared command collision, concurrent open/score, canonical learner evidence, owner binding and undo passed');
  await db.exec('set role service_role');
  for(const n of [7,14]){
    const d=shift(start,n);await clock(d);
    const [checkpoint]=await q(advance,[trial,d,false]);assert.equal(checkpoint.state.stop,'','No report was due during this outage');
    if(n===7){
      await q(switches,[false,false,true]);
      assert.deepEqual([...(await q(pairSql,[...overflow.slice(0,4),d]))[0].arms].sort(),['atlas80','hard72'],'Previously capped pair may enter later');
      await q(switches,[false,false,false]);
    }
  }
  const due=shift(start,21);await clock(due);
  await assert.rejects(q(grade,[trial,users[0],shift(start,19),due,1]),/assessment/);
  await assert.rejects(q(grade,[trial,users[0],shift(start,20),shift(due,1),1]),/Future/);
  for(let i=0;i<24;i++)for(let j=0;j<2;j++)await q(grade,[trial,users[i*2+j],shift(start,20),due,assignments[i][j]==='hard72'?1:0]);
  await assert.rejects(q(grade,[trial,users[0],shift(start,20),due,assigned[0]==='hard72'?0:1]),/Conflicting/);
  const [promoted]=await q(advance,[trial,due,true]);
  assert.equal(promoted.state.promoted,true);assert.deepEqual(promoted.state.grades,[24,24,24]);
  assert.ok(promoted.state.benefit[0]>5);assert.equal(promoted.state.harm.length,1);
  await assert.rejects(q(advance,[trial,due,false]),/Conflicting/);
  const later=shift(due,7);await clock(later);
  assert.equal((await q(advance,[trial,later,false]))[0].state.stop,'monitor_unavailable');
  await q(switches,[false,true,true]);
  assert.deepEqual((await q(pairSql,[trial,randomUUID(),users.slice(50,52),pairAnchors,later]))[0].arms,nativeArms);
  assert.equal((await q(armSql,[participant,course,JSON.stringify(anchors),shift(start,14)+'T12:00:00Z']))[0].arm,'atlas80');
  console.log('N196 trusted clock, independent rollback, native and challenger delivery, immutable retries, caps and due-only outage passed');
  for(const mode of ['late','harm','expired']){
    await clock(start);
    const id=randomUUID(),track='test-'+id,expiry=mode==='expired'?start:shift(today,7);
    await q(regSql,[id,'monitor-fixture',JSON.stringify({...certificate,track,validThrough:expiry}),'hard72',start]);
    const n=mode==='harm'?24:1,assignedPairs=[];
    for(let i=0;i<n;i++){
      const subjects=users.slice(2*i,2*i+2),pair=(await q(pairSql,[id,randomUUID(),subjects,pairAnchors,start]))[0];
      assignedPairs.push({subjects,arms:pair.arms});
    }
    for(const offset of [7,14]){
      const d=shift(start,offset);await clock(d);await q(advance,[id,d,true]);
      if(mode==='expired'&&offset===7)assert.deepEqual((await q(pairSql,[id,randomUUID(),users.slice(50,52),pairAnchors,d]))[0].arms,nativeArms);
    }
    await clock(due);
    for(const pair of assignedPairs)for(const [j,person] of pair.subjects.entries()){
      if(mode==='late'&&pair.arms[j]==='hard72')continue;
      await q(grade,[id,person,shift(start,20),due,pair.arms[j]==='hard72'?0:1]);
    }
    if(mode==='late'){
      await clock(shift(due,1));
      const person=assignedPairs[0].subjects[assignedPairs[0].arms.indexOf('hard72')];
      await q(grade,[id,person,shift(start,20),due,1]); // Backdated report is actually visible tomorrow.
    }
    const [step]=await q(advance,[id,due,true]);
    if(mode!=='expired')assert.equal(step.state.stop,mode==='late'?'coverage':'harm');
  }
  if(realCore){
    const own=['atlas_practice_enrollments','atlas_practice_outcomes','atlas_practice_exposures','atlas_practice_bank','atlas_practice_scores'];
    await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:participant,role:'authenticated'})]);
    await db.exec('reset role;set role authenticated');
    const [handle]=await q('select public.begin_owner_export() as id');
    for(const name of own){
      const [browser]=await q('select public.lemma_export_page($1,null,100) as page',[name]);
      const [stable]=await q('select public.owner_export_page($1,$2,0,100) as page',[handle.id,name]);
      assert.ok(browser.page.rows.length>0);assert.equal(stable.page.rows.length,browser.page.rows.length);
      assert.ok(browser.page.rows.every(x=>x.user_id===participant&&!('pair' in x)&&!('position' in x)));
      assert.ok(!JSON.stringify(stable.page.rows).includes(partner));
    }
    await db.exec('reset role;set role service_role');
    for(const name of own){
      const [service]=await q('select public.lemma_export_page_for($1,$2,null,100) as page',[partner,name]);
      assert.ok(service.page.rows.every(x=>x.user_id===partner));
    }
    await q('select public.lemma_begin_account_delete($1)',[participant]);
    await assert.rejects(q(score,[participant,randomUUID(),request2,JSON.stringify({result:'ok',hintLevel:0,novelty:'novel'})]),/already scored|deletion/);
    await db.exec('reset role');
    await assert.rejects(q(`insert into public.atlas_practice_exposures select user_id,$2::uuid,trial,assigned_arm,actual_arm,
      item_id,item_version,question_text,served_at,scope,item_details,native_probability from public.atlas_practice_exposures
      where user_id=$1 limit 1`,[participant,randomUUID()]),/Account deletion/);
    await db.exec('set role service_role');
    assert.equal((await q('select public.lemma_purge_account_rows($1) as result',[participant]))[0].result.status,'purged');
    await db.exec('reset role');
    for(const name of own)assert.equal((await q('select count(*)::int as n from public.'+name+' where user_id=$1',[participant]))[0].n,0);
    assert.ok((await q('select count(*)::int as n from public.atlas_practice_enrollments where user_id=$1',[partner]))[0].n>0);
    console.log('N196 real browser, MCP and stable owner exports, pair isolation and confirmed purge passed');
  }
  console.log('N196 delayed actual visibility, harm, expired eligibility and immutable follow-up under rollback passed');
}finally{await db.close();}
