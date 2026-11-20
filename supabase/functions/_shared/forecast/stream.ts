import { ForecastGuard, validProbability } from './guard.ts';
import { Tracker, type Query } from './tracker.ts';
export const FORECAST_VERSION='atlas-latent-guard-2026-11-20.1';
export interface ForecastScope {owner:string;project:string;concept:string;facet:string;context:string;rubric:string}
export interface StreamEvent {
  scope:ForecastScope; id:string; origin:string; at:string; knownAt:string; actor:'owner'|'assessor'|'tutor';
  kind:Query['kind']; outcome:boolean|null; difficulty?:number; hint:number; reliability:number;
  uncued:boolean; worked:boolean; feedback?:boolean; nativeProbability?:number;
}
export interface ForecastRequest {scope:ForecastScope;asOf:string;kind:'attempt'|'recall'|'execution';difficulty?:number;nativeProbability?:number;nativeAsOf?:string}
const day=(iso:string)=>Date.parse(iso)/86400000;
const key=(s:ForecastScope)=>JSON.stringify([s.owner,s.project,s.concept,s.facet,s.context,s.rubric]);
export function scopedForecast(events:readonly StreamEvent[],request:ForecastRequest){
  const scope=key(request.scope),cutoff=Date.parse(request.asOf);
  if(!Number.isFinite(cutoff)||!Object.values(request.scope).every(x=>typeof x==='string'&&x.trim()))throw Error('Unregistered forecast target');
  const tracker=new Tracker(),guard=new ForecastGuard(),seen=new Set<string>(),origins=new Set<string>();
  let wins=0,total=0;
  for(const e of [...events].filter(e=>key(e.scope)===scope&&Date.parse(e.knownAt)<=cutoff&&Date.parse(e.at)<=Date.parse(e.knownAt))
      .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id))){
    if(e.actor==='tutor'&&e.kind!=='lesson'||seen.has(e.id)||origins.has(e.origin)||!e.id||!e.origin||
      (e.kind!=='lesson'&&(e.outcome===null||e.reliability<=0||e.hint===4||e.worked)))continue;
    const q:Query={day:day(e.at),kc:scope,kind:e.kind,hint:e.hint,reliability:e.reliability,difficulty:e.difficulty};
    const ref=e.kind==='attempt'&&validProbability(e.nativeProbability)?e.nativeProbability:undefined;
    if(e.kind==='attempt'&&e.uncued&&!e.hint&&e.reliability===1){
      if(ref!==undefined)guard.observe(ref,[tracker.predict(q,ref).probability,(wins+1)/(total+2)],e.outcome!);
      total++;wins+=Number(e.outcome);
    }
    tracker.update({query:q,outcome:e.outcome,eventId:e.id,sourceId:e.origin,feedback:e.feedback},ref);
    seen.add(e.id);origins.add(e.origin);
  }
  const ref=request.kind==='attempt'&&validProbability(request.nativeProbability)&&request.nativeAsOf&&Date.parse(request.nativeAsOf)<=cutoff?request.nativeProbability:undefined;
  const q:Query={day:day(request.asOf),kc:scope,kind:request.kind,difficulty:request.difficulty};
  const forecast=tracker.predict(q,ref);
  const shield=ref===undefined?null:guard.predict(ref,[forecast.probability,(wins+1)/(total+2)]);
  return {scope:request.scope,version:FORECAST_VERSION,asOf:request.asOf,status:forecast.observations?'estimated':'uncertain',
    native:ref??null,guarded:!!shield,guardObservations:guard.observations,shieldWeights:shield?.weights??null,
    ...forecast,probability:shield?.forecast??forecast.probability};
}
