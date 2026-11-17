// N169: adaptive_migrate on a production-shaped fixture: dry run == real run, idempotent, one undoable action, service-role only.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const U=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const subject=U(1),project=U(2),notesSrc=U(3),bookSrc=U(4),sess=U(5),cA=U(10),cB=U(11),cC=U(12);
const cp=n=>U(100+n);
const root=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
const as=async who=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[who]);await db.exec('set role authenticated')};
const run=async p=>(await q('select public.adaptive_migrate($1::jsonb) r',[JSON.stringify({owner,...p})]))[0].r;
const state=async()=>(await q(`select (select count(*)::int from public.evidence) ev,(select count(*)::int from public.plan_baselines) pb,
  (select count(*)::int from public.checkpoints where kind='cards') cards,(select count(*)::int from public.checkpoints where step_meta is not null) meta,
  (select count(*)::int from public.checkpoints where estimate_minutes is not null) est,(select count(*)::int from public.checkpoints where recheck_due is not null) due,
  (select count(*)::int from public.diagnostics where status='dismissed') dismissed,(select last_study_on::text from public.projects where id='${project}') ls,
  (select capacity::text from public.settings where user_id='${owner}') cap,(select auto_prune_standard from public.projects where id='${project}') ap`))[0];
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const n of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())await db.exec(await readFile(new URL(n,dir),'utf8'));
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("insert into public.settings(user_id,connector_secret,time_zone) values($1,$2,'Asia/Calcutta')",[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal,target_date) values($1,$2,$3,'topology-1','Topology','Study','2026-11-20')",[project,owner,subject]);
 await q("insert into public.sources(id,user_id,project_id,title,short,kind) values($1,$2,$3,'Course notes','notes','notes'),($4,$2,$3,'Munkres','munkres','book')",[notesSrc,owner,project,bookSrc]);
 for(const [id,slug] of [[cA,'a-one'],[cB,'b-two'],[cC,'c-three']])await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,$4,$4)",[id,owner,subject,slug]);
 const mk=async(n,code,title,status,over={})=>q(`insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,status,source_id,recheck_due,recheck_prompt,needs_revisit)
   values($1,$2,$3,$4,$5,$6,'O','C',$7::jsonb,$8,$9,$10,$11,$12)`,[cp(n),owner,project,code,n,title,JSON.stringify(over.steps??['Read','Venture: extra problem']),status,over.source??bookSrc,over.due??null,over.prompt??null,over.revisit??false]);
 await mk(1,'CP1','Sets','demonstrated',{source:notesSrc,due:'2026-11-19',prompt:'Recheck CP1: Sets'});
 await mk(2,'CP2','Maps','demonstrated',{source:notesSrc,due:'2026-11-19',prompt:'Recheck CP2: Maps'});
 await mk(3,'CP3','Compact','demonstrated',{due:'2026-11-24',prompt:'Prove that a compact subset of a Hausdorff space is closed.',revisit:true});
 await mk(4,'CP4','Cards K1','not_started',{steps:['Draft cards']});
 await mk(5,'CP5','Homeo','not_started',{prompt:'Prove that a continuous bijection from a compact space to a Hausdorff space is a homeomorphism.'});
 await q("update public.checkpoints set kind='learn' where code='CP4'");   // production's existing rows predate the insert trigger
 await q("insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values($1,$2,$3),($1,$4,$3),($1,$5,$3),($1,$6,$3),($1,$6,$7)",[owner,cp(1),cA,cp(2),cp(3),cp(5),cB]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'g','socratic',$4)",[sess,owner,project,cp(1)]);
 const ev=(cpn,kind,outcome,hint)=>q("insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome,hint_level) values($1,$2,$3,$4,'x',$5,$6)",[owner,sess,cp(cpn),kind,outcome,hint]);
 await ev(1,'attempt','demonstrated',null);await ev(1,'evidence','demonstrated',null);await ev(2,'attempt','demonstrated',null);
 await ev(3,'attempt','failed',null);await ev(3,'attempt','demonstrated',3);await ev(5,'pretest','partial',null);await ev(5,'note',null,null);
 await q("insert into public.diagnostics(user_id,project_id,kind,topic,evidence,status) values($1,$2,'pace','Behind plan','about 30 days behind plan','confirmed'),($1,$2,'gap','Totality of maps','x','open')",[owner,project]);

 // --- guards
 await as(owner);await assert.rejects(run({}),/permission denied|service-role only/);
 await root();await assert.rejects(run({steps:['nope']}),/Unknown step/);await assert.rejects(q('select public.adaptive_migrate($1::jsonb)',[JSON.stringify({})]),/owner/);

 // --- dry run changes nothing and equals the real run
 const before=await state();
 const args={dry_run:true,time:{last_study_on:'2026-11-22'},capacity:{weekday_minutes:240},approve_tiers:true,auto_prune_projects:['topology-1'],dismiss_pace:true};
