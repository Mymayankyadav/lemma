process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);process.exit(1);});
// N181: after the Atlas v3 cutover, correcting or voiding a session event also corrects or voids the attempts written from it.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const command=(operation,target,patch)=>({schemaVersion:1,resource:'session_event_corrections',operationId:randomUUID(),operation,target:{id:String(target)},patch});
const invoke=async p=>(await q('select public.correct_session_event($1::jsonb) r',[JSON.stringify(p)]))[0].r;
const asOwner=async()=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[owner]);await db.exec('set role authenticated');};
const live=async event=>q('select * from public.attempts where session_event_id=$1 and voided_at is null and superseded_by is null order by id',[event]);
const tags=async attempt=>q('select concept_id,facet,role,stage,result,hint_level from public.attempt_tags where attempt_id=$1 order by concept_id,facet,stage nulls first',[attempt]);
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261218000700_n181_atlas_attempts_follow_event.sql'));
 for(const n of names){try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}}
 assert.equal((await q("select has_function_privilege('authenticated','public.atlas_attempts_follow_event()','execute') x"))[0].x,false,'nobody calls the trigger function directly');

 await q('insert into auth.users values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[id(1),owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'topology','T','Understand')",[id(2),owner,id(1)]);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'compactness','Compactness'),($4,$2,$3,'cover','Open cover'),($5,$2,$3,'finite','Finite subcover')",[id(4),owner,id(1),id(6),id(7)]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style) values($1,$2,$3,1,'Learn','socratic')",[id(5),owner,id(2)]);
 // Four graded events, each with the legacy evidence written from it; the migration turns that evidence into attempts.
 const ev=[];
 for(let i=0;i<6;i++){
  const e=(await q("insert into public.session_events(user_id,session_id,kind,body,outcome,hint_level,occurred_at) values($1,$2,'attempt',$3,'demonstrated',null,$4) returning id",[owner,id(5),'Q'+i,new Date(Date.UTC(2026,10,1,10,i)).toISOString()]))[0].id;
  await q("insert into public.evidence(user_id,occurred_at,session_id,session_event_id,project_id,concept_id,level,outcome,kind,origin) values($1,$2,$3,$4,$5,$6,'use','pass','attempt','tutor')",[owner,new Date(Date.UTC(2026,10,1,10,i)).toISOString(),id(5),e,id(2),id(4)]);
  ev.push(e);
 }
 await q("select set_config('test.uid',$1,false)",[owner]);await q("select set_config('role','service_role',false)");
 await q('select public.atlas_v2_migrate($1::jsonb)',[JSON.stringify({owner,dry_run:false})]);
 await db.exec('reset role');
 for(const e of ev)assert.equal((await live(e)).length,1,'the migration links each attempt to its event');
 // A structured attempt on its own event (written after the cutover): two stages, a cued-free target, a required concept and one not reached.
 const se=(await q("insert into public.session_events(user_id,session_id,kind,body,outcome,hint_level,occurred_at) values($1,$2,'attempt','Prove it','partial',1,'2026-11-02T10:00:00Z') returning id",[owner,id(5)]))[0].id;
 const sa=(await q("insert into public.attempts(user_id,occurred_at,session_id,session_event_id,project_id,item_kind,furthest_stage,plan_score,context) values($1,'2026-11-02T10:00:00Z',$2,$3,$4,'practice','E',2,'{\"save_key\":\"k\",\"novelty\":\"novel\"}') returning id",[owner,id(5),se,id(2)]))[0].id;
 await q(`insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,stage,result,hint_level) values
  ($1,$2,$3,'use','target','U','ok',0),($1,$2,$3,'use','target','S','fail',1),($1,$2,$4,'recall','required','U','ok',0),($1,$2,$5,'use','target','C','not_reached',0)`,[owner,sa,id(4),id(6),id(7)]);
 const saTags=await tags(sa);
 await q("insert into public.instruction_events(user_id,occurred_at,session_id,concept_id,source_key) values($1,'2026-11-01T10:03:00Z',$2,$3,$4)",[owner,id(5),id(4),'event:'+ev[3]+':'+id(4)]);

 await asOwner();
 // 1. Correcting only the wording keeps the attempt exactly (stages, tags, outcome) and moves it to the new event.
 const body=await invoke(command('correct',se,{reason:'Typo',body:'Prove it properly'}));
 assert.equal(body.status,'ok');
 await db.exec('reset role');
 const [copy]=await live(body.revisedEventId);
 assert.ok(copy,'the corrected event has its attempt');
 assert.equal((await live(se)).length,0,'the old event keeps no live attempt');
 const old=(await q('select voided_at,superseded_by from public.attempts where id=$1',[sa]))[0];
 assert.ok(old.voided_at);assert.equal(String(old.superseded_by),String(copy.id));
 assert.equal(copy.furthest_stage,'E');assert.equal(copy.plan_score,2);assert.equal(copy.legacy_outcome,null);assert.equal(copy.item_kind,'practice');
 assert.equal(copy.context.save_key,undefined,'the copy is not a save-time duplicate of the original');assert.equal(String(copy.context.corrected_from),String(sa));
 assert.deepEqual(await tags(copy.id),saTags,'stages, results and hints are kept');

 // 2. Correcting the outcome re-states the attempt with the corrected result, one tag per concept and facet, unreached concepts left out.
 await asOwner();
 const outcome=await invoke(command('correct',body.revisedEventId,{reason:'Actually failed',outcome:'failed',hintLevel:2}));
 await db.exec('reset role');
 const [failed]=await live(outcome.revisedEventId);
 assert.equal(failed.legacy_outcome,'fail');assert.equal(failed.furthest_stage,null);assert.equal(failed.plan_score,null);
 assert.deepEqual((await tags(failed.id)).map(t=>[t.concept_id,t.facet,t.role,t.stage,t.result,t.hint_level]),
  [[id(4),'use','target',null,null,2],[id(6),'recall','required',null,null,2]]);

 // 4. A correction to an ungraded kind leaves no attempt.
 await asOwner();
 const note=await invoke(command('correct',ev[1],{reason:'Was a note',kind:'note',outcome:null}));
 await db.exec('reset role');
 assert.equal((await live(note.revisedEventId)).length,0);assert.equal((await live(ev[1])).length,0);

 // 4b. Review of #1510: a kind-only correction to a note keeps the event's outcome, yet leaves no attempt (evidence leaves none either).
 await asOwner();
 const kindOnly=await invoke(command('correct',ev[4],{reason:'Was a note',kind:'note'}));
 await db.exec('reset role');
 assert.equal((await q('select outcome from public.session_events where id=$1',[kindOnly.revisedEventId]))[0].outcome,'demonstrated','the outcome is kept');
 assert.equal((await live(kindOnly.revisedEventId)).length,0,'no attempt on a note');assert.equal((await live(ev[4])).length,0);
 assert.equal((await q('select count(*)::int n from public.evidence where session_event_id=$1 and voided_at is null',[kindOnly.revisedEventId]))[0].n,0,'evidence agrees');

 // 4c. Review of #1510: an item kind derived from the event kind follows the corrected kind (attempt → pretest: legacy → prepare), as evidence does.
 await asOwner();
 const pre=await invoke(command('correct',ev[2],{reason:'It was the pretest',kind:'pretest'}));
 await db.exec('reset role');
 const [prepared]=await live(pre.revisedEventId);
 assert.equal(prepared.item_kind,'prepare');assert.equal(prepared.legacy_outcome,'pass','an exact copy otherwise');
 assert.equal((await q('select kind from public.evidence where session_event_id=$1 and voided_at is null',[pre.revisedEventId]))[0].kind,'pretest');
 // An item kind set explicitly is kept: the structured practice attempt of step 1 stayed practice through its corrections.
 assert.equal(copy.item_kind,'practice');

 // 5. Voiding voids the attempt and the instruction events written from that event; undo restores both.
 await asOwner();
 const voided=await invoke(command('void',ev[3],{reason:'Not mine'}));
 await db.exec('reset role');
 assert.equal((await live(ev[3])).length,0);
 assert.ok((await q('select voided_at from public.instruction_events where source_key=$1',['event:'+ev[3]+':'+id(4)]))[0].voided_at);
 await asOwner();
 await q('select public.undo_action($1,$2,false)',[owner,voided.actionNo]);
 await db.exec('reset role');
 assert.equal((await live(ev[3])).length,1,'undo restores the attempt');
 assert.equal((await q('select voided_at from public.instruction_events where source_key=$1',['event:'+ev[3]+':'+id(4)]))[0].voided_at,null,'undo restores the instruction event');

 // 3. A migrated attempt follows an outcome correction too.
 await asOwner();
 const mig=await invoke(command('correct',ev[0],{reason:'Wrong grade',outcome:'partial'}));
 await db.exec('reset role');
 assert.equal((await live(mig.revisedEventId))[0].legacy_outcome,'partial');
 assert.equal((await live(ev[0])).length,0);

 // 6. Undo of that correction (the latest action) restores the original attempt and removes the re-stated one.
 await asOwner();
 await q('select public.undo_action($1,$2,false)',[owner,mig.actionNo]);
 await db.exec('reset role');
 assert.equal((await live(ev[0])).length,1,'the original attempt is live again');
 assert.equal((await q('select count(*)::int n from public.attempts where session_event_id=$1',[mig.revisedEventId]))[0].n,0,'the re-stated attempt is gone');

 // 7. An event no attempt came from (an owner before the cutover) corrects exactly as before.
 const plain=(await q("insert into public.session_events(user_id,session_id,kind,body,outcome) values($1,$2,'note','n',null) returning id",[owner,id(5)]))[0].id;
 const before=(await q('select count(*)::int n from public.attempts'))[0].n;
 await asOwner();
 assert.equal((await invoke(command('void',plain,{reason:'x'}))).status,'ok');
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.attempts'))[0].n,before);
 console.log('atlas-corrections: ok');
}finally{await db.close();}
