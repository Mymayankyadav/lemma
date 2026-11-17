// Plan arithmetic (spec §8.2–§8.4): estimates, pace, cross-project allocation, feasibility.
// Pure and deterministic: the same facts on the same local study day give the same output (I3).
import {daysBetween,diffDays,type DateStr} from './dates.ts';

export type Tier='core'|'standard'|'venture';
export type CpKind='learn'|'cards'|'milestone';
export const TIER_WEIGHT:Record<Tier,number>={venture:1,standard:3,core:9};
export type Step={tier:Tier;minutes:number|null;done:boolean;deferred:boolean;deferredAt?:number|null;deferredReason?:string|null};
export type PlanCp={
  id:string;code:string;project_id:string;position:number;stage:string|null;kind:CpKind;tier:Tier;
  estimate:number|null;pinned:boolean;status:'not_started'|'in_progress'|'demonstrated';
  planState:'active'|'deferred'|'skipped';deferredAt?:number|null;deferredReason?:string|null;
  steps:Step[];dueOn:DateStr|null;prereqs:string[];examWeight?:number;testOut?:boolean;compressed?:boolean;summary?:boolean;
};
export type PlanProject={
  id:string;slug:string;lastStudyOn:DateStr|null;share?:number|null;autoPrune:boolean;
  paceSamples:{estimated:number;actual:number}[];reviewMinutes:number;
};
export const DEFAULTS={testOutMinutes:15,cardsMinutes:20,milestoneMinutes:30,learnMinutes:60,summaryMinutes:15,
  reviewShare:0.25,reviewShareFloor:0.10,bufferShare:0.10,minBufferFraction:0.25,restoreMargin:0.10,
  recheckMinutes:3,cardMinutes:0.5};

export const isLive=(c:PlanCp)=>c.planState==='active'&&c.status!=='demonstrated';
/** Estimate with the §8.2 defaults when missing; `uncalibrated` flags a default. */
export function estimateOf(c:PlanCp,stageMinutes?:number,stageLearnCps?:number):{minutes:number;uncalibrated:boolean}{
  if(c.estimate!==null&&c.estimate>0)return {minutes:c.estimate,uncalibrated:false};
  if(c.kind==='cards')return {minutes:DEFAULTS.cardsMinutes,uncalibrated:true};
  if(c.kind==='milestone')return {minutes:DEFAULTS.milestoneMinutes,uncalibrated:true};
  const m=stageMinutes&&stageLearnCps?Math.round(stageMinutes/stageLearnCps):DEFAULTS.learnMinutes;
  return {minutes:Math.max(5,m),uncalibrated:true};
}
/** Minutes left on one CP before pace scaling: remaining, non-deferred steps (spec §8.2). */
export function estRemaining(c:PlanCp):number{
  if(!isLive(c))return 0;
  if(c.compressed||(c.testOut&&c.status==='not_started'))return DEFAULTS.testOutMinutes;
  const est=estimateOf(c).minutes;
  const extra=c.summary?DEFAULTS.summaryMinutes:0;
  if(!c.steps.length)return est+extra;
  const per=est/c.steps.length;
  return c.steps.filter(s=>!s.done&&!s.deferred).reduce((a,s)=>a+(s.minutes??per),0)+extra;
}
/** EWMA(α=0.3) of actual/estimated over completed CPs, clamped to [0.5, 3]; 1.0 until 3 samples. */
export function paceFactor(samples:{estimated:number;actual:number}[]):number{
  const ok=samples.filter(s=>s.estimated>0&&s.actual>=0);
  if(ok.length<3)return 1;
  let f=ok[0].actual/ok[0].estimated;
  for(const s of ok.slice(1))f=0.3*(s.actual/s.estimated)+0.7*f;
  return Math.min(3,Math.max(0.5,f));
}
export const requiredLearning=(cps:PlanCp[],pace:number)=>cps.reduce((a,c)=>a+estRemaining(c),0)*pace;
/** Projected review minutes: due rechecks and cards until last_study_on × mean minutes per item. */
export const reviewMinutes=(rechecks:number,cards:number,perRecheck=DEFAULTS.recheckMinutes,perCard=DEFAULTS.cardMinutes)=>rechecks*perRecheck+cards*perCard;

