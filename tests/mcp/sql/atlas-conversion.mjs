process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);process.exit(1);});
// N179 / I17: legacy conversion application on copies of four projects: new KCs, prerequisite rewiring, card decisions,
// approval-time validation (a rejected approval changes nothing) and one-action undo.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const U=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const asService=async()=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[owner]);await q("select set_config('role','service_role',false)");};
const root=async()=>{await db.exec('reset role');};
const command=(operation,fields)=>({schemaVersion:1,operationId:randomUUID(),resource:'plan_conversions',operation,...fields});
const run=async input=>(await q('select public.atlas_conversion_command($1::jsonb) r',[JSON.stringify(input)]))[0].r;
const snapshot=async project=>({
 checkpoints:await q('select id,code,status,plan_state,deferred_reason,title,steps,template is not null has_template from public.checkpoints where project_id=$1 order by id',[project]),
 prereqs:await q('select checkpoint_id,prereq_id from public.checkpoint_prereqs where checkpoint_id in(select id from public.checkpoints where project_id=$1) order by 1,2',[project]),
 links:await q('select checkpoint_id,concept_id from public.checkpoint_concepts where checkpoint_id in(select id from public.checkpoints where project_id=$1) order by 1,2',[project]),
 notes:await q('select id,status,front,back,kind,atlas_kind from public.notes where project_id=$1 order by id',[project]),
 concepts:await q('select id,name,kind,parent_id from public.concepts order by id'),
});
const template=(id,over={})=>({id,title:'Unit '+id,objective:'Understand '+id,criterion:{text:'Prove a novel statement about '+id,concept_id:'kc-old',facet:'use',kind:'holdout',novel:true,cued:[]},kind:'learn',tier:'core',estimate:60,
 kcs:[{id:'kc-old',kind:'definition',home:'kc-old'}],steps:['Read','Practise','Close'],prereqs:[],stage:1,teach:['Definitions','Examples'],practice:[1,2,3].map(i=>({text:'Practice '+i,concept_id:'kc-old',facet:'use'})),close:{questions:['a','b','c'],minutes:8},card_plan:[],...over});
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 for(const n of names){try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}}
 await q('insert into auth.users values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[U(1),owner]);
 // Four projects, each with: a done CP, an open CP, an open "cards" CP the open CP depends on, a reviewed card, an unreviewed card, a card to suspend, a topic and a concept.
 const projects=[];
 for(let p=0;p<4;p++){
  const b=100*(p+1),P={project:U(b),done:U(b+1),open:U(b+2),cards:U(b+3),topic:U(b+4),old:U(b+5),reviewed:U(b+6),plain:U(b+7),susp:U(b+8)};projects.push(P);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,$4,$5,'Understand')",[P.project,owner,U(1),'p'+p,'Project '+p]);
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,$4,$5),($6,$2,$3,$7,$8)",[P.topic,owner,U(1),'topic'+p,'Topic '+p,P.old,'old'+p,'Old idea '+p]);
  await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,status,demonstrated_at,current_step,kind) values($1,$2,$3,'CP1',1,'Done unit','Was learnt','Proved it','[\"a\",\"b\"]','demonstrated',now(),0,'learn')",[P.done,owner,P.project]);
  await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,status,kind) values($1,$2,$3,'CP2',2,'Old open unit','Old objective','Old criterion','[\"x\"]','not_started','learn'),($4,$2,$3,'CP3',3,'Cards K1','Cards','Done cards','[\"c\"]','not_started','cards')",[P.open,owner,P.project,P.cards]);
  await q('insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values($1,$2,$3),($1,$2,$4)',[owner,P.open,P.done,P.cards]);
 await q("update public.checkpoints set pages='pp. 12-18' where id=$1",[P.open]);
  await q('insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values($1,$2,$3)',[owner,P.open,P.old]);
  for(const [id,front] of [[P.reviewed,'Reviewed front'],[P.plain,'Plain front'],[P.susp,'Suspend front']]){
   await q("insert into public.notes(id,user_id,project_id,front,back,kind,type,origin) values($1,$2,$3,$4,'back','other','basic','other')",[id,owner,P.project,front]);
   await q('select public.lemma_reconcile_cards($1,$2)',[owner,id]);
  }
  await q('update public.cards set reps=4 where note_id=$1',[P.reviewed]);
 }
 const conversionFor=(P,i)=>({schema:'plan_template_v1',
  checkpoints:[
   {...template(P.done),title:'Done unit',objective:'Was learnt',steps:['a','b'],tier:'standard'},
   template(P.open,{title:'Open unit, templated',objective:'New objective',steps:['Read','Practise','Close'],prereqs:[P.done]}),
   template('new-'+i+'-1',{title:'Brand new unit',kcs:[{id:'kc-new',kind:'result',home:'Topic '+i}],prereqs:[P.open]}),
   template('new-'+i+'-2',{title:'Second new unit',kcs:[{id:'kc-new',kind:'result',home:'Topic '+i},{id:'kc-old',kind:'definition',home:'Topic '+i}],prereqs:['new-'+i+'-1',P.open]}),
  ],
  map:{[P.done]:{id:P.done},[P.open]:{id:P.open},[P.cards]:{skipped:true,reason:'template:cards-in-close'}},
  kcs:[{id:'kc-old',name:'Old idea '+i,kind:'definition',concept_id:P.old},{id:'kc-new',name:'Brand new idea '+i,kind:'result',home:'Topic '+i}],
  cards:[{id:P.reviewed,action:'revise',front:'Revised front',back:'Revised back',reason:'tighten'},{id:P.plain,action:'delete',reason:'duplicate'},{id:P.susp,action:'suspend',reason:'certified'},{action:'new',kind:'skeleton',front:'Skeleton '+i,back:'1. idea',reason:'proof skeleton'}]});
 const draft=async(P,i,conversion=conversionFor(P,i))=>{await asService();const r=await run(command('create',{patch:{project_id:P.project,conversion}}));return r.changed[0].id;};
 const approve=async id=>{await asService();const v=(await q('select version from public.proposals where id=$1',[id]))[0].version;return run(command('approve',{target:{id},expectedVersion:Number(v),patch:{}}));};
 // --- 11 §4 card limits per KC kind and tier
 for(const [kind,tier,confusable,canonical,limit] of [['definition','core',false,false,1],['definition','core',true,false,2],['definition','standard',true,false,1],['result','core',false,false,2],['result','standard',false,false,1],['example','core',false,true,1],['example','core',false,false,0],['example','standard',false,true,0],['technique','core',false,false,1],['technique','standard',false,false,0],['notation','core',false,false,0],['topic','core',false,false,0],['result','venture',false,false,0]])
  assert.equal((await q('select public.atlas_card_limit($1,$2,$3,$4) n',[kind,tier,confusable,canonical]))[0].n,limit,kind+' '+tier);
 // --- hard rules at approval: each violation raises and leaves the project exactly as it was
 {
  const [P]=projects,before=await snapshot(P.project);
  const bad=(name,mutate,expected)=>({name,mutate,expected});
  const cases=[
   bad('done CP skipped',c=>{c.map[P.done]={skipped:true,reason:'x'};},/Done checkpoint cannot change/),
   bad('done CP edited',c=>{c.checkpoints[0].title='Edited';},/Done checkpoint must be preserved/),
   bad('old CP unmapped',c=>{delete c.map[P.open];},/omits checkpoint/),
   bad('unknown prerequisite',c=>{c.checkpoints[2].prereqs=['nope'];},/Unknown prerequisite/),
   bad('prerequisite cycle',c=>{c.checkpoints[2].prereqs=['new-0-2'];c.checkpoints[3].prereqs=['new-0-1'];},/cycle/),
   bad('unknown KC',c=>{c.checkpoints[2].kcs=[{id:'ghost',kind:'result',home:'x'}];},/Unknown KC/),
   bad('card decision missing',c=>{c.cards=c.cards.filter(x=>x.id!==P.susp);},/Missing card decision/),
   bad('reviewed card deleted',c=>{c.cards.find(x=>x.id===P.reviewed).action='delete';},/Reviewed card cannot be deleted/),
   bad('criterion not a holdout',c=>{c.checkpoints[2].criterion.kind='practice';},/holdout/),
   bad('too few practice items',c=>{c.checkpoints[2].practice=[];},/practice items/),
   bad('cards CP skipped for another reason',c=>{c.map[P.cards].reason='other';},/Cards CP must move to Close/),
   bad('bad KC kind',c=>{c.kcs[1].kind='banana';},/Invalid KC kind/),
   bad('card limit exceeded',c=>{c.checkpoints[2].card_plan=[1,2,3].map(i=>({concept_id:'kc-new',kind:'definition',facet:'recall',front:'f'+i,back:'b'}));},/Card limit exceeded/),
   bad('card names a KC outside its checkpoint',c=>{c.checkpoints[2].card_plan=[{concept_id:'kc-old',kind:'definition',facet:'recall',front:'f',back:'b'}];},/outside its checkpoint/),
   bad('card facet not allowed',c=>{c.checkpoints[2].card_plan=[{concept_id:'kc-new',kind:'definition',facet:'execute',front:'f',back:'b'}];},/facet must be/),
   bad('answer over three lines',c=>{c.checkpoints[2].card_plan=[{concept_id:'kc-new',kind:'definition',facet:'recall',front:'f',back:'1\n2\n3\n4'}];},/three lines/),
   bad('list-all card',c=>{c.checkpoints[2].card_plan=[{concept_id:'kc-new',kind:'definition',facet:'recall',front:'List all the axioms',back:'b'}];},/list-all/),
   bad('venture checkpoints draft no cards',c=>{c.checkpoints[2].tier='venture';c.checkpoints[2].card_plan=[{concept_id:'kc-new',kind:'definition',facet:'recall',front:'f',back:'b'}];},/Card limit exceeded/),
  ];
  for(const t of cases){
   const conversion=structuredClone(conversionFor(P,0));t.mutate(conversion);
   const id=await draft(P,0,conversion);
   try{await assert.rejects(approve(id),t.expected,t.name);}catch(e){console.error('CASE',t.name,'->',e.message);throw e;}
   await root();
   assert.deepEqual(await snapshot(P.project),before,t.name+': a rejected approval must change nothing');
   assert.equal((await q('select status from public.proposals where id=$1',[id]))[0].status,'pending',t.name+': proposal stays pending');
  }
 }
 // --- the four projects: approve, check, undo in one action, approve again
 for(const [i,P] of projects.entries()){
  const before=await snapshot(P.project),id=await draft(P,i),done=await approve(id);
  await root();
  const after=await snapshot(P.project),cp=Object.fromEntries(after.checkpoints.map(c=>[c.id,c]));
  assert.equal(cp[P.done].title,'Done unit','done CP keeps its title');assert.equal(cp[P.done].status,'demonstrated','done CP keeps its status');
  assert.deepEqual(cp[P.done].steps,['a','b'],'done CP keeps its steps');
  assert.equal(cp[P.open].title,'Open unit, templated','open CP is rewritten from the template');
  assert.equal((await q('select pages from public.checkpoints where id=$1',[P.open]))[0].pages,'pp. 12-18','conversion never invents or drops a source page');assert.equal(cp[P.open].has_template,true);
  assert.equal(cp[P.cards].plan_state,'skipped');assert.equal(cp[P.cards].deferred_reason,'template:cards-in-close');
  const created=after.checkpoints.filter(c=>!before.checkpoints.some(b=>b.id===c.id));
  assert.deepEqual(created.map(c=>c.title).sort(),['Brand new unit','Second new unit'],'two new CPs');
  assert.equal(new Set(after.checkpoints.map(c=>c.code)).size,after.checkpoints.length,'codes stay unique');
  const first=created.find(c=>c.title==='Brand new unit'),second=created.find(c=>c.title==='Second new unit');
  const edges=after.prereqs.map(e=>e.checkpoint_id+'>'+e.prereq_id);
  assert.ok(edges.includes(first.id+'>'+P.open),'new CP depends on the open CP');
  assert.ok(edges.includes(second.id+'>'+first.id),'prerequisites between new CPs are rewired from template ids');
  assert.ok(edges.includes(P.open+'>'+P.done),'open CP keeps its prerequisite on the done CP');
  assert.ok(!edges.includes(P.open+'>'+P.cards),'edges to the skipped cards CP are dropped');
  const newKc=after.concepts.find(c=>c.name==='Brand new idea '+i);
  assert.ok(newKc&&newKc.kind==='result'&&newKc.parent_id===P.topic,'a new KC is created with its kind and home topic');
  assert.equal(after.concepts.filter(c=>c.name.toLowerCase()==='old idea '+i).length,1,'an existing KC is reused, never duplicated');
  assert.ok(after.links.some(l=>l.checkpoint_id===first.id&&l.concept_id===newKc.id),'new CP links its KC');
  assert.ok(after.links.some(l=>l.checkpoint_id===second.id&&l.concept_id===P.old),'new CP links a reused KC');
  const note=Object.fromEntries(after.notes.map(n=>[n.id,n]));
  assert.equal(note[P.reviewed].status,'active');assert.equal(note[P.reviewed].front,'Revised front','reviewed card is revised, never deleted');
  assert.equal(note[P.plain].status,'deleted');assert.equal(note[P.susp].status,'suspended');
  assert.equal(after.notes.filter(n=>n.front==='Skeleton '+i&&n.atlas_kind==='skeleton').length,1,'a new skeleton card is drafted');
  assert.equal((await q('select count(*)::int n from public.cards where note_id=$1 and reps>0',[P.reviewed]))[0].n,1,'review history stays');
  // undo restores the whole project in one action
  await q("select set_config('role','service_role',false)");
  await q('select public.undo_action($1,$2,false)',[owner,done.actionNo]);await root();
  assert.deepEqual(await snapshot(P.project),before,'undoing one approval restores checkpoints, prerequisites, KCs, links and cards');
  assert.equal((await q('select status from public.proposals where id=$1',[id]))[0].status,'pending','the proposal is pending again after undo');
 }
 // a replayed approval receipt is exact and a stale version conflicts
 {
  const [P]=projects,id=await draft(P,0);await asService();
  const cmd=command('approve',{target:{id},expectedVersion:Number((await q('select version from public.proposals where id=$1',[id]))[0].version),patch:{}});
  const one=await run(cmd);assert.deepEqual(await run(cmd),one,'exact replay');
  await assert.rejects(run({...cmd,operationId:randomUUID()}),/missing or version conflict/,'a second approval is refused');
 }
 console.log('PASS N179 conversion: four-project approval and undo, new KCs, prerequisite rewiring, card decisions and approval-time hard rules');
}finally{await db.close();}
