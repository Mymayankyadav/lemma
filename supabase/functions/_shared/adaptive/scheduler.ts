// Atlas v3 scheduler rules that are decisions about the plan, not about memory (10 §4, §6, §7, §8). Pure and deterministic (I3).
import {memoryAt,type MeasurementState} from './measure.ts';

/** 10 §4: prune below 0.80; restore only above 0.95 on 2 consecutive study days. Between the bands nothing changes, so a noisy series cannot flip-flop. */
export type PruneState={pruned:boolean;upDays:number;lastDay:string|null};
export const PRUNE_BELOW=.8,RESTORE_ABOVE=.95,RESTORE_DAYS=2;
export const initialPrune:PruneState={pruned:false,upDays:0,lastDay:null};
export function stepPrune(prev:PruneState,day:string,pAll:number):{state:PruneState;action:'prune'|'restore'|'hold'}{
 if(prev.lastDay===day)return {state:prev,action:'hold'};      // one decision per study day (the first run of the day is the frozen one)
 if(!Number.isFinite(pAll))return {state:{...prev,lastDay:day},action:'hold'};
 if(!prev.pruned){
  return pAll<PRUNE_BELOW?{state:{pruned:true,upDays:0,lastDay:day},action:'prune'}:{state:{...prev,upDays:0,lastDay:day},action:'hold'};
 }
 if(pAll>RESTORE_ABOVE){const upDays=prev.upDays+1;return upDays>=RESTORE_DAYS?{state:{pruned:false,upDays:0,lastDay:day},action:'restore'}:{state:{...prev,upDays,lastDay:day},action:'hold'};}
 return {state:{...prev,upDays:0,lastDay:day},action:'hold'};
}

/** 10 §6: each core item whose predicted recall at the exam is below 0.90 gets one review in the final three study days (spread over them, earliest first by need). */
export type FinalTarget={concept_id:string;facet:string;core:boolean};
export type FinalReview={concept_id:string;facet:string;day:string;retention:number};
export function finalReviews(model:MeasurementState,targets:FinalTarget[],studyDays:string[],examDay:string):FinalReview[]{
 const last3=studyDays.filter(d=>d<=examDay).sort().slice(-3);if(!last3.length)return [];
 const t=Date.parse(examDay+'T00:00:00Z'),list=targets.filter(x=>x.core).map(x=>({x,r:model.hypotheses.reduce((a,h,i)=>a+model.pi[i]*memoryAt(h.memory[x.concept_id],t),0)}))
  .filter(({r})=>r<.9).sort((a,b)=>a.r-b.r||a.x.concept_id.localeCompare(b.x.concept_id)||a.x.facet.localeCompare(b.x.facet));
 return list.map(({x,r},i)=>({concept_id:x.concept_id,facet:x.facet,day:last3[i%last3.length],retention:r}));
}

/** 10 §7: after more than three study days away, the session opens with three probes on the current checkpoint's prerequisites. */
export function reentryProbes(daysSinceStudy:number,prereqConcepts:{id:string;p:number}[]):string[]{
 if(!(daysSinceStudy>3))return [];
 return prereqConcepts.slice().sort((a,b)=>a.p-b.p||a.id.localeCompare(b.id)).slice(0,3).map(c=>c.id);
}

/** 10 §8: one utility over all projects. Every project keeps P_core ≥ 0.8 where possible; the earliest deadline breaks ties; `share_weight` overrides. */
export type ProjectNeed={id:string;pCore:number;deadline:string|null;weight:number;examWeight?:number;share_weight?:number|null;needMinutes:number};
export function allocateProjects(projects:ProjectNeed[],minutes:number):{id:string;minutes:number;reason:string}[]{
 const out=new Map(projects.map(p=>[p.id,{id:p.id,minutes:0,reason:'no time left'}]));let left=Math.max(0,minutes);
 const rank=(a:ProjectNeed,b:ProjectNeed)=>(b.share_weight??0)-(a.share_weight??0)||(a.deadline??'9999-12-31').localeCompare(b.deadline??'9999-12-31')||a.pCore-b.pCore||a.id.localeCompare(b.id);
 const risk=projects.filter(p=>p.pCore<.8).sort(rank);
 // first: bring every project below the P_core floor up, in rank order, each capped at an equal share of what is left so none starves another
 for(const [i,p] of risk.entries()){const give=Math.min(p.needMinutes,left/(risk.length-i));const o=out.get(p.id)!;o.minutes+=give;o.reason='P_core '+p.pCore.toFixed(2)+' below 0.80';left-=give;}
 // then the remainder by weight (share_weight overrides the exam weight), capped by need
 const w=(p:ProjectNeed)=>Math.max(0,p.share_weight??p.weight*(p.examWeight??1));
 let open=projects.filter(p=>(out.get(p.id)!.minutes<p.needMinutes)&&w(p)>0);
 for(let guard=0;left>1e-9&&open.length&&guard<10;guard++){
  const total=open.reduce((a,p)=>a+w(p),0);let used=0;
  for(const p of open){const o=out.get(p.id)!,give=Math.min(p.needMinutes-o.minutes,left*w(p)/total);o.minutes+=give;used+=give;if(!o.reason.startsWith('P_core'))o.reason=p.share_weight!=null?'share weight':'weighted share';}
  left-=used;open=open.filter(p=>out.get(p.id)!.minutes<p.needMinutes-1e-9);
 }
 return projects.map(p=>out.get(p.id)!);
}
