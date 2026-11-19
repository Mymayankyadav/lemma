// N169 adapter: loads facts, calls the pure core (supabase/functions/_shared/adaptive), renders tutor text.
// Derived values (rechecks, queue, feasibility) are caches: written best-effort, never registered for undo,
// and always recomputed from facts, so undo/redo of any fact is exact (I7). No LLM, no clock beyond `now`.
import {Context,all,scoped} from './db.ts';
import {visibleProjects} from './v3.ts';
import {assemble,type Rows,type State} from '../_shared/adaptive/facts.ts';
import {renderQueue} from '../_shared/adaptive/queue.ts';
import {renderNode,renderCalibration,cardFor} from '../_shared/adaptive/node.ts';
import {lintNotice,type LintField} from '../_shared/adaptive/lint.ts';
import {addDays} from '../_shared/adaptive/dates.ts';
import {project} from './resolve.ts';
import {insert,update} from './db.ts';
import {restore} from '../_shared/adaptive/prune.ts';
import {DEFAULTS} from '../_shared/adaptive/plan.ts';
import {loadAtlasRows,renderAtlasRead,ATLAS_READS} from './atlas.ts';
import {assembleAtlas,atlasCard} from '../_shared/adaptive/atlas.ts';
import {predict} from '../_shared/adaptive/measure.ts';
import {pruneDecision} from '../_shared/adaptive/kg.ts';
import {stepPrune,planPrune,RESTORE_ABOVE,type PruneState} from '../_shared/adaptive/scheduler.ts';

export const FLAG_NAMES=['time_block','recheck_v2','scheduler_v2','proficiency','items','atlas_memory','workers'] as const;
export type FlagName=typeof FLAG_NAMES[number];
export const flagOn=(s:any,name:FlagName)=>s?.flags?.[name]===true;
export const tokens=(text:string)=>Math.ceil(text.length/3);              // conservative: chars/3
const must=(r:{data:any;error:{message:string}|null})=>{if(r.error)throw new Error(r.error.message);return r.data||[]};

