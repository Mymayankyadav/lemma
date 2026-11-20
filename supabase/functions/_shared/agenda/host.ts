import { assembleAtlas, type AtlasRows } from '../adaptive/atlas.ts';
import type { Action } from '../adaptive/kg.ts';
import { productForecast, type ForecastPractice, type PreloggedForecast } from '../forecast/product.ts';
import type { BankItem } from '../practice/questions.ts';
import { NATIVE } from '../practice/router.ts';
import { requestedAlgorithm, type AgendaDecision } from './contract.ts';
import { decideAgenda, holdReceipt, type ShadowResult } from './decision.ts';
import type { Commitment, Fixed, Observation, Snapshot, Task, Window } from './types.ts';

interface CalendarBlock {
  id:string; revision:number; startsAt:string; endsAt:string; projectId?:string|null;
  bufferBeforeMinutes?:number; bufferAfterMinutes?:number; capacityMinutes?:number|null; capacityDate?:string;
}
interface HostTask {
  id:string; title:string; project_id:string|null; estimate_minutes:number|null;
  deadline:string|null; priority:'high'|'normal'|'low';
}
interface Event {
  ownerId:string; source:string; lineageId:string; revision:number; kind:'void'|'record';
  occurredAt:string; reportedAt:string; knownAt:string; payload?: Record<string,unknown>;
}
export interface HostData {
  asOf:string;watermark:string;reason?:string;rows?:AtlasRows;tasks?:HostTask[];evidence?:Event[];
  calendar?:{asOf:string;watermark:string;horizonEnd:string;status:string;fixed:CalendarBlock[];availability:CalendarBlock[]|null};
  forecastEnabled?:boolean;prelogged?:PreloggedForecast[];practiceBank?:Omit<BankItem,'nativeProbability'|'nativeAsOf'>[];spentByDate?:Record<string,number>;history?:Observation[];occupied?:boolean;reservations?:{task_id:string;starts_at:string;ends_at:string}[];
}
const minute=(value:string)=>Date.parse(value)/60000;
const isNumber=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
function scopedEvents(owner:string,asOf:string,events:Event[]) {
  const latest=new Map<string,Event>();
  for(const event of events) {
    if(event.ownerId!==owner || !Number.isInteger(event.revision) || event.revision<1 ||
        [event.occurredAt,event.reportedAt,event.knownAt].some(at=>!Number.isFinite(Date.parse(at))||Date.parse(at)>Date.parse(asOf)))
      throw Error('Untrusted evidence snapshot');
    const key=event.source+'/'+event.lineageId, previous=latest.get(key);
    if(!previous || previous.revision<event.revision) latest.set(key,event);
  }
  const facts=(source:string)=>[...latest.values()].filter(e=>e.source===source && e.kind==='record').map(e=>({...e.payload!,knownAt:e.knownAt}));
  return {attempts:facts('attempts'),attemptTags:facts('attempt_tags'),instructionEvents:facts('instruction_events')};
}

