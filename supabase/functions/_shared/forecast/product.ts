import type { Action } from '../adaptive/kg.ts';
import type { AtlasReadModel, AtlasRows } from '../adaptive/atlas.ts';
import { predict } from '../adaptive/measure.ts';
import { FACETS, type Facet } from '../adaptive/kc.ts';
import { FORECAST_VERSION } from './stream.ts';
import { proofCertificate, selectPracticeQuestion, type BankItem, type ProofEvent, type SelectionScope } from '../practice/questions.ts';
import { NATIVE, type Arm } from '../practice/router.ts';

export interface PreloggedForecast {requestId:string;itemId:string;version:number;at:string;scope:SelectionScope;native:number}
type StoredBank = Omit<BankItem,'nativeProbability'|'nativeAsOf'>;
export type ForecastPractice =
  | {status:'unavailable';reason:string;version:string;native:number|null;arm:'atlas80'}
  | {status:'available';questionId:string;form:string;minutes:number;arm:Arm;scope:SelectionScope;nativeQuestionId:string;native:number;nativeItemProbability:number;itemVersion?:number;nativeVersion?:number;
    forecast:NonNullable<ReturnType<typeof selectPracticeQuestion>>['forecast'];certificate:ReturnType<typeof proofCertificate>|null};
const unavailable=(reason:string,native:number|null):ForecastPractice=>({status:'unavailable',reason,version:FORECAST_VERSION,native,arm:NATIVE});
/** Accepted, scoped bank rows and owner-graded evidence are the only product inputs to this forecast. */
export function productForecast(owner:string,asOf:string,action:Action,minutes:number,view:AtlasReadModel,rows:AtlasRows,bank:StoredBank[],forecastEnabled:boolean,prelogged:readonly PreloggedForecast[]=[]):ForecastPractice {
  const project=action.project_id??action.home;
  if(!project||!['practice','teach','check','probe'].includes(action.kind))return unavailable('No registered practice target',action.p);
  const registered=bank.filter(i=>i.project===project&&i.concept===action.concept_id&&FACETS.includes(i.facet as Facet));
  const scopes=new Set(registered.map(i=>JSON.stringify([i.track,i.policy,i.bank,i.rubric,i.context,i.facet])));
  if(scopes.size!==1)return unavailable(scopes.size?'Conflicting bank scopes':'No approved bank for this target',action.p);
  const first=registered[0],scope={owner,project,concept:first.concept,facet:first.facet,context:first.context,
    rubric:first.rubric,bank:first.bank,policy:first.policy,track:first.track};
  // Compute the comparator at the current snapshot. Only a persisted, pre-outcome delivery can anchor an earlier safeguard update.
  const items:BankItem[]=registered.map(i=>({...i,nativeAsOf:asOf,
    nativeProbability:predict(view.model,i.concept,i.facet as Facet,view.model.now,i.difficulty)}));
  const byId=new Map(items.map(i=>[i.id,i])),events:ProofEvent[]=[];
  const bound=new Map(prelogged.filter(p=>Object.entries(scope).every(([k,v])=>p.scope[k as keyof SelectionScope]===v)).map(p=>[p.requestId,p]));
  const uses=new Map<string,number>();
  for(const a of rows.attempts??[])if(a.context?.practice_request_id&&!a.voided_at&&!a.superseded_by){
    const key=a.context.practice_request_id;uses.set(key,(uses.get(key)??0)+1);
  }
  const sessions=new Map(rows.sessions.map(s=>[s.id,s.project_id]));
  for(const lesson of rows.instructionEvents??[]){
    if(lesson.voided_at||lesson.concept_id!==scope.concept||!lesson.id||!lesson.source_key||
      !['tutor','migration'].includes(lesson.origin)||sessions.get(lesson.session_id)!==scope.project)continue;
    // The signed instruction event confirms teaching in this project and concept, never a scored demonstration.
    events.push({scope,id:'instruction/'+lesson.id,origin:'instruction/'+lesson.source_key,at:lesson.occurred_at,
      knownAt:lesson.knownAt??lesson.created_at,actor:'tutor',kind:'lesson',outcome:null,hint:0,reliability:1,uncued:false,
      worked:true,session:lesson.session_id,item:'',family:'',form:'worked',novel:false});
  }
  for(const a of rows.attempts??[]){
    const item=byId.get(a.item_id);
    if(!item||item.project!==a.project_id||a.grader!=='learner'||a.origin!=='user'||a.voided_at||a.superseded_by||
      Date.parse(item.registeredAt)>Date.parse(a.occurred_at))continue;
    const tags=(rows.attemptTags??[]).filter(t=>String(t.attempt_id)===String(a.id)&&t.role==='target'&&t.concept_id===item.concept&&t.facet===item.facet);
    const graded=tags.filter(t=>t.result==='ok'||t.result==='fail');
    if(!graded.length)continue;
    const outcome=graded.every(t=>t.result==='ok'),hint=Math.max(...graded.map(t=>Number(t.hint_level??0)));
    const request=a.context?.practice_request_id,offered=bound.get(request);
    const native=offered&&uses.get(request)===1&&offered.itemId===item.id&&offered.version===item.itemVersion&&
      Date.parse(offered.at)<Date.parse(a.occurred_at)?offered.native:undefined;
    const observations=graded.map(t=>Number(t.confidence??1));
    const reliability=Math.max(0,Math.min(1,Number(a.weight??1)*Math.min(...observations)));
    const knownAt=[a.knownAt??a.occurred_at,...graded.map(t=>t.knownAt??a.occurred_at)].sort((x,y)=>Date.parse(y)-Date.parse(x))[0];
    events.push({scope,id:'attempt/'+a.id,origin:a.source_evidence_id?'evidence/'+a.source_evidence_id:'attempt/'+a.id,
      at:a.occurred_at,knownAt,actor:'owner',kind:item.form==='micro'||item.form==='recall'?'recall':'attempt',
      outcome,hint,reliability,uncued:item.uncued&&Array.isArray(a.cued)&&!a.cued.includes(item.concept),worked:item.form==='worked',
      feedback:false,nativeProbability:native,difficulty:item.difficulty,session:a.session_id??'',item:item.id,family:item.family,
      form:item.form,novel:item.novel&&a.context?.novelty==='novel'});
  }
  const question=selectPracticeQuestion(items,events,scope,asOf,minutes,action.kind==='teach'?'worked':action.kind==='check'?'whole':'independent',forecastEnabled);
  if(!question)return unavailable('No approved question fits the declared scope and minutes',action.p);
  const declared=rows.settings?.capacity?.weekday_minutes;
  const days=Array.isArray(declared)&&declared.length===7?declared.flatMap((m,i)=>Number.isFinite(m)&&m>0?[i]:[]):
    Number.isFinite(declared)&&declared>0?[0,1,2,3,4,5,6]:[];
  // A forecast receipt can describe a proof certificate. It never writes a mastery fact or replaces v3 grading.
  const certificate=question.forecast&&proofCertificate(events,scope,asOf,question.forecast.execution,question.forecast.recall,rows.settings?.time_zone??'UTC',days);
  return {status:'available',questionId:question.id,nativeQuestionId:question.nativeId,native:question.native,nativeItemProbability:question.nativeItemProbability,itemVersion:question.itemVersion,nativeVersion:question.nativeVersion,form:question.form,minutes:question.minutes,arm:question.arm,
    scope,forecast:question.forecast,certificate};
}
