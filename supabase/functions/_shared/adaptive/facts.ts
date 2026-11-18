// Facts → derived state. Pure: raw rows in, the TIME block, rechecks, queue, feasibility and a pruning
// proposal out. The MCP adapter only loads rows and calls assemble(); tests feed it fixtures (no database).
import {addDays,diffDays,type DateStr} from './dates.ts';
import {studyDay,localDate,projectTime,capacityOn,timeBlock,modeOf,studyDaysLeft,type Capacity,type CapacityConfig,type ProjectTime,type Mode} from './time.ts';
import {replayRechecks,dueRechecks,retrievabilityOf,type Evidence,type ClassInfo,type Recheck,type RecheckResult,type Level,type Trigger} from './recheck.ts';
import {estRemaining,isLive,paceFactor,DEFAULTS,type PlanCp,type PlanProject,type Step,type Tier,type CpKind} from './plan.ts';
import {buildQueue,type Queue,type ReviewItem} from './queue.ts';
import {evaluate,prune,type PruneResult,type PruneState} from './prune.ts';
import {lintText} from './lint.ts';
import type {EvidenceFact} from './digest.ts';

export type Rows={
  settings:any;projects:any[];checkpoints:any[];prereqs:any[];cpConcepts:any[];concepts:any[];conceptLinks:any[];
  evidence:any[];misconceptions:any[];decisions:any[];baselines:any[];overrides:any[];sessions:any[];intervals:any[];busy:any[];
  dueCards:Record<string,number>;frozen?:any[];
  /** N170 (all optional: absent means none) */
  items?:any[];assumptions?:any[];aliases?:any[];
  attempts?:any[];attemptTags?:any[];instructionEvents?:any[];atlasLinks?:any[];modelFits?:any[];cards?:any[];notes?:any[];reviews?:any[];studyEntries?:any[];
};
export type ProjectView={
  id:string;slug:string;title:string;time:ProjectTime;mode:Mode;firstSession:DateStr|null;
  feasibility:{raw:number;supply:number;required:number;review:number;slack:number;buffer:number}|null;
  block:string;atRisk:boolean;unconfirmed:boolean;
};
export type State={
  today:DateStr;zone:string;flags:Record<string,boolean>;capacityToday:Capacity;usedToday:number;
  projects:Record<string,ProjectView>;rechecks:RecheckResult;queue:Queue;prune:PruneResult;
  deprecatedWarnings:string[];capacityUnset:boolean;absentDays:number;
  /** the concept class map, and live evidence in canonical order (digest and legacy node cards) */
  classOf:(concept:string)=>string;evidenceFacts:EvidenceFact[];
  /** assumption ids withdrawn by T5 (revoked, or contradicted by a later fail on that class and level): derived, so undo restores them */
  withdrawn:string[];
};
const asArr=(x:any)=>Array.isArray(x)?x:[];
const ms=(x:any)=>x?Date.parse(x):NaN;
const VENTURE=/^\s*venture\s*:/i;
export function weekdayMinutes(cap:any):number[]|null{
  const w=cap?.weekday_minutes;
  if(Array.isArray(w)&&w.length===7&&w.every((x:any)=>Number.isFinite(x)&&x>=0))return w.map(Number);
  if(Number.isFinite(w)&&w>=0)return Array(7).fill(Number(w));
  return null;
}
export function toPlanCps(r:Rows):PlanCp[]{
  const byProjectCps=new Map<string,any[]>();
  for(const c of r.checkpoints){(byProjectCps.get(c.project_id)??byProjectCps.set(c.project_id,[]).get(c.project_id)!).push(c)}
  const out:PlanCp[]=[];
  for(const c of r.checkpoints){
    const meta=asArr(c.step_meta),texts=asArr(c.steps);
    const done=c.status==='demonstrated';
    const cur=Math.max(0,(c.current_step??1)-1);
    const steps:Step[]=texts.map((t:string,i:number)=>{
      const m=meta[i]??{};
      const tier:Tier=(m.tier as Tier)||(VENTURE.test(String(t))?'venture':(c.tier as Tier)||'standard');
      return {tier,minutes:Number.isFinite(m.estimate_minutes)?Number(m.estimate_minutes):null,
        done:done||(c.status==='in_progress'&&i<cur)||m.state==='done',deferred:m.state==='deferred',
        deferredAt:ms(m.deferred_at)||null,deferredReason:m.deferred_reason??null};
    });
    out.push({id:c.id,code:c.code,project_id:c.project_id,position:c.position,stage:c.stage??null,
      kind:(c.kind as CpKind)||'learn',tier:(c.tier as Tier)||'standard',estimate:c.estimate_minutes??null,pinned:!!c.pinned,
      status:c.status,planState:c.plan_state||'active',deferredAt:ms(c.deferred_at)||null,deferredReason:c.deferred_reason??null,
      steps,dueOn:c.due_on?String(c.due_on).slice(0,10):null,
      prereqs:r.prereqs.filter((e:any)=>e.checkpoint_id===c.id).map((e:any)=>e.prereq_id)});
  }
  // A CP deferred with a prerequisite summary is stored as 'prune:standard_cp>CP7': the summary (~15 min) rides on CP7.
  for(const c of out){
    const m=c.planState==='deferred'?/^prune:[a-z_]+>(\S+)$/.exec(c.deferredReason??''):null;
    if(m){const d=out.find(x=>x.project_id===c.project_id&&x.code===m[1]);if(d)d.summary=true}
  }
  // Default estimates are made explicit here so every module sees the same number (flagged uncalibrated elsewhere).
  const learnByStage=new Map<string,number>();
  for(const c of out)if(c.kind==='learn'&&c.estimate===null)learnByStage.set(c.project_id+'|'+c.stage,(learnByStage.get(c.project_id+'|'+c.stage)??0)+1);
  for(const c of out)if(c.estimate===null){c.estimate=c.kind==='cards'?DEFAULTS.cardsMinutes:c.kind==='milestone'?DEFAULTS.milestoneMinutes:DEFAULTS.learnMinutes}
  return out;
}
/** Pace samples: completed checkpoints with an estimate, actual = Σ minutes of their sessions, in completion order. */
export function paceSamples(r:Rows,projectId:string):{estimated:number;actual:number}[]{
  const mins=new Map<string,number>();
  for(const s of r.sessions)if(s.checkpoint_id&&Number.isFinite(s.minutes))mins.set(s.checkpoint_id,(mins.get(s.checkpoint_id)??0)+Number(s.minutes));
  return r.checkpoints.filter((c:any)=>c.project_id===projectId&&c.status==='demonstrated'&&c.estimate_minutes>0&&mins.has(c.id)&&!c.self_reported)
    .sort((a:any,b:any)=>String(a.demonstrated_at).localeCompare(String(b.demonstrated_at))||a.position-b.position)
    .map((c:any)=>({estimated:c.estimate_minutes,actual:mins.get(c.id) as number}));
}
export function assemble(r:Rows,now:Date):State{
  const st=r.settings??{};const zone=st.time_zone||'UTC';
  const today=studyDay(st,now);
  const flags:Record<string,boolean>=Object.fromEntries(Object.entries(st.flags??{}).map(([k,v])=>[k,v===true]));
  const projects=r.projects.filter((p:any)=>p.status==='active'||p.status==='planning');
  const cps=toPlanCps(r);
  const overrides=Object.fromEntries(r.overrides.map((o:any)=>[String(o.on_date).slice(0,10),Number(o.minutes)]));
  const busy:Record<string,number>={};
  for(const b of r.busy)if(b.kind==='busy'&&b.status!=='cancelled'){
    const d=localDate(b.time_zone||zone,b.starts_at);busy[d]=(busy[d]??0)+Math.max(0,Math.round((ms(b.ends_at)-ms(b.starts_at))/60000));
  }
  const planning=st.planning??{};
  const cap:CapacityConfig={weekdayMinutes:weekdayMinutes(st.capacity),overrides,windowStart:planning.window_start,windowEnd:planning.window_end,busy};
  const capOf=(d:DateStr)=>capacityOn(d,cap).minutes;
  const capacityToday=capacityOn(today,cap);
  // Time already logged today: saved focus intervals whose study day is today (a running one counts up to now).
  const usedToday=Math.round(r.intervals.filter((i:any)=>i.kind==='focus'&&studyDay(st,i.started_at)===today)
    .reduce((a:number,i:any)=>a+Math.max(0,((i.ended_at?ms(i.ended_at):now.getTime())-ms(i.started_at))/60000),0));
  // --- rechecks (replay over facts)
  const concepts=new Map<string,any>(r.concepts.map((c:any)=>[c.id,c]));
  const cpById=new Map<string,any>(r.checkpoints.map((c:any)=>[c.id,c]));
  const planById=new Map<string,PlanCp>(cps.map(c=>[c.id,c]));
  const ptime=new Map<string,ProjectTime>(projects.map((p:any)=>[p.id,projectTime(p,zone)]));
  const parent=new Map<string,string>();
  const find=(x:string):string=>{let r=x;while(parent.has(r)&&parent.get(r)!==r)r=parent.get(r) as string;return r};
  for(const a of asArr(r.aliases)){const x=find(a.concept_a),y=find(a.concept_b);if(x!==y){const lo=x<y?x:y,hi=x<y?y:x;parent.set(hi,lo);parent.set(lo,lo)}}
  const classOf=(c:string)=>find(c);
  const classes:Record<string,ClassInfo>={};
  const conceptCps=new Map<string,string[]>();
  for(const x of r.cpConcepts)(conceptCps.get(x.concept_id)??conceptCps.set(x.concept_id,[]).get(x.concept_id)!).push(x.checkpoint_id);
  for(const [cid,c] of concepts){
    const linked=(conceptCps.get(cid)??[]).map(id=>planById.get(id)).filter(Boolean) as PlanCp[];
    const liveLinked=linked.filter(x=>x.planState==='active'&&ptime.has(x.project_id));
    const lasts=liveLinked.map(x=>ptime.get(x.project_id)!.lastStudyOn).filter(Boolean) as DateStr[];
    const cls=classOf(cid),mine:ClassInfo={name:c.name,core:liveLinked.some(x=>x.tier==='core'),lastStudyOn:lasts.length?lasts.sort()[0]:null,active:linked.length===0||liveLinked.length>0};
    const prev=classes[cls];
    // One class pools its members: core if any is, the nearest deadline, active if any is active (§7: one recheck, nearer deadline)
    classes[cls]=prev?{name:prev.name,core:prev.core||mine.core,active:prev.active||mine.active,
      lastStudyOn:prev.lastStudyOn&&mine.lastStudyOn?(prev.lastStudyOn<mine.lastStudyOn?prev.lastStudyOn:mine.lastStudyOn):(prev.lastStudyOn??mine.lastStudyOn)}:mine;
  }
  // A session left open for 12 h counts as abandoned (derived, never written on a read): its evidence counts, but it makes no T3 rechecks.
  const abandoned=r.sessions.filter((s:any)=>s.abandoned||(s.state==='open'&&now.getTime()-ms(s.last_activity_at)>12*3600000)).map((s:any)=>s.id);
  const sessionZone=new Map<string,string>(r.sessions.map((s:any)=>[s.id,s.time_zone||zone]));
  const evidence:Evidence[]=r.evidence.filter((e:any)=>!e.voided_at).map((e:any)=>({
    id:String(e.id),at:ms(e.occurred_at),day:studyDay({time_zone:sessionZone.get(e.session_id)||zone,rollover_hour:st.rollover_hour},e.occurred_at),
    session_id:e.session_id,concept_id:e.concept_id,level:e.level,role:e.role,outcome:e.outcome,hint_level:e.hint_level,novelty:e.novelty,kind:e.kind}));
  const triggers:Trigger[]=r.misconceptions.filter((m:any)=>m.concept_id&&!m.resolved_at).map((m:any)=>({id:'m'+m.id,at:ms(m.created_at),day:studyDay(st,m.created_at),code:'T4' as const,concept_id:m.concept_id}));
  const decisions=r.decisions.map((d:any)=>({id:String(d.id),at:ms(d.occurred_at),day:studyDay(st,d.occurred_at),concept_id:d.concept_id,level:d.level as Level,action:d.action}));
  const weights=Array.isArray(st.fsrs_weights)&&st.fsrs_weights.length===21?st.fsrs_weights:undefined;
  // T5: an assumption is withdrawn when the learner revokes it, or when a later gap shows on that class and level (derived, so undo is exact)
  const withdrawn:string[]=[];
  for(const a of asArr(r.assumptions)){
    const made=ms(a.created_at);const cls=classOf(a.concept_id);
    const gap=evidence.filter(e=>e.concept_id&&classOf(e.concept_id)===cls&&e.level===a.level&&e.outcome==='fail'&&e.at>made).sort((x,y)=>x.at-y.at)[0];
    const at=a.revoked_at?ms(a.revoked_at):gap?.at;
    if(at){withdrawn.push(String(a.id));triggers.push({id:'a'+a.id,at,day:studyDay(st,new Date(at)),code:'T5' as const,concept_id:a.concept_id})}
  }
  const rechecks=replayRechecks({evidence,triggers,decisions,classes,classOf,abandonedSessions:abandoned,weights,retention:st.desired_retention??0.91});
  // --- live evidence in canonical order (the Beta proficiency model was removed at the Atlas v3 cutover)
  const itemOf=new Map<string,any>(asArr(r.items).map((i:any)=>[i.id,i]));
  const evidenceFacts:EvidenceFact[]=r.evidence.filter((e:any)=>!e.voided_at&&e.concept_id).map((e:any)=>({
    id:String(e.id),at:ms(e.occurred_at),day:studyDay({time_zone:sessionZone.get(e.session_id)||zone,rollover_hour:st.rollover_hour},e.occurred_at),concept_id:e.concept_id,
    level:e.level,role:e.role,outcome:e.outcome,hint_level:e.hint_level,novelty:e.novelty,confidence:e.confidence??1,
    minutes_into_session:e.ctx?.minutes_into_session??null,local_hour:e.ctx?.local_hour??null,fingerprint:e.ctx?.fp??itemOf.get(e.item_id)?.fingerprint??null,teaches:!!itemOf.get(e.item_id)?.teaches}));
  evidenceFacts.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0));          // canonical order: the output never depends on row order
  // --- sessions: first session, absence
  const sessionDays=r.sessions.map((s:any)=>String(s.study_day||studyDay({time_zone:s.time_zone||zone,rollover_hour:st.rollover_hour},s.started_at)).slice(0,10));
  const lastSessionDay=sessionDays.length?sessionDays.slice().sort().pop() as DateStr:null;
  const absentDays=lastSessionDay?Math.max(0,diffDays(today,lastSessionDay)):0;
  // --- per project
  const proj:Record<string,ProjectView>={};
  const planProjects:PlanProject[]=[...projects].sort((a:any,b:any)=>a.slug<b.slug?-1:a.slug>b.slug?1:0).map((p:any)=>{
    const t=ptime.get(p.id)!;
    const classIds=new Set(r.cpConcepts.filter((x:any)=>cpById.get(x.checkpoint_id)?.project_id===p.id).map((x:any)=>classOf(x.concept_id)));
    const due=rechecks.rechecks.filter(x=>x.state==='open'&&x.due&&classIds.has(x.class_id)&&(!t.lastStudyOn||x.due<=t.lastStudyOn)).length;
    return {id:p.id,slug:p.slug,lastStudyOn:t.lastStudyOn,share:p.share_weight??null,autoPrune:!!p.auto_prune_standard,
      paceSamples:paceSamples(r,p.id),reviewMinutes:due*DEFAULTS.recheckMinutes+(r.dueCards[p.id]??0)*DEFAULTS.cardMinutes};
  });
  const slugOf=new Map(planProjects.map(p=>[p.id,p.slug]));
  const sortedCps=cps.filter(c=>slugOf.has(c.project_id)).sort((a,b)=>(slugOf.get(a.project_id)as string).localeCompare(slugOf.get(b.project_id)as string)||a.position-b.position);
  const pstate:PruneState={today,projects:planProjects,cps:sortedCps,capOf,usedToday,
    reviewShare:st.capacity?.review_share??DEFAULTS.reviewShare,bufferMin:false};
  const ev=evaluate(pstate);
  const pr=prune(pstate);
  const baselineBy=new Map<string,any>();
  for(const b of r.baselines){const cur=baselineBy.get(b.project_id);if(!cur||b.baseline_version>cur.baseline_version)baselineBy.set(b.project_id,b)}
  for(const p of [...projects].sort((a:any,b:any)=>a.slug<b.slug?-1:a.slug>b.slug?1:0)){
    const t=ptime.get(p.id)!,mine=r.sessions.filter((s:any)=>s.project_id===p.id);
    const first=mine.length?mine.map((s:any)=>String(s.study_day||studyDay({time_zone:s.time_zone||zone,rollover_hour:st.rollover_hour},s.started_at)).slice(0,10)).sort()[0]:null;
    const base=baselineBy.get(p.id);
    const baseline=(base?asArr(base.entries):cps.filter(c=>c.project_id===p.id).map(c=>({checkpoint_id:c.id,due_on:c.dueOn}))) as {checkpoint_id:string;due_on:DateStr|null}[];
    const block=timeBlock({today,zone,project:t,firstSession:first,
      cps:cps.filter(c=>c.project_id===p.id).map(c=>({id:c.id,code:c.code,done:c.status==='demonstrated',inactive:c.planState!=='active',position:c.position})),
      baseline,capacityToday,usedToday});
    const f=ev[p.id];
    proj[p.id]={id:p.id,slug:p.slug,title:p.title,time:t,mode:modeOf(today,t),firstSession:first,
      feasibility:f&&t.lastStudyOn?{raw:Math.round(f.raw),supply:Math.round(f.supply),required:Math.round(f.required),review:Math.round(f.review),slack:Math.round(f.slack),buffer:Math.round(f.buffer)}:null,
      block,atRisk:pr.atRisk.some(a=>a.project_id===p.id),unconfirmed:!t.confirmed};
  }
  // --- queue: the real plan (applied deferrals only). Proposed pruning is shown in FLAGS and feasibility, never silently applied here.
  const order=[...planProjects].sort((a,b)=>(a.lastStudyOn??'9999').localeCompare(b.lastStudyOn??'9999')||a.slug.localeCompare(b.slug));
  const todaysCps=cps.filter(c=>c.status==='in_progress'||(c.status==='not_started'&&c.planState==='active'&&c.prereqs.every(id=>planById.get(id)?.status==='demonstrated'||planById.get(id)?.planState!=='active')));
  const first=new Set<string>();const todays:PlanCp[]=[];
  for(const p of order){const mine=todaysCps.filter(c=>c.project_id===p.id).sort((a,b)=>(a.status==='in_progress'?0:1)-(b.status==='in_progress'?0:1)||a.position-b.position)[0];if(mine&&!first.has(p.id)){first.add(p.id);todays.push(mine)}}
  // Rechecks are keyed by class (canonical alias), so prerequisite edges are matched and recorded by class too.
  const needed=new Set<string>();
  for(const c of todays)for(const x of r.cpConcepts.filter((x:any)=>x.checkpoint_id===c.id)){
    const target=classOf(x.concept_id);
    for(const l of r.conceptLinks)if(l.kind==='prereq'&&classOf(l.to_id)===target)needed.add(classOf(l.from_id));
  }
  const importance=(cid:string)=>classes[cid]?.core?2:1;
  const reviews:ReviewItem[]=dueRechecks(rechecks.rechecks,today).filter(x=>classes[x.class_id]?.active!==false).map(x=>({
    type:'recheck' as const,ref:(classes[x.class_id]?.name??x.class_id)+'/'+x.level,classId:x.class_id,system:concepts.get(x.class_id)?.parent_id??null,
    minutes:DEFAULTS.recheckMinutes,retrievability:retrievabilityOf(x,today,weights),importance:importance(x.class_id),prereqOfToday:needed.has(x.class_id)}));
  const dueCards=Object.values(r.dueCards).reduce((a,b)=>a+b,0);
  if(dueCards>0)reviews.push({type:'cards',ref:'cards:'+dueCards,classId:'cards',system:null,minutes:dueCards*DEFAULTS.cardMinutes,retrievability:0.7,importance:1,prereqOfToday:false});
  const primary=order.length?proj[order[0].id]:null;
  const mode:Mode=order.length?(order.some(p=>proj[p.id].mode==='normal')?'normal':order.every(p=>proj[p.id].mode==='post_deadline')?'post_deadline':order.some(p=>proj[p.id].mode==='deadline_today')?'deadline_today':'normal'):'no_deadline';
  const queue=buildQueue({today,mode:primary?mode:'normal',capacity:capacityToday.minutes,configured:capacityToday.configured,used:usedToday,
    reviewShare:pstate.reviewShare,reviewBudgetMinutes:st.review_budget?.minutes??20,reviews,projects:planProjects,
    cps:pstate.cps,nextStudyDays:[1,2,3].map(n=>addDays(today,n)).filter(d=>order.some(p=>p.lastStudyOn&&d<=p.lastStudyOn)),
    absentDays,probeConcepts:[...needed].map(id=>concepts.get(id)?.name).filter(Boolean)});
  const deprecatedWarnings:string[]=[];
  for(const p of projects)for(const f of ['prompt','goal','target_label'] as const)if(lintText(p[f]).length)deprecatedWarnings.push(p.slug+'.'+f);
  return {today,zone,flags,capacityToday,usedToday,projects:proj,rechecks,queue,prune:pr,deprecatedWarnings,capacityUnset:!capacityToday.configured,absentDays,classOf,evidenceFacts,withdrawn};
}
export type {Recheck};
export {studyDaysLeft,isLive,estRemaining,paceFactor};
