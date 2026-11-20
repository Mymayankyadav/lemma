import type { ForecastScope, StreamEvent } from '../forecast/stream.ts';
import { scopedForecast, sameForecastScope } from '../forecast/stream.ts';
import { validProbability } from '../forecast/guard.ts';
import { NATIVE, type Arm, type Scope } from './router.ts';
export interface BankItem extends Scope {
  id:string;project:string;concept:string;facet:string;context:string;family:string;
  form:'whole'|'step'|'micro'|'recall'|'worked'; minutes:number;uncued:boolean;novel:boolean;approved:boolean;
  registeredAt:string; itemVersion?:number;nativeOrder?:number; nativeAsOf:string; nativeProbability:number; difficulty:number;
  expertProbabilities?:Partial<Record<Arm,number>>;expertAsOf?:string;arm:Arm;
}
export interface SelectionScope extends ForecastScope {track:string;policy:string;bank:string}
export function selectPracticeQuestion(items:readonly BankItem[],events:readonly StreamEvent[],scope:SelectionScope,
  asOf:string,minutes:number,must:'independent'|'whole'|'worked',forecastEnabled=true){
  const when=Date.parse(asOf);
  const group=items.filter(i=>i.approved&&i.track===scope.track&&i.policy===scope.policy&&i.bank===scope.bank&&i.rubric===scope.rubric&&
    i.project===scope.project&&i.concept===scope.concept&&i.facet===scope.facet&&i.context===scope.context&&
    Date.parse(i.registeredAt)<=when&&Number.isFinite(i.minutes)&&i.minutes>0&&i.minutes<=minutes&&
    (must==='worked'?i.form==='worked':i.form!=='worked'&&i.uncued&&(must!=='whole'||i.form==='whole'&&i.novel)));
  if(!group.length)return null;
  const timelyNative=(i:BankItem)=>Date.parse(i.nativeAsOf)<=when;
  const nativeScore=(i:BankItem)=>{
    if(timelyNative(i)&&Number.isInteger(i.nativeOrder))return [0,i.nativeOrder!];
    if(timelyNative(i)&&validProbability(i.nativeProbability))return [1,Math.abs(i.nativeProbability-.80)];
    return [2,Infinity];
  };
  const compare=(a:BankItem,b:BankItem,score:(i:BankItem)=>number[])=>{
    const x=score(a),y=score(b);
    return x[0]-y[0]||x[1]-y[1]||a.id.localeCompare(b.id);
  };
  const native=group.filter(i=>nativeScore(i)[0]<2).sort((a,b)=>compare(a,b,nativeScore))[0];
  if(!native)return null;
  const forecasts=new Map(forecastEnabled?group.map(i=>[i.id,scopedForecast(events,{scope,asOf,
    kind:i.form==='recall'||i.form==='micro'?'recall':'attempt',difficulty:i.difficulty,
    nativeProbability:i.nativeProbability,nativeAsOf:i.nativeAsOf})] as const):[]);
  const arms=new Set(group.map(i=>i.arm));
  let arm:Arm=arms.size===1?group[0].arm:NATIVE;
  let selected=native;
  if(arm!==NATIVE){
    const target=arm==='hard72'?.72:arm==='easy88'?.88:.80;
    const estimates=group.map(i=>{
      const probability=arm==='hard72'||arm==='easy88'?(forecasts.get(i.id)?.probability??(timelyNative(i)?i.nativeProbability:null)):
        (i.expertAsOf&&Date.parse(i.expertAsOf)<=when?i.expertProbabilities?.[arm]:null);
      return {i,probability};
    }).filter(x=>validProbability(x.probability)).sort((a,b)=>
      Math.abs(a.probability!-target)-Math.abs(b.probability!-target)||a.i.id.localeCompare(b.i.id));
    if(estimates.length)selected=estimates[0].i;
    else arm=NATIVE;
  }
  return {id:selected.id,itemVersion:selected.itemVersion,nativeId:native.id,nativeVersion:native.itemVersion,form:selected.form,minutes:selected.minutes,arm,scope,
    native:selected.nativeProbability,nativeItemProbability:native.nativeProbability,forecast:forecasts.get(selected.id)??null};
}
export interface ProofEvent extends StreamEvent {
  session:string;item:string;family:string;form:BankItem['form'];novel:boolean;
}
/** The later demonstration must occur on a declared local study day after the most recent lesson. */
export function proofCertificate(events:readonly ProofEvent[],scope:ForecastScope,asOf:string,
  execution:number,recall:number,zone:string,studyWeekdays:readonly number[]){
  const no=(reason:string)=>({certified:false,reason,origins:[] as string[]});
  if(!validProbability(execution)||!validProbability(recall)||execution<.80||recall<.85)return no('Posterior or current recall below threshold');
  const days=new Set(studyWeekdays);
  if(!days.size||[...days].some(d=>!Number.isInteger(d)||d<0||d>6))return no('Study days unavailable');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  // Teaching another facet of this target may reset its proof, but a different bank, policy or track cannot certify it.
  const cut=Date.parse(asOf),relevant=events.filter(e=>sameForecastScope({...e.scope,facet:scope.facet},scope)&&
    (e.actor!=='tutor'||e.kind==='lesson')&&Date.parse(e.knownAt)<=cut&&Date.parse(e.at)<=Date.parse(e.knownAt));
  const lessons=relevant.filter(e=>e.kind==='lesson').map(e=>date.format(new Date(e.at))).sort();
  const direct=relevant.filter(e=>e.kind==='attempt'&&e.outcome===true&&e.reliability===1&&e.scope.facet===scope.facet&&e.novel&&
    !e.worked&&!e.hint&&e.form!=='worked'&&e.origin&&e.item&&e.family&&e.session&&
    (scope.facet!=='construct'||e.form==='whole'&&e.uncued)&&(e.form!=='micro'||['recall','recognise'].includes(scope.facet))&&
    (!['select','transfer','construct'].includes(scope.facet)||e.uncued));
  for(const later of direct.slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))){
    const d=date.format(new Date(later.at));
    if(!days.has(new Date(d+'T00:00:00Z').getUTCDay())||lessons.length&&d<=lessons.at(-1)!)continue;
    const first=direct.find(e=>e.origin!==later.origin&&e.session!==later.session&&e.item!==later.item&&e.family!==later.family&&
      Date.parse(e.at)<Date.parse(later.at)&&date.format(new Date(e.at))<d);
    if(first)return {certified:true,reason:'Two independent dated demonstrations',origins:[first.origin,later.origin]};
  }
  return no('Independent qualifying evidence due');
}
