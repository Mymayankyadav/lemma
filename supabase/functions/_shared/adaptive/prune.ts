// Pruning, restoring and feasibility across projects (spec §8.3–§8.5). Pure.
// I4: nothing is deleted; an action only defers. I6: done, in-progress, pinned and core items are never pruned.
import {type DateStr} from './dates.ts';
import {allocate,capacityDays,estRemaining,feasibility,paceFactor,isLive,requiredLearning,DEFAULTS,TIER_WEIGHT,
  type PlanCp,type PlanProject,type Feasibility,type Tier} from './plan.ts';

export type PruneState={
  today:DateStr;projects:PlanProject[];cps:PlanCp[];capOf:(d:DateStr)=>number;usedToday:number;
  reviewShare:number;bufferMin:boolean;
};
export type ActionKind='defer_step'|'defer_cp'|'compress_cp'|'lower_review_share'|'shrink_buffer';
export type Action={kind:ActionKind;project_id:string;ref:string;step?:number;reason:string;minutes_saved:number;needs_approval:boolean;summary_for?:string};
export type AtRisk={project_id:string;slack:number;items:{ref:string;minutes:number}[];choices:['extend_deadline','add_capacity','cut_named_items']};
export type PruneResult={actions:Action[];state:PruneState;slack:Record<string,number>;atRisk:AtRisk[];ask:{question:'which_project_first';projects:string[]}|null};

const clone=(s:PruneState):PruneState=>({...s,cps:s.cps.map(c=>({...c,steps:c.steps.map(x=>({...x}))})),projects:s.projects.map(p=>({...p}))});
export function evaluate(s:PruneState):Record<string,Feasibility&{ratio:number}>{
  const live=s.projects.filter(p=>p.lastStudyOn!==null&&p.lastStudyOn>=s.today);
  const days=(()=>{const last=live.reduce((m,p)=>(p.lastStudyOn as string)>m?(p.lastStudyOn as string):m,s.today);return capacityDays(s.today,last,s.capOf,s.usedToday)})();
  const req=(p:PlanProject)=>requiredLearning(s.cps.filter(c=>c.project_id===p.id),paceFactor(p.paceSamples));
  const standalone=(p:PlanProject)=>{
    const f=feasibility({share:capacityDays(s.today,p.lastStudyOn,s.capOf,s.usedToday),required:req(p),reviewMinutes:p.reviewMinutes,reviewShare:s.reviewShare,bufferMin:s.bufferMin});
    return f.slack/Math.max(1,f.required);
  };
  const alloc=allocate(days,live.map(p=>({id:p.id,lastStudyOn:p.lastStudyOn,required:req(p)+Math.min(p.reviewMinutes,s.reviewShare*1e9),weight:p.share??null,ratio:standalone(p)})));
  const out:Record<string,Feasibility&{ratio:number}>={};
  for(const p of s.projects){
    if(p.lastStudyOn===null||p.lastStudyOn<s.today){out[p.id]={...feasibility({share:[],required:req(p),reviewMinutes:0}),ratio:0};continue}
    const share=(alloc[p.id]??[]).filter(d=>d.day<=(p.lastStudyOn as string));
    out[p.id]={...feasibility({share,required:req(p),reviewMinutes:p.reviewMinutes,reviewShare:s.reviewShare,bufferMin:s.bufferMin}),ratio:standalone(p)};
  }
  return out;
}
const dependents=(s:PruneState,c:PlanCp)=>s.cps.filter(x=>x.project_id===c.project_id&&x.prereqs.includes(c.id)&&isLive(x)&&x.id!==c.id);
const valuePerMinute=(s:PruneState,c:PlanCp)=>TIER_WEIGHT[c.tier]*(1+dependents(s,c).length)*(c.examWeight??1)/Math.max(1,estRemaining(c));
const protectedCp=(c:PlanCp)=>c.pinned||c.status!=='not_started'||c.tier==='core';
const stageLearn=(s:PruneState,c:PlanCp)=>s.cps.filter(x=>x.project_id===c.project_id&&x.stage===c.stage&&x.kind==='learn');
const live=(s:PruneState,pid:string)=>s.cps.filter(c=>c.project_id===pid&&isLive(c));