/** Spend declared daily capacity inside the actually free part of the declared wall window. */
function calendarWindows(blocks:CalendarBlock[],fixed:Fixed[],now:number,end:number,spent:Record<string,number>):Window[] {
  const out:Window[]=[], remainder=new Map<string,number>();
  let previousEnd=-Infinity;
  for(const block of blocks.slice().sort((a,b)=>minute(a.startsAt)-minute(b.startsAt))) {
    const start=Math.max(now,minute(block.startsAt)), stop=Math.min(end,minute(block.endsAt));
    if(!Number.isFinite(start)||!Number.isFinite(stop)||minute(block.endsAt)<minute(block.startsAt))throw Error('Invalid interval');
    if(start<previousEnd)throw Error('Conflicting owned windows');
    previousEnd=stop;
    if(block.capacityMinutes==null) {
      if(stop>start)out.push({start,end:stop,projectId:block.projectId??undefined});
      continue;
    }
    if(!isNumber(block.capacityMinutes)||block.capacityMinutes<0)throw Error('Invalid capacity');
    const date=block.capacityDate??block.id,consumed=spent[date]??0;
    if(!isNumber(consumed)||consumed<0)throw Error('Invalid consumed capacity');
    let left=remainder.get(date)??Math.max(0,block.capacityMinutes-consumed), at=start;
    const take=(until:number)=>{
      const span=Math.min(left,Math.max(0,until-at));
      if(span>0)out.push({start:at,end:at+span,projectId:block.projectId??undefined});
      left-=span;
    };
    for(const b of fixed.filter(b=>b.end+(b.after??0)>start && b.start-(b.before??0)<stop)
      .sort((a,b)=>(a.start-(a.before??0))-(b.start-(b.before??0)))) {
      take(Math.min(stop,b.start-(b.before??0)));
      at=Math.max(at,b.end+(b.after??0));
    }
    take(stop);
    remainder.set(date,left);
  }
  return out;
}
export type OwnerRead = {decision:AgendaDecision; label?:string; baselineLabel?:string; practice?:ForecastPractice; candidate:AgendaDecision; elapsedMs:number; hardViolations:number};
/** Accepts only the result of the owner-bound DB adapter. No user request fields enter the snapshot. */
export function ownerAgenda(owner:string,host:HostData,released:boolean,clock?:()=>number):OwnerRead {
  const setting=host.rows?.settings?.scheduling_algorithm, requested=requestedAlgorithm(setting,released);
  const labels=new Map<string,string>();
  const finish=(r:ShadowResult):OwnerRead=>({decision:r.served,candidate:r.candidate,elapsedMs:r.elapsedMs,
    hardViolations:r.hardViolations,baselineLabel:r.served.baseline.kind==='action'?labels.get(r.served.baseline.taskId):undefined,label:r.served.outcome.kind==='action'?labels.get(r.served.outcome.taskId):undefined});
  const blocked=(reason:string,kind:'unavailable'|'protected'='unavailable')=>{
    const receipt=holdReceipt(host.asOf,host.watermark,requested,reason,null,kind);
    return finish({served:receipt,candidate:receipt,elapsedMs:0,hardViolations:0});
  };
  const rows=host.rows, calendar=host.calendar;
  if(!rows || !calendar || host.reason || calendar.status!=='ok' || calendar.watermark!==host.watermark ||
    Date.parse(calendar.asOf)!==Date.parse(host.asOf))return blocked(host.reason??'Calendar snapshot unavailable');
  if(host.occupied)return blocked('Resume or finish the current study timer before starting another task','protected');
  const now=minute(host.asOf),end=minute(calendar.horizonEnd),evidence=scopedEvents(owner,host.asOf,host.evidence??[]);
  const fixed:Fixed[]=calendar.fixed.map(b=>({id:b.id,revision:b.revision,start:minute(b.startsAt),end:minute(b.endsAt),
    before:b.bufferBeforeMinutes??0,after:b.bufferAfterMinutes??0}));
  const reservedWithoutEstimate=(host.reservations??[]).filter(r=>!(host.tasks??[]).some(t=>t.id===r.task_id&&isNumber(t.estimate_minutes)&&t.estimate_minutes>0));
  for(const r of reservedWithoutEstimate)fixed.push({id:'reserved/'+r.task_id+'/'+r.starts_at,start:minute(r.starts_at),end:minute(r.ends_at)});
  const availability=calendar.availability===null?undefined:calendarWindows(calendar.availability,fixed,now,end,host.spentByDate??{});
  const candidates:Action[]=[];
  const nativeRows={...rows,...evidence};
  const view=assembleAtlas(nativeRows,new Date(host.asOf),actions=>candidates.push(...actions));
  const actionsById=new Map<string,Action>();
  const liveProjects=new Set(rows.projects.map(p=>p.id)),commitments=new Map<string,Commitment>();
  const liveCheckpoints=rows.checkpoints.filter(c=>liveProjects.has(c.project_id)&&c.status!=='demonstrated'&&(!c.plan_state||c.plan_state==='active'));
  const nextByProject=new Map<string,typeof liveCheckpoints[number]>();
  for(const checkpoint of liveCheckpoints.slice().sort((a,b)=>a.position-b.position||String(a.id).localeCompare(String(b.id))))
    if(!nextByProject.has(checkpoint.project_id))nextByProject.set(checkpoint.project_id,checkpoint);
  const tasks:Task[]=candidates.flatMap(action=>{
    const project=action.project_id??action.home;
    if(project && !liveProjects.has(project)||action.kind==='close'||action.minutes<=0)return [];
    const checkpoint=project?nextByProject.get(project):undefined;
    const id=project?project+'/'+action.id:action.id, deadline=action.needAt===undefined?end:action.needAt/60000;
    actionsById.set(id,action);
    const core=checkpoint?.tier==='core'&&rows.cpConcepts.some(c=>c.checkpoint_id===checkpoint.id&&c.concept_id===action.concept_id);
    if(core && action.forced && rows.projects.some(p=>p.id===project&&p.time_confirmed===true&&p.last_study_on) && (action.kind==='teach'||action.kind==='check'))commitments.set(id,{
      taskId:id,source:'atlas-v3',confirmedCore:true,forced:true,actionKind:action.kind,conceptId:action.concept_id,
      maxMinutes:action.minutes,phase:action.kind==='teach'?'teaching':'certification',deadline:Math.min(deadline,end)});
    const name=rows.concepts.find(c=>c.id===action.concept_id)?.name;
    labels.set(id,({practice:'Practice',check:'Check',teach:'Learn',review:'Review',probe:'Revisit'})[action.kind]+(name?' · '+name:''));
    return [{id,nativeId:action.id,kind:action.kind==='review'?'card':'course',remaining:action.minutes,due:deadline,splittable:false,
      importance:action.weight??1,projectId:project,core,atlasAction:action}];
  });
  for(const task of host.tasks??[]){
    if(!isNumber(task.estimate_minutes)||task.estimate_minutes<=0)continue;
    const id='task/'+task.id;
    labels.set(id,task.title);
    tasks.push({id,kind:'personal',projectId:task.project_id??undefined,remaining:task.estimate_minutes,
      due:task.deadline?minute(task.deadline):end,importance:{low:.5,normal:1,high:3}[task.priority],splittable:false});
  }
  const reservations=(host.reservations??[]).map(r=>({taskId:'task/'+r.task_id,start:minute(r.starts_at),end:minute(r.ends_at)}));
  const state:Snapshot={now,end,fixed,availability,tasks,personalReservations:reservations,
    protectedPersonal:reservations.map(r=>r.taskId),confirmedDeadlines:(host.tasks??[]).filter(t=>t.deadline).map(t=>'task/'+t.id),
    atlasModel:view.model,cardCap:view.settings.card_cap,ownerPreferences:{cardWeight:rows.settings?.atlas?.card_weight},
    atlasProjects:rows.projects.map(p=>({id:p.id,pCore:view.fits[p.id]?.pCore??1,deadline:p.last_study_on??null,share_weight:p.share_weight})),history:host.history??[]};
  const read=finish(decideAgenda({asOf:host.asOf,watermark:host.watermark,state,capacityKnown:calendar.availability!==null,verifiedCommitments:commitments},requested,clock));
  const unsized=(host.tasks??[]).filter(t=>!isNumber(t.estimate_minutes)||t.estimate_minutes<=0)
    .map(t=>({taskId:'task/'+t.id,reason:'A positive work estimate is needed'}));
  if(unsized.length)read.decision.unresolved=[...(read.decision.unresolved??[]),...unsized];
  const picked=read.decision.outcome;
  const action=picked.kind==='action'?actionsById.get(picked.taskId):undefined;
  if(action&&picked.kind==='action'){
    // The owner's engine choice covers learning as well as scheduling. Keep trial enrollment intact while opting out of serving it.
    const newLearning=requested==='new',bank=host.practiceBank??[];
    const selectedBank:typeof bank=newLearning?bank:bank.map(item=>({...item,arm:NATIVE}));
    try {read.practice=productForecast(owner,host.asOf,action,picked.end-picked.start,view,nativeRows,selectedBank,newLearning&&host.forecastEnabled===true,host.prelogged);}
    catch {read.practice={status:'unavailable',reason:'Forecast or bank inputs unavailable',version:'atlas-latent-guard-2026-11-20.1',native:action.p,arm:'atlas80'};}
  }
  return read;
}