async function dueCardsByProject(c:Context):Promise<Record<string,number>>{
  try{
    const due=must(await scoped(c,'v_due_cards','card_id,state,due').limit(2000));
    if(!due.length)return {};
    const cards=await all(c,'cards','id,note_id'),notes=await all(c,'notes','id,project_id');
    const noteProject=new Map(notes.map((n:any)=>[n.id,n.project_id])),cardNote=new Map(cards.map((x:any)=>[x.id,x.note_id]));
    const out:Record<string,number>={};
    for(const d of due){const p=noteProject.get(cardNote.get(d.card_id));if(p)out[p]=(out[p]??0)+1}
    return out;
  }catch{return {}}
}
export async function loadRows(c:Context,now=new Date()):Promise<Rows>{
  const sinceDay=new Date(now.getTime()-3*86400000).toISOString();
  const [settings,projects,checkpoints,prereqs,cpConcepts,concepts,conceptLinks,misc,decisions,baselines,overrides,sessions,items,assumptions,aliases]=await Promise.all([
    scoped(c,'settings').maybeSingle().then(r=>{if(r.error||!r.data)throw new Error('Owner settings not initialized; run bootstrap first');return r.data}),
    all(c,'projects','*'),all(c,'checkpoints','*'),all(c,'checkpoint_prereqs','checkpoint_id,prereq_id'),
    all(c,'checkpoint_concepts','checkpoint_id,concept_id'),all(c,'concepts','*'),all(c,'concept_links','from_id,to_id,kind'),
    all(c,'misconceptions','id,label,concept_id,resolved_at,created_at'),all(c,'recheck_decisions','id,concept_id,level,action,occurred_at'),
    all(c,'plan_baselines','project_id,baseline_version,entries'),all(c,'capacity_overrides','on_date,minutes'),
    all(c,'sessions','id,number,project_id,checkpoint_id,started_at,last_activity_at,minutes,state,abandoned,study_day,time_zone'),
    all(c,'items','*').catch(()=>[] as any[]),all(c,'assumptions','id,concept_id,level,mean_at,revoked_at,created_at').catch(()=>[] as any[]),
    all(c,'concept_aliases','concept_a,concept_b').catch(()=>[] as any[])]);
  const [evidence,intervals,busy,dueCards,frozen]=await Promise.all([
    scoped(c,'evidence','id,occurred_at,session_id,concept_id,item_id,level,role,outcome,hint_level,novelty,kind,origin,confidence,ctx,voided_at').order('id').limit(5000).then(must),
    scoped(c,'study_intervals','kind,started_at,ended_at').gte('started_at',sinceDay).limit(500).then(must),
    scoped(c,'calendar_blocks','kind,status,starts_at,ends_at,time_zone').gte('ends_at',sinceDay).limit(500).then(must),
    dueCardsByProject(c),
    scoped(c,'scheduler_runs','*').gte('study_day',new Date(now.getTime()-4*86400000).toISOString().slice(0,10)).limit(200).then(must).catch(()=>[] as any[])]);
  const atlas=settings.atlas_migrated_at?await loadAtlasRows(c):{};   // `settings.atlas` always has its default, so it cannot say whether the owner has migrated
  return {settings,projects:visibleProjects(projects),checkpoints,prereqs,cpConcepts,concepts,conceptLinks,evidence,misconceptions:misc,
    decisions,baselines,overrides,sessions,intervals,busy,dueCards,frozen,items,assumptions,aliases,...atlas};
}
/** Facts → state. The derived rechecks cache is refreshed best-effort; a cache failure never breaks a read. */
export async function stateOf(c:Context,now=new Date()):Promise<{state:State;rows:Rows}>{
  const rows=await loadRows(c,now);
  const state=assemble(rows,now);
  if(rows.settings?.flags?.recheck_v2===true)await cacheRechecks(c,state).catch(()=>{});
  return {state,rows};
}
async function cacheRechecks(c:Context,s:State):Promise<void>{
  const hash=JSON.stringify([s.today,s.rechecks.rechecks.map(r=>[r.class_id,r.level,r.seq,r.state,r.due,r.stability])]);
  const input_hash=String(hash.length)+':'+[...hash].reduce((a,ch)=>(Math.imul(a,31)+ch.charCodeAt(0))|0,7);
  const {data}=await scoped(c,'rechecks','input_hash').limit(1);
  if(data?.[0]?.input_hash===input_hash&&data.length>0&&s.rechecks.rechecks.length>0)return;
  await c.db.from('rechecks').delete().eq('user_id',c.userId);
  if(!s.rechecks.rechecks.length)return;
  await c.db.from('rechecks').insert(s.rechecks.rechecks.map(r=>({user_id:c.userId,class_id:r.class_id,level:r.level,seq:r.seq,state:r.state,prompt:r.prompt,
    origin_evidence_ids:r.origin_evidence_ids,origin_codes:r.origin_codes,stability:r.stability,difficulty:r.difficulty,due:r.due,last_review:r.last_review,
    reps:r.reps,lapses:r.lapses,fail_count:r.fail_count,pass_streak:r.pass_streak,created_day:r.created_day,closed_day:r.closed_day,close_reason:r.close_reason,
    merge_log:r.merge_log,input_hash})));
}
const cut=(t:string,n:number)=>t.length>n?t.slice(0,n-1)+'…':t;
/** The one-line `TIME` for callers that have no project (list/mix resume). */
export const timeLine=(s:State)=>'TIME today='+s.today+' tz='+s.zone;
export function flagLines(s:State,slug?:string):string[]{
  const out:string[]=[];
  const mine=slug?Object.values(s.projects).filter(p=>p.slug===slug):Object.values(s.projects);
  for(const p of mine){
    if(p.unconfirmed)out.push(p.slug+': deadline/last study day not confirmed; ask');
    if(p.mode==='post_deadline')out.push(p.slug+': deadline passed; ask for a new one or archive');
    if(p.feasibility&&p.feasibility.slack<0)out.push(p.slug+': infeasible by '+Math.abs(p.feasibility.slack)+'m; pruning proposed');
    if(p.atRisk)out.push(p.slug+': core at risk; choose extend deadline, add capacity or cut named items');
  }
  if(s.prune.ask)out.push('core is at risk in '+s.prune.ask.projects.length+' projects; ask which comes first');
  if(s.capacityUnset)out.push('capacity unset; ask for minutes per weekday');
  for(const e of s.rechecks.escalations)out.push('recheck escalated at '+e.fail_count+' fails: '+e.level+'; log a remediation step');
  if(s.rechecks.unresolved.length)out.push(s.rechecks.unresolved.length+' evidence rows have no concept');
  if(s.deprecatedWarnings.length)out.push('dates/pace in free text: '+s.deprecatedWarnings.slice(0,3).join(', '));
  const needsApproval=s.prune.actions.filter(a=>a.needs_approval).length,auto=s.prune.actions.length-needsApproval;
  if(s.prune.actions.length)out.push('prune proposal: '+auto+' automatic, '+needsApproval+' need approval (get what=feasibility)');
  return out;
}
export function renderFeasibility(s:State,slug?:string):string{
  const lines:string[]=[];
  for(const p of Object.values(s.projects).filter(x=>!slug||x.slug===slug).sort((a,b)=>a.slug<b.slug?-1:1)){
    const f=p.feasibility;
    lines.push(p.slug+': '+(f?'supply '+f.supply+'m (raw '+f.raw+'m − buffer '+f.buffer+'m), required '+f.required+'m (reviews '+f.review+'m), slack '+f.slack+'m':'no deadline'));
  }
  const acts=s.prune.actions.map(a=>'- '+a.kind+' '+a.ref+(a.step?'#'+a.step:'')+' '+a.reason.replace('prune:','')+' −'+Math.round(a.minutes_saved)+'m'+(a.needs_approval?' (needs approval)':''));
  if(acts.length)lines.push('PRUNE '+acts.length+' actions',...acts.slice(0,30),...(acts.length>30?['+'+(acts.length-30)+' more']:[]));
  for(const r of s.prune.atRisk)lines.push('AT RISK '+Object.values(s.projects).find(p=>p.id===r.project_id)?.slug+': core '+r.items.map(i=>i.ref).join(',')+'; choices '+r.choices.join(' | '));
  return lines.join('\n');
}
/** Labelled estimate, only on request, never stored (I1). */
export function renderForecast(s:State,rows:Rows,slug?:string):string{
  const lines=['FORECAST (estimate from recent work; not a fact, not stored)'];
  for(const p of Object.values(s.projects).filter(x=>!slug||x.slug===slug)){
    const f=p.feasibility;if(!f)continue;
    const perDay=f.raw/Math.max(1,p.time.lastStudyOn?Math.max(1,(Date.parse(p.time.lastStudyOn)-Date.parse(s.today))/86400000+1):1);
    const days=perDay>0?Math.ceil(Math.max(0,f.required)/perDay):null;
    lines.push(p.slug+': needs ≈'+f.required+'m of '+f.supply+'m available'+(days!==null?'; ≈'+days+' study days at the current capacity':''));
  }
  return lines.join('\n');
}
/**
 * The QUEUE block of the v3 resume. One utility spans every project (10 §8), so with several projects the queue does too: the resumed
 * project's own items come first and every other project's are tagged `[slug]` (the legacy queue named the project in each ref); with no
 * project every item is tagged; with one project nothing is. `home` is the project of a card review (a review has no minute cap of its
 * own, so it has no `project_id`); an item with neither belongs to no project and is tagged `[no project]`.
 */