type Cand=()=>Action|null;
function venture(s:PruneState,pid:string):Action|null{
  for(const c of [...live(s,pid)].sort((a,b)=>b.position-a.position)){
    if(c.pinned)continue;
    for(let i=c.steps.length-1;i>=0;i--){const st=c.steps[i];
      if(st.tier==='venture'&&!st.done&&!st.deferred)return {kind:'defer_step',project_id:pid,ref:c.code,step:i+1,reason:'prune:venture_step',minutes_saved:st.minutes??(c.estimate??DEFAULTS.learnMinutes)/Math.max(1,c.steps.length),needs_approval:false};
    }
  }
  return null;
}
function ventureCp(s:PruneState,pid:string):Action|null{
  // A venture CP that a kept CP depends on is skipped (never prune a prerequisite of a kept CP).
  const c=[...live(s,pid)].filter(x=>x.tier==='venture'&&!protectedCp(x)&&dependents(s,x).length===0).sort((a,b)=>b.position-a.position)[0];
  return c?{kind:'defer_cp',project_id:pid,ref:c.code,reason:'prune:venture_cp',minutes_saved:estRemaining(c),needs_approval:false}:null;
}
function compress(s:PruneState,pid:string):Action|null{
  const c=[...live(s,pid)].filter(x=>x.tier==='standard'&&x.testOut&&!x.compressed&&x.status==='not_started'&&!x.pinned&&estRemaining(x)>DEFAULTS.testOutMinutes).sort((a,b)=>b.position-a.position)[0];
  return c?{kind:'compress_cp',project_id:pid,ref:c.code,reason:'prune:test_out',minutes_saved:estRemaining(c)-DEFAULTS.testOutMinutes,needs_approval:false}:null;
}
function standardStep(s:PruneState,pid:string):Action|null{
  const auto=s.projects.find(p=>p.id===pid)?.autoPrune===true;
  for(const c of [...live(s,pid)].sort((a,b)=>b.position-a.position)){
    if(c.pinned||c.tier!=='standard'||c.kind==='cards')continue;
    const open=c.steps.map((x,i)=>({x,i})).filter(({x})=>!x.done&&!x.deferred);
    if(open.length<=1)continue;                                     // the last step goes with the CP (stage 5)
    for(const {x,i} of [...open].reverse())if(x.tier==='standard')
      return {kind:'defer_step',project_id:pid,ref:c.code,step:i+1,reason:'prune:standard_step',minutes_saved:x.minutes??(c.estimate??DEFAULTS.learnMinutes)/Math.max(1,c.steps.length),needs_approval:!auto};
  }
  return null;
}
function standardCp(s:PruneState,pid:string):Action|null{
  const auto=s.projects.find(p=>p.id===pid)?.autoPrune===true;
  const cand=live(s,pid).filter(c=>c.tier==='standard'&&!protectedCp(c)&&c.kind==='learn')
    .map(c=>({c,deps:dependents(s,c).length,vpm:valuePerMinute(s,c)}))
    .sort((a,b)=>a.vpm-b.vpm||b.c.position-a.c.position);
  for(const {c,deps} of cand){
    const saved=estRemaining(c)-(deps?DEFAULTS.summaryMinutes:0);
    if(saved<=0)continue;                                           // a prerequisite summary would cost as much as the CP
    const dep=deps?dependents(s,c).sort((a,b)=>a.position-b.position)[0]:null;
    return {kind:'defer_cp',project_id:pid,ref:c.code,reason:'prune:standard_cp',minutes_saved:saved,needs_approval:!auto,...(dep?{summary_for:dep.code}:{})};
  }
  return null;
}
function reviewShare(s:PruneState):Action|null{
  return s.reviewShare>DEFAULTS.reviewShareFloor?{kind:'lower_review_share',project_id:'*',ref:'review_share',reason:'prune:review_share',minutes_saved:0,needs_approval:false}:null;
}
function shrinkBuffer(s:PruneState):Action|null{
  return s.bufferMin?null:{kind:'shrink_buffer',project_id:'*',ref:'buffer',reason:'prune:buffer',minutes_saved:0,needs_approval:false};
}
function apply(s:PruneState,a:Action):void{
  const c=s.cps.find(x=>x.project_id===a.project_id&&x.code===a.ref);
  if(a.kind==='lower_review_share'){s.reviewShare=DEFAULTS.reviewShareFloor;return}
  if(a.kind==='shrink_buffer'){s.bufferMin=true;return}
  if(!c)return;
  if(a.kind==='defer_step'&&a.step)c.steps[a.step-1].deferred=true;
  if(a.kind==='compress_cp')c.compressed=true;
  if(a.kind==='defer_cp'){
    c.planState='deferred';c.deferredReason=a.reason;
    if(a.summary_for){const d=s.cps.find(x=>x.project_id===a.project_id&&x.code===a.summary_for);if(d)d.summary=true}
  }
}
/** If every learn CP of a stage is deferred, its cards CP is deferred with it (§6). */
function cardsFollow(s:PruneState,pid:string,out:Action[]):void{
  for(const c of s.cps.filter(x=>x.project_id===pid&&x.kind==='cards'&&isLive(x)&&!x.pinned&&x.status==='not_started')){
    const learn=stageLearn(s,c);
    if(learn.length&&learn.every(x=>x.planState!=='active'||x.status==='demonstrated')&&learn.some(x=>x.planState!=='active')){
      const a:Action={kind:'defer_cp',project_id:pid,ref:c.code,reason:'prune:stage_empty',minutes_saved:estRemaining(c),needs_approval:false};
      apply(s,a);out.push(a);
    }
  }
}
const STAGES:((s:PruneState,pid:string)=>Action|null)[]=[venture,ventureCp,compress,standardStep,standardCp];

