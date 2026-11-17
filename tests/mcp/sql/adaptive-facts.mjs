// N169: evidence, flags, fact tables, derived-cache guards and undo, on the full migration chain.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const U=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const subject=U(1),project=U(2),cp1=U(3),cp2=U(4),sess1=U(5),sess2=U(6),conceptA=U(7),conceptB=U(8),conceptC=U(9);
const as=async who=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[who]);await db.exec('set role authenticated')};
const root=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
const progress=async(session,payload)=>{await root();return (await q('select public.save_progress($1,$2,$3,$4::jsonb) r',[owner,project,session,JSON.stringify(payload)]))[0].r};
const lastAction=async()=>Number((await q('select max(no) n from public.actions where user_id=$1',[owner]))[0].n);
const evidence=async(where='true')=>q('select * from public.evidence where '+where+' order by id');
const command=(resource,operation,id,patch,extra={})=>({schemaVersion:1,resource,operationId:randomUUID(),operation,target:id?{id}:undefined,patch,...extra});
const invoke=async p=>(await q('select public.adaptive_facts_command($1::jsonb) r',[JSON.stringify(p)]))[0].r;
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 for(const n of ['20261216000100_n169_time_plan_facts.sql','20261216000200_n169_evidence.sql','20261216000300_n169_fact_tables.sql','20261216000400_n169_derived_tables.sql','20261216000500_n169_save_progress_v2.sql'])assert(names.includes(n),'missing '+n);
 for(const n of names)await db.exec(await readFile(new URL(n,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.settings(user_id,connector_secret,time_zone,rollover_hour) values($1,$2,'Asia/Calcutta',4)",[owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret,time_zone,rollover_hour) values($1,$2,'UTC',4)",[other,'b'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal,target_date) values($1,$2,$3,'topo','Topology','Study','2026-11-20')",[project,owner,subject]);
 for(const [id,slug,name] of [[conceptA,'compactness','Compactness'],[conceptB,'hausdorff','Hausdorff'],[conceptC,'connected','Connectedness']])
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,$4,$5)",[id,owner,subject,slug,name]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,due_on) values($1,$2,$3,'CP1',1,'Compact','O','C',$4::jsonb,'2026-11-18'),($5,$2,$3,'CP2',2,'Second','O','C',$4::jsonb,'2026-11-19')",
  [cp1,owner,project,JSON.stringify(['a','b','c']),cp2]);
 await q("insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values($1,$2,$3),($1,$4,$3),($1,$4,$5)",[owner,cp1,conceptA,cp2,conceptB]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'g','socratic',$4)",[sess1,owner,project,cp1]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,2,'g','socratic',$4)",[sess2,owner,project,cp2]);

 // --- new columns and defaults
 const cp=(await q("select kind,tier,plan_state,pinned,self_reported,estimate_minutes from public.checkpoints where id=$1",[cp1]))[0];
 assert.deepEqual(cp,{kind:'learn',tier:'standard',plan_state:'active',pinned:false,self_reported:false,estimate_minutes:null});
 assert.equal((await q("select kind from public.checkpoints where id=$1",[cp2]))[0].kind,'learn','existing rows are not retyped by the migration');
 await q("insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,'CP9',9,'Cards K9','O','C','[\"x\"]')",[owner,project]);
 assert.equal((await q("select kind from public.checkpoints where code='CP9'"))[0].kind,'cards','new Cards K… checkpoints are typed on insert');
 assert.equal((await q("select public.lemma_flag($1,'recheck_v2') f",[owner]))[0].f,false);
 // a session started at 01:00 local belongs to the previous study day; the zone is recorded with it
 await q("insert into public.sessions(user_id,project_id,number,goal,style,started_at) values($1,$2,3,'g','socratic','2026-11-16T19:30:00Z')",[owner,project]);
 const day=(await q("select study_day::text d,time_zone from public.sessions where number=3"))[0];
 assert.deepEqual(day,{d:'2026-11-16',time_zone:'Asia/Calcutta'});

 // --- flag off: the previous behaviour, byte for byte (the loop is still there until the flag is on)
 await progress(sess1,{events:[{kind:'attempt',text:'proved it',outcome:'demonstrated',concept:'compactness'}]});
 assert.equal((await evidence()).length,0,'no evidence while recheck_v2 is off');
 await progress(sess1,{events:[{kind:'evidence',text:'criterion met',outcome:'demonstrated'}]});
 const legacy=(await q("select status,recheck_due from public.checkpoints where id=$1",[cp1]))[0];
 assert.equal(legacy.status,'demonstrated');assert.ok(legacy.recheck_due,'legacy recheck_due is still written with the flag off');
 await q("update public.checkpoints set status='not_started',recheck_due=null,demonstrated_at=null,current_step=0,recheck_level=0 where id=$1",[cp1]);
 await q("update public.settings set flags='{\"recheck_v2\":true}' where user_id=$1",[owner]);
 assert.equal((await q("select public.lemma_flag($1,'recheck_v2') f",[owner]))[0].f,true);

 // --- flag on: evidence, never a checkpoint-level recheck
 const r1=await progress(sess2,{events:[
   {kind:'attempt',text:'first try',outcome:'failed',concept:'hausdorff',level:'understand'},
   {kind:'attempt',text:'second try',outcome:'demonstrated',concept:'hausdorff',level:'understand',hint_level:3},
   {kind:'attempt',text:'no concept given, two candidates',outcome:'demonstrated'}]});
 assert.equal(r1.events,3);
 const ev=await evidence();
 assert.equal(ev.length,3);
 assert.deepEqual(ev.slice(0,2).map(e=>[e.outcome,e.level,e.hint_level,e.origin,e.confidence,e.concept_id]),[['fail','understand',0,'tutor',1,conceptB],['pass','understand',3,'tutor',1,conceptB]]);
 assert.equal(ev[2].concept_id,null,'ambiguous: stays unresolved, never invented');
 assert.ok(ev.every(e=>e.session_event_id&&e.project_id===project&&e.version===1));
 await progress(sess1,{events:[{kind:'pretest',text:'one candidate',outcome:'partial'}]});
 const one=(await evidence('kind=\'pretest\''))[0];
 assert.equal(one.concept_id,conceptA);assert.equal(one.confidence,0.7);assert.equal(one.level,'recall');assert.equal(one.outcome,'partial');
 await progress(sess1,{events:[{kind:'attempt',text:'recall answer',outcome:'failed',recall:true,concept:'compactness'}]});
 const rec=(await evidence('kind=\'recall\''))[0];assert.equal(rec.level,'recall');assert.equal(rec.outcome,'fail');
 await assert.rejects(progress(sess1,{events:[{kind:'attempt',text:'x',outcome:'failed',concept:'nope'}]}),/Unknown concept/);
 await assert.rejects(progress(sess1,{events:[{kind:'attempt',text:'x',outcome:'failed',level:'deep'}]}),/Invalid level/);
 const before=await evidence();
 await progress(sess1,{events:[{kind:'evidence',text:'criterion met cleanly',outcome:'demonstrated',concept:'compactness',level:'use'}]});
 const done=(await q("select status,recheck_due,recheck_level,needs_revisit,self_reported from public.checkpoints where id=$1",[cp1]))[0];
 assert.deepEqual(done,{status:'demonstrated',recheck_due:null,recheck_level:0,needs_revisit:false,self_reported:false},'demonstrating schedules no recheck');
 assert.equal((await evidence()).length,before.length+1);
 // an explicit recheck event is allowed on any checkpoint (concept rechecks are not checkpoint rechecks)
 await progress(sess2,{events:[{kind:'recheck',text:'warm',outcome:'demonstrated',concept:'hausdorff',level:'understand'}]});

 // --- undo restores evidence and the checkpoint exactly
 const countBefore=(await evidence()).length;
 await progress(sess2,{events:[{kind:'evidence',text:'criterion met',outcome:'demonstrated',concept:'hausdorff',level:'use'}]});
 assert.equal((await evidence()).length,countBefore+1);
 assert.equal((await q("select status from public.checkpoints where id=$1",[cp2]))[0].status,'demonstrated');
 const act=await lastAction();
 await as(owner);await q('select public.undo_action($1,$2,false)',[owner,act]);await root();
 assert.equal((await evidence()).length,countBefore,'undo removes the evidence row');
 assert.equal((await q("select status,recheck_due from public.checkpoints where id=$1",[cp2]))[0].status,'not_started','undo restores the checkpoint');

 // --- append-only; void follows the session event
 await root();
 await assert.rejects(q("update public.evidence set outcome='pass' where id=$1",[ev[0].id]),/append-only/);
 await q("update public.evidence set voided_at=now() where id=$1",[ev[0].id]);
 assert.equal((await q("select version from public.evidence where id=$1",[ev[0].id]))[0].version,2);
 const evEvent=(await q("select session_event_id from public.evidence where id=$1",[ev[1].id]))[0].session_event_id;
 await as(owner);
 const voidEnv={schemaVersion:1,resource:'session_event_corrections',operationId:randomUUID(),operation:'void',target:{id:String(evEvent)},patch:{reason:'mis-logged'}};
 assert.equal((await q('select public.void_session_event($1::jsonb) r',[JSON.stringify(voidEnv)]))[0].r.status,'ok');
 await root();
 assert.ok((await evidence('id=$1'.replace('$1',ev[1].id)))[0].voided_at,'voiding the event voids its evidence');
 // correcting an event re-states the evidence with the corrected outcome and hint level
 const evEvent3=(await q("select session_event_id from public.evidence where id=$1",[ev[2].id]))[0].session_event_id;
 await as(owner);
 const corr={schemaVersion:1,resource:'session_event_corrections',operationId:randomUUID(),operation:'correct',target:{id:String(evEvent3)},patch:{reason:'was partial',outcome:'partial',hintLevel:2}};
 assert.equal((await q('select public.correct_session_event($1::jsonb) r',[JSON.stringify(corr)]))[0].r.status,'ok');
 await root();
 const restated=await evidence('session_event_id<>'+evEvent3+' and checkpoint_id=\''+cp2+'\' and outcome=\'partial\' and hint_level=2');
 assert.equal(restated.length,1);
 assert.ok((await evidence('id='+ev[2].id))[0].voided_at);assert.equal((await evidence('id='+ev[2].id))[0].superseded_by,restated[0].id);

 // --- direct DML is closed for browsers on every new table
 await as(owner);
 for(const t of ['evidence','capacity_overrides','recheck_decisions','plan_baselines','rechecks','scheduler_runs']){
  assert.equal((await q("select has_table_privilege('authenticated',$1,'INSERT') i,has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d,has_table_privilege('authenticated',$1,'TRUNCATE') t,has_table_privilege('anon',$1,'INSERT') ai",['public.'+t]))[0].i,false,t+' insert');
  assert.deepEqual((await q("select has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d,has_table_privilege('authenticated',$1,'TRUNCATE') t,has_table_privilege('anon',$1,'INSERT') ai",['public.'+t]))[0],{u:false,d:false,t:false,ai:false},t);
 }
 await as(other);assert.equal((await q('select count(*)::int n from public.evidence'))[0].n,0,'RLS: other owners see no evidence');

 // --- fact tables: idempotent, versioned, undoable
 await as(owner);
 const mk=command('capacity_overrides','create',null,{on_date:'2026-11-18',minutes:90,reason:'travel'});
 const first=await invoke(mk);assert.equal(first.status,'ok');assert.ok(first.actionNo);
 assert.deepEqual(await invoke(mk),first,'exact retry returns the stored receipt');
 assert.equal((await invoke({...mk,patch:{on_date:'2026-11-18',minutes:10}})).status,'conflict');
 const capId=first.changed[0].id;
 await assert.rejects(invoke(command('capacity_overrides','create',null,{on_date:'2026-11-18',minutes:5})),/unique|duplicate/i);
 const stale=await invoke(command('capacity_overrides','update',capId,{minutes:60},{expectedVersion:7}));assert.equal(stale.status,'conflict');
 const upd=await invoke(command('capacity_overrides','update',capId,{minutes:60},{expectedVersion:1}));assert.equal(upd.status,'ok');assert.equal(upd.changed[0].version,2);
 await assert.rejects(invoke(command('capacity_overrides','create',null,{on_date:'2026-11-19',minutes:2000})),/violates|check/i);
 await assert.rejects(invoke(command('capacity_overrides','create',null,{on_date:'2026-11-19',minutes:5,bogus:1})),/Unknown capacity_overrides patch field/);
 await as(owner);await q('select public.undo_action($1,$2,false)',[owner,upd.actionNo]);await root();
 assert.equal((await q('select minutes from public.capacity_overrides where id=$1',[capId]))[0].minutes,90,'undo restores the previous minutes');
 await as(owner);
 const second=await invoke(command('capacity_overrides','create',null,{on_date:'2026-11-20',minutes:30}));
 assert.equal((await q('select count(*)::int n from public.capacity_overrides'))[0].n,2);
 await q('select public.undo_action($1,$2,false)',[owner,second.actionNo]);await root();
 assert.equal((await q('select count(*)::int n from public.capacity_overrides'))[0].n,1,'undoing the create removes the override');
 
 await as(owner);
 const dec=await invoke(command('recheck_decisions','create',null,{concept_id:conceptA,level:'use',action:'rate_easy'}));assert.equal(dec.status,'ok');
 await assert.rejects(invoke(command('recheck_decisions','update',dec.changed[0].id,{note:'x'},{expectedVersion:1})),/append-only/);
 const b0=await invoke(command('plan_baselines','create',null,{project_id:project,reason:'original plan'}));
 const b1=await invoke(command('plan_baselines','create',null,{project_id:project,reason:'approved re-date'}));
 assert.deepEqual([b0.changed[0].baseline_version,b1.changed[0].baseline_version],[0,1],'every approved re-date is a new version');
 const entries=(await q("select entries from public.plan_baselines where baseline_version=1"))[0].entries;
 assert.equal(entries.length,3);assert.ok(entries.some(e=>e.checkpoint_id===cp1&&e.due_on==='2026-11-18'),'baseline snapshots the current due dates');

 // --- derived caches: concrete prompts only, and never registered for undo
 await root();
 await assert.rejects(q("insert into public.rechecks(user_id,class_id,level,seq,state,prompt,stability,difficulty,last_review,created_day,input_hash) values($1,$2,'use',1,'open','Recheck CP2: Equivalence relations',1,5,'2026-11-17','2026-11-17','h')",[owner,conceptA]),/rechecks_prompt_concrete|violates/);
 await q("insert into public.rechecks(user_id,class_id,level,seq,state,prompt,stability,difficulty,last_review,created_day,input_hash) values($1,$2,'use',1,'open','Apply compactness to a problem you have not seen.',1,5,'2026-11-17','2026-11-17','h')",[owner,conceptA]);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name in ('rechecks','scheduler_runs')"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name in ('evidence','capacity_overrides','recheck_decisions','plan_baselines')"))[0].n,4);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where command_fn='adaptive_facts_command' and mcp_ok")) [0].n,3);
 console.log('PASS N169 evidence, flags, fact commands, undo, derived-cache guards');
}finally{await db.close()}