const dry=await run(args);
 assert.equal(dry.dry_run,true);assert.deepEqual(await state(),before,'a dry run rolls everything back');
 assert.equal(dry.time.projects_last_study_on_set,1);assert.equal(dry.typing.cards_typed,1);assert.equal(dry.typing.venture_steps,4);
 assert.equal(dry.evidence.created,6,'graded events only; notes are not evidence');assert.equal(dry.evidence.unresolved_total,1,'the two-concept checkpoint stays unresolved, never dropped');assert.equal(dry.tiers_written,2);
 assert.equal(dry.recheck_fields.dropped_no_gap,2);assert.equal(dry.recheck_fields.seeded_real_gap,1);assert.equal(dry.recheck_fields.plan_probes_kept_for_items,1);
 assert.equal(dry.diagnostics_pace_dismissed,1);assert.ok(dry.snapshot.projects.md5);
 const real=await run({...args,dry_run:false});
 assert.equal(real.dry_run,false);
 const {dry_run:_a,...realRest}=real,{dry_run:_b,...dryRest}=dry;
 assert.deepEqual(realRest,dryRest,'the dry run reports exactly what the real run does');
 const after=await state();
 assert.deepEqual({cards:after.cards,meta:after.meta,est:after.est,pb:after.pb,dismissed:after.dismissed,ls:after.ls,ap:after.ap},{cards:1,meta:5,est:5,pb:1,dismissed:1,ls:'2026-11-22',ap:true});
 assert.deepEqual(JSON.parse(after.cap),{weekday_minutes:240,review_share:0.25});
 assert.equal(after.due,1,'only the real-gap checkpoint keeps recheck_due; the two no-gap checkpoints lose theirs (the loop)');
 assert.equal((await q("select recheck_prompt from public.checkpoints where id=$1",[cp(1)]))[0].recheck_prompt,null,'a generic prompt is dropped');
 assert.match((await q("select recheck_prompt from public.checkpoints where id=$1",[cp(5)]))[0].recheck_prompt,/homeomorphism/,'a not-started checkpoint keeps its criterion-style prompt for the item layer');
 assert.deepEqual((await q("select tier,count(*)::int n from public.checkpoints group by tier order by tier")).map(r=>[r.tier,r.n]),[['core',2],['standard',3]],'course-notes checkpoints are core once tiers are approved');
 const tiers=(await q("select step_meta from public.checkpoints where id=$1",[cp(1)]))[0].step_meta;
 assert.deepEqual(tiers.map(s=>s.tier),[null,'venture'],'a Venture: step is a venture step; the other inherits its checkpoint tier, so approving tiers later never leaves it stale');
 const seeds=await q("select concept_id,outcome,hint_level,confidence from public.evidence where ctx->>'seed'='needs_revisit'");
 assert.deepEqual(seeds.map(s=>[s.concept_id,s.outcome,s.hint_level]),[[cA,'pass',2]],'one seeded trigger per concept of the real-gap checkpoint');

 // --- idempotent
 const again=await run({...args,dry_run:false});
 assert.equal(again.evidence.created,0);assert.equal(again.baselines_created,0);assert.equal(again.typing.cards_typed,0);assert.equal(again.estimates_defaulted,0);
 assert.equal(again.recheck_fields.dropped_no_gap,0);assert.deepEqual(await state(),after);

 // --- one action, fully undoable
 const act=(await q("select max(no) n from public.actions where tool='adaptive_migrate' and summary not like '%dry run%'"))[0].n;
 await as(owner);
 await q('select public.undo_action($1,$2,false)',[owner,Number(act)]).catch(e=>{throw new Error('undo of the first real run: '+e.message)});
 await root();
 assert.deepEqual(await state(),before,'undoing the one action restores every table the migration touched');
 assert.equal((await q("select count(*)::int n from public.evidence"))[0].n,0);
 console.log('PASS N169 adaptive_migrate: dry run == real run, idempotent, service-role only');
}finally{await db.close()}