/** Apply §8.5 in order, recomputing slack after every action; stop as soon as slack ≥ 0. Never touches core. */
export function prune(input:PruneState):PruneResult{
  const s=clone(input);const actions:Action[]=[];
  const slackOf=()=>Object.fromEntries(Object.entries(evaluate(s)).map(([k,v])=>[k,v.slack]));
  for(let guard=0;guard<500;guard++){
    const ev=evaluate(s);
    const neg=s.projects.filter(p=>p.lastStudyOn!==null&&p.lastStudyOn>=s.today&&ev[p.id].slack<0)
      .sort((a,b)=>(a.lastStudyOn as string).localeCompare(b.lastStudyOn as string)||ev[a.id].ratio-ev[b.id].ratio||a.id.localeCompare(b.id));
    let moved=false;
    for(const p of neg){
      let a:Action|null=null;
      for(const stage of STAGES){a=stage(s,p.id);if(a)break}
      if(!a)a=reviewShare(s);
      if(!a)a=shrinkBuffer(s);
      if(a){apply(s,a);actions.push(a);cardsFollow(s,p.id,actions);moved=true;break}
    }
    if(!moved)break;
  }
  const slack=slackOf();
  const atRisk:AtRisk[]=s.projects.filter(p=>slack[p.id]<0&&p.lastStudyOn!==null&&p.lastStudyOn>=s.today).map(p=>({
    project_id:p.id,slack:Math.round(slack[p.id]),
    items:s.cps.filter(c=>c.project_id===p.id&&isLive(c)&&c.tier==='core').map(c=>({ref:c.code,minutes:Math.round(estRemaining(c))})),
    choices:['extend_deadline','add_capacity','cut_named_items']}));
  return {actions,state:s,slack,atRisk,ask:atRisk.length>1?{question:'which_project_first',projects:atRisk.map(a=>a.project_id)}:null};
}
export type Restored={kind:'restore_cp'|'restore_step';project_id:string;ref:string;step?:number};
/** Restore in exactly the reverse order of deferral while slack stays ≥ 0 (§8.5). Caller enforces the 2-day hysteresis. */
export function restore(input:PruneState):{restored:Restored[];state:PruneState}{
  const s=clone(input);const restored:Restored[]=[];
  type Item={at:number;pos:number;undo:()=>void;redo:()=>void;r:Restored};
  const items:Item[]=[];
  for(const c of s.cps){
    if(c.planState==='deferred'&&(c.deferredReason??'').startsWith('prune:'))
      items.push({at:c.deferredAt??0,pos:c.position,r:{kind:'restore_cp',project_id:c.project_id,ref:c.code},
        undo:()=>{c.planState='active'},redo:()=>{c.planState='deferred'}});
    c.steps.forEach((x,i)=>{if(x.deferred&&(x.deferredReason??'').startsWith('prune:'))
      items.push({at:x.deferredAt??0,pos:c.position,r:{kind:'restore_step',project_id:c.project_id,ref:c.code,step:i+1},
        undo:()=>{x.deferred=false},redo:()=>{x.deferred=true}})});
  }
  items.sort((a,b)=>b.at-a.at||b.pos-a.pos);
  for(const it of items){
    it.undo();
    const ev=evaluate(s);
    if(ev[it.r.project_id]&&ev[it.r.project_id].slack<0){it.redo();break}
    restored.push(it.r);
  }
  return {restored,state:s};
}
export type {Tier};