export function renderAtlasQueue(items:any[],rows:Rows,projectId?:string,limit=8):string{
 const slugOf=new Map<string,string>(rows.projects.map((x:any)=>[x.id,x.slug])),multi=rows.projects.length>1,pidOf=(a:any)=>a.project_id??a.home,mine=(a:any)=>!projectId||pidOf(a)===projectId;
 const ordered=[...items.filter(mine),...items.filter(a=>!mine(a))],tag=(a:any)=>multi&&(!projectId||pidOf(a)!==projectId)?'['+(slugOf.get(pidOf(a))??'no project')+'] ':'';
 return 'QUEUE\n'+ordered.slice(0,limit).map((a,i)=>(i+1)+'. '+a.kind+' '+tag(a)+rows.concepts.find((c:any)=>c.id===a.concept_id)?.name+' '+a.reason).join('\n');
}
/** Resume v2 (spec §13.1): OWNER (added by packet), RULES, TIME, QUEUE, BRIEF, FLAGS; the server appends NEXT. */
export function resumeBlocks(s:State,rows:Rows,slug:string|undefined,rules:string,brief:{now?:string;last?:string;fix?:string;cards?:string;src?:string;adapt?:string;mandatory?:string[];nodes?:string[]}):string{
  const p=slug?Object.values(s.projects).find(x=>x.slug===slug):undefined;
  if(rows.settings?.atlas_migrated_at){
    const v=assembleAtlas(rows,new Date()),fit=p?v.fits[p.id]:undefined;
    const time='TIME today='+s.today+' tz='+s.zone+(fit?' fit='+fit.pAll.toFixed(2)+' core='+fit.pCore.toFixed(2):'')+' checks_due='+v.queue.items.filter(x=>x.kind==='check').length+' new_cards_quota='+v.budget.available.toFixed(1)+' card_min='+v.queue.cardMinutes.toFixed(1)+'/'+v.queue.cardCapMinutes.toFixed(1);
    // One utility over every project (10 §8), so the queue spans them. A project's own items come first and every other project's are
    // tagged, as the legacy queue named the project in each ref; with a single project nothing is tagged.
    const queue=renderAtlasQueue(v.queue.items,rows,p?.id);
    // BRIEF keeps the resume's context (NOW, LAST, FIX, ADAPT, CARDS, SRC) and swaps the node cards for Atlas cards; RULES keep the
    // tutor's rules and add the Atlas lines (04 §resume: "BRIEF uses card v2", rules "add"). Budgets are unchanged (packet caps the body).
    const cards=brief.nodes?.length?brief.nodes:[...new Set(p?rows.cpConcepts.filter(x=>rows.checkpoints.some(c=>c.id===x.checkpoint_id&&c.project_id===p.id)).map(x=>x.concept_id):[])].slice(0,3).map(id=>atlasCard(v,id));
    const flags=v.health.flatMap(h=>h.actions.map(a=>h.stream+': '+a));if(v.capacity===null)flags.push('capacity unset; ask for minutes per weekday');if(v.frustration.active)flags.push('Easing off — next 3 practice');
    const atlasRules='Log stages, cues and errors. Select counts only uncued. Tag explanations with concepts[]. Plan first on proofs. Use get(what=plan_template); draft cards in Close within quota (key idea and skeleton, never proof lines). Read profile, themes, bridges, probes, model_health, card_budget through get. Structured attempts carry ordered stages, tags, result, hint, error and cued UUIDs. A conversion goes to proposal_drafts kind plan_conversion; only the Owner approves it.';
    const rulesText=rules==='(rules as in the last resume)'?rules:rules+'\n'+atlasRules;
    const b=[brief.now,brief.last,brief.fix,brief.adapt,brief.cards,brief.src,...cards.slice(0,3)].filter(Boolean) as string[];
    return ['RULES\n'+rulesText,time,queue,...(b.length?['BRIEF\n'+b.join('\n')]:[]),...(flags.length?['FLAGS\n'+flags.slice(0,6).join('\n')]:[])].join('\n');
  }
  const q=renderQueue(s.queue,8);
  const lines=['RULES\n'+rules,p?p.block:timeLine(s),q];
  const b=[brief.now,brief.last,brief.fix,brief.adapt,brief.cards,brief.src,...(brief.mandatory??[]).map(m=>'RECHECK '+m),...(brief.nodes??[]).map(n=>'NODE '+n)].filter(Boolean) as string[];
  if(b.length)lines.push('BRIEF\n'+b.join('\n'));
  const f=flagLines(s,slug);
  if(f.length)lines.push('FLAGS\n'+f.slice(0,8).map(x=>'- '+x).join('\n'));
  return lines.join('\n');
}
/** Warnings for free-text fields the tutor is writing (I2). Appended after the result is trimmed. */
export function lintNotices(fields:[LintField,string|null|undefined][]):string[]{
  return fields.map(([f,t])=>lintNotice(f,t)).filter(Boolean);
}
/** Node cards for the concepts of today's checkpoint and the mandatory rechecks (flag atlas_memory); each ≤ 100 tokens. */
export function briefNodes(s:State,rows:Rows,cpId:string|undefined,max=4):string[]{
  if(rows.settings?.atlas_migrated_at&&cpId){const v=assembleAtlas(rows,new Date());return [...new Set(rows.cpConcepts.filter(x=>x.checkpoint_id===cpId).map(x=>x.concept_id))].slice(0,max).map(id=>atlasCard(v,id));}
  if(!s.flags.atlas_memory||!cpId)return [];
  const ids=[...new Set(rows.cpConcepts.filter((x:any)=>x.checkpoint_id===cpId).map((x:any)=>x.concept_id))].sort() as string[];
  return ids.slice(0,max).map(id=>cardFor(s,rows,id)).filter(Boolean);
}
export {addDays,cut};