export type DayMinutes={day:DateStr;minutes:number};
export type AllocProject={id:string;lastStudyOn:DateStr|null;required:number;weight?:number|null;ratio?:number};
/** Earliest-deadline-first split of shared capacity (§8.4). Projects with the same deadline share each day in
 *  proportion to what they still need (so one with no sessions still reserves its share, and the neediest get most);
 *  leftover capacity goes to the earliest eligible project. Explicit weights override. */
export function allocate(days:DayMinutes[],projects:AllocProject[]):Record<string,DayMinutes[]>{
  const out:Record<string,DayMinutes[]>=Object.fromEntries(projects.map(p=>[p.id,[]]));
  const order=[...projects].sort((a,b)=>(a.lastStudyOn??'9999').localeCompare(b.lastStudyOn??'9999')||(a.ratio??0)-(b.ratio??0)||a.id.localeCompare(b.id));
  const weighted=projects.some(p=>p.weight!=null&&p.weight>0);
  const got=new Map(projects.map(p=>[p.id,0]));
  for(const d of days){
    const elig=order.filter(p=>p.lastStudyOn===null?false:p.lastStudyOn>=d.day);
    const give=new Map<string,number>();
    let left=Math.max(0,Math.floor(d.minutes));
    if(weighted&&elig.length){
      const tot=elig.reduce((a,p)=>a+(p.weight&&p.weight>0?p.weight:0),0)||elig.length;
      let used=0;
      for(const p of elig){const x=Math.floor(left*((p.weight&&p.weight>0?p.weight:(tot===elig.length?1:0))/tot));give.set(p.id,x);used+=x}
      give.set(elig[0].id,(give.get(elig[0].id)??0)+(left-used));left=0;
    }else{
      const groups:AllocProject[][]=[];
      for(const p of elig){const g=groups[groups.length-1];if(g&&g[0].lastStudyOn===p.lastStudyOn)g.push(p);else groups.push([p])}
      for(const g of groups){
        const needs=g.map(p=>Math.max(0,Math.ceil(p.required-(got.get(p.id)??0))));
        const total=needs.reduce((a,b)=>a+b,0);
        if(total===0)continue;
        const pool=Math.min(left,total);let used=0;
        g.forEach((p,k)=>{const x=Math.min(needs[k],Math.floor(pool*needs[k]/total));give.set(p.id,x);used+=x});
        // rounding remainder, one minute at a time, to the projects with the lowest slack ratio first
        for(let k=0;used<pool&&k<g.length*pool;k++){const i=k%g.length;if((give.get(g[i].id)??0)<needs[i]){give.set(g[i].id,(give.get(g[i].id)??0)+1);used++}}
        for(const p of g)got.set(p.id,(got.get(p.id)??0)+(give.get(p.id)??0));
        left-=used;
      }
      if(left>0&&elig.length)give.set(elig[0].id,(give.get(elig[0].id)??0)+left);
    }
    for(const p of projects)out[p.id].push({day:d.day,minutes:give.get(p.id)??0});
  }
  return out;
}
export type FeasibilityIn={
  share:DayMinutes[];required:number;reviewMinutes:number;reviewShare?:number;bufferMin?:boolean;
};
export type Feasibility={raw:number;buffer:number;supply:number;required:number;review:number;slack:number;meanDaily:number;days:number};
/** supply = Σ share − buffer; required = learning + min(projected reviews, review_share × raw supply); slack = supply − required. */
export function feasibility(i:FeasibilityIn):Feasibility{
  const raw=i.share.reduce((a,d)=>a+d.minutes,0),days=i.share.length;
  const meanDaily=days?raw/days:0;
  const full=Math.max(0.5*meanDaily,DEFAULTS.bufferShare*raw);
  const buffer=i.bufferMin?Math.min(full,DEFAULTS.minBufferFraction*meanDaily):full;
  const review=Math.min(i.reviewMinutes,(i.reviewShare??DEFAULTS.reviewShare)*raw);
  const supply=raw-buffer,required=i.required+review;
  return {raw,buffer,supply,required,review,slack:supply-required,meanDaily,days};
}
export function capacityDays(today:DateStr,last:DateStr|null,capOf:(d:DateStr)=>number,usedToday:number):DayMinutes[]{
  if(!last||last<today)return [];
  return daysBetween(today,last).map(d=>({day:d,minutes:Math.max(0,capOf(d)-(d===today?usedToday:0))}));
}
export const daysAfter=(a:DateStr,b:DateStr)=>diffDays(a,b);