/** get(what=time|queue|feasibility|forecast): server-computed, never stored (I1). */
export async function readAdaptive(c:Context,a:any):Promise<string>{
  const slug=a.project?(await project(c,a.project)).slug:undefined;
  const {state,rows}=await stateOf(c);
  if((ATLAS_READS as readonly string[]).includes(a.what)||(rows.settings?.atlas_migrated_at&&['node','calibration'].includes(a.what)))return renderAtlasRead(rows,a);
  if(rows.settings?.atlas_migrated_at&&a.what==='feasibility')return JSON.stringify(assembleAtlas(rows,new Date()).fits);
  if(a.what==='time'){
    const ps=Object.values(state.projects).filter(p=>!slug||p.slug===slug).sort((x,y)=>x.slug<y.slug?-1:1);
    return ps.length?ps.map(p=>p.slug+'\n'+p.block).join('\n'):timeLine(state);
  }
  if(a.what==='node')return renderNode(state,rows,{id:a.id,depth:a.depth,trail:a.trail===true,cursor:a.cursor});
  if(a.what==='calibration')return renderCalibration(state);
  if(a.what==='queue')return renderQueue(state.queue,Math.min(Math.max(a.limit||8,1),50));
  if(a.what==='feasibility')return renderFeasibility(state,slug);
  return renderForecast(state,rows,slug);
}

const iso=()=>new Date().toISOString();
/** Slack as a fraction of supply, the number hysteresis compares against +10% (spec §8.3). */
const slackRatio=(f:{slack:number;supply:number})=>f.supply>0?f.slack/f.supply:(f.slack<0?-1:0);
/**
 * scheduler_v2: runs at start_session and end_session, never on a plain read. It
 *  1. freezes today's slack ratio per project (the first computation of the study day wins, so I3 holds within a day),
 *  2. defers what pruning allows without approval (venture steps and CPs, a stage's emptied cards CP; standard material
 *     only where the project allows auto-prune), journalled in the caller's batch so `undo` reverses the run,
 *  3. restores in exactly the reverse order once slack stayed above +10% on 2 consecutive study days.
 * Returns one short line (one notification per run), or '' when nothing changed.
 */
export async function applyScheduler(c:Context,now=new Date()):Promise<string>{
  const {state,rows}=await stateOf(c,now);
  if(rows.settings?.atlas_migrated_at){
    // Atlas v3 (10 §4): freeze today's P_all/P_core once, then prune below 0.80 and restore above 0.95 on two consecutive study days. Journalled in the caller's batch so `undo` reverses the run.
    const v=assembleAtlas(rows,now),today=state.today,yesterday=addDays(today,-1),changes:string[]=[];
    const frozen=new Map<string,Map<string,number>>();
    for(const f of rows.frozen??[])if(f.p_all!=null)(frozen.get(f.project_id)??frozen.set(f.project_id,new Map()).get(f.project_id)!).set(String(f.study_day).slice(0,10),Number(f.p_all));
    for(const p of Object.values(state.projects)){
      const f=v.fits[p.id];if(!f)continue;
      const h=frozen.get(p.id)??new Map<string,number>();
      if(!h.has(today)){
        await c.db.from('scheduler_runs').upsert({user_id:c.userId,study_day:today,project_id:p.id,p_all:f.pAll,p_core:f.pCore,slack_ratio:0,supply:f.supply,required:f.required,input_hash:today+':atlas3',computed_at:now.toISOString()},{onConflict:'user_id,study_day,project_id',ignoreDuplicates:true});
        h.set(today,f.pAll);
      }
      const mine=rows.checkpoints.filter((x:any)=>x.project_id===p.id),v3=mine.filter((x:any)=>x.plan_state==='deferred'&&String(x.deferred_reason??'').startsWith('prune:v3'));
      const start:PruneState={pruned:v3.length>0,upDays:(h.get(yesterday)??0)>RESTORE_ABOVE?1:0,lastDay:yesterday};
      const step=stepPrune(start,today,h.get(today)!);
      if(step.action==='prune'){
        // 10 §5: venture defers automatically; standard only where the project allows it (auto_prune_standard); core never (by proposal).
        const autoStandard=!!rows.projects.find((x:any)=>x.id===p.id)?.auto_prune_standard;
        const open=mine.filter((x:any)=>x.status==='not_started'&&(x.plan_state??'active')==='active'&&(x.tier==='venture'||(x.tier!=='core'&&autoStandard))&&!x.pinned).map((x:any)=>{const k=rows.cpConcepts.find((e:any)=>e.checkpoint_id===x.id)?.concept_id,pt=k?predict(v.model,k,'use',now.getTime()):0;return {id:x.id,tier:x.tier??'standard',weight:x.tier==='venture'?1:2,pTestOut:pt,minutes:x.estimate_minutes??60,status:x.status};});
        const order=pruneDecision(f.pAll,f.pCore,[],open).candidates,plan=planPrune(f,order.map(o=>({id:o.id,minutes:o.minutes,testOut:o.testOut})));
        for(const id of plan.defer)await update(c,'checkpoints',id,{plan_state:'deferred',deferred_at:iso(),deferred_reason:'prune:v3 P_all '+f.pAll.toFixed(2)});
        if(plan.defer.length)changes.push('deferred '+plan.defer.length+' ('+f.pAll.toFixed(2)+' → '+plan.pAfter.toFixed(2)+')');
        if(plan.testOut.length)changes.push('test-out suggested for '+plan.testOut.length);
      }else if(step.action==='restore'){
        for(const x of v3.sort((a:any,b:any)=>String(b.deferred_at).localeCompare(String(a.deferred_at))))await update(c,'checkpoints',x.id,{plan_state:'active',deferred_at:null,deferred_reason:null});
        if(v3.length)changes.push('restored '+v3.length);
      }
    }
    const risk=Object.values(v.fits).some(f=>f.pCore<.8)?'; core at risk, choose capacity, deadline or named scope changes':'';
    return changes.length?'SCHEDULER '+changes.join(', ')+risk+' (undo reverses it)':risk?'SCHEDULER core at risk; choose capacity, deadline or named scope changes':'';
  }
  if(!flagOn(rows.settings,'scheduler_v2'))return '';
  const hist=new Map<string,Map<string,number>>();
  for(const f of rows.frozen??[]){(hist.get(f.project_id)??hist.set(f.project_id,new Map()).get(f.project_id)!).set(String(f.study_day).slice(0,10),Number(f.slack_ratio))}
  for(const p of Object.values(state.projects)){
    if(!p.feasibility||hist.get(p.id)?.has(state.today))continue;
    const ratio=slackRatio(p.feasibility);
    await c.db.from('scheduler_runs').upsert({user_id:c.userId,study_day:state.today,project_id:p.id,slack_ratio:ratio,supply:p.feasibility.supply,required:p.feasibility.required,
      input_hash:String(state.today),computed_at:iso()},{onConflict:'user_id,study_day,project_id',ignoreDuplicates:true});
    (hist.get(p.id)??hist.set(p.id,new Map()).get(p.id)!).set(state.today,ratio);
  }
  const cps=new Map(rows.checkpoints.map((x:any)=>[x.project_id+'|'+x.code,x]));
  const changes:string[]=[];
  // 2. automatic pruning
  for(const a of state.prune.actions.filter(x=>!x.needs_approval&&(x.kind==='defer_cp'||x.kind==='defer_step'))){
    const row:any=cps.get(a.project_id+'|'+a.ref);if(!row)continue;
    if(a.kind==='defer_cp'){
      await update(c,'checkpoints',row.id,{plan_state:'deferred',deferred_at:iso(),deferred_reason:a.reason+(a.summary_for?'>'+a.summary_for:'')});
    }else if(a.step){
      const meta=(Array.isArray(row.step_meta)?row.step_meta:row.steps.map((t:string)=>({tier:/^\s*venture\s*:/i.test(t)?'venture':null,estimate_minutes:null,state:'todo'}))).map((m:any)=>({...m}));
      meta[a.step-1]={...meta[a.step-1],state:'deferred',deferred_at:iso(),deferred_reason:a.reason};
      row.step_meta=meta;await update(c,'checkpoints',row.id,{step_meta:meta});
    }
    changes.push(a.reason.replace('prune:',''));
  }
  // 3. restore, newest first, only after 2 consecutive study days above +10%
  const hyster=(id:string)=>{const h=hist.get(id);const prev=addDays(state.today,-1);
    return !!h&&(h.get(state.today)??-1)>DEFAULTS.restoreMargin&&(h.get(prev)??-1)>DEFAULTS.restoreMargin};
  // Only when nothing at all is being pruned (not even a proposal): then the simulated state is the real plan, with
  // every project in it, so a restore is judged against shared capacity as it really is.
  if(!state.prune.actions.length){
    const ok=new Set(Object.values(state.projects).filter(p=>hyster(p.id)).map(p=>p.id));
    if(ok.size){
      const out=restore(state.prune.state,ok);
      for(const r of out.restored){
        const row:any=cps.get(r.project_id+'|'+r.ref);if(!row)continue;
        if(r.kind==='restore_cp')await update(c,'checkpoints',row.id,{plan_state:'active',deferred_at:null,deferred_reason:null});
        else if(r.step&&Array.isArray(row.step_meta)){
          const meta=row.step_meta.map((m:any)=>({...m}));meta[r.step-1]={...meta[r.step-1],state:'todo',deferred_at:null,deferred_reason:null};
          row.step_meta=meta;await update(c,'checkpoints',row.id,{step_meta:meta});
        }
        changes.push('restored');
      }
    }
  }
  if(!changes.length)return '';
  const pruned=changes.filter(x=>x!=='restored').length,restored=changes.length-pruned;
  return 'SCHEDULER '+(pruned?'deferred '+pruned+' ('+[...new Set(changes.filter(x=>x!=='restored'))].join(', ')+')':'')+(restored?(pruned?'; ':'')+'restored '+restored:'')+'; undo reverses it';
}
