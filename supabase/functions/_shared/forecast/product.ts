import type { Action } from '../adaptive/kg.ts';
import type { AtlasReadModel, AtlasRows } from '../adaptive/atlas.ts';
import { predict } from '../adaptive/measure.ts';
import { FACETS, type Facet } from '../adaptive/kc.ts';
import type { ForecastScope } from './stream.ts';
import { FORECAST_VERSION } from './stream.ts';
import { proofCertificate, selectPracticeQuestion, type BankItem, type ProofEvent } from '../practice/questions.ts';
import { NATIVE } from '../practice/router.ts';

type StoredBank = Omit<BankItem,'nativeProbability'|'nativeAsOf'>;
export type ForecastPractice =
  | {status:'unavailable';reason:string;version:string;native:number|null;arm:'atlas80'}
  | {status:'available';questionId:string;form:string;minutes:number;arm:string;scope:ForecastScope;
    forecast:NonNullable<ReturnType<typeof selectPracticeQuestion>>['forecast'];certificate:ReturnType<typeof proofCertificate>};
const unavailable=(reason:string,native:number|null):ForecastPractice=>({status:'unavailable',reason,version:FORECAST_VERSION,native,arm:NATIVE});
/** Accepted, scoped bank rows and owner-graded evidence are the only product inputs to this forecast. */
export function productForecast(owner:string,asOf:string,action:Action,minutes:number,view:AtlasReadModel,rows:AtlasRows,bank:StoredBank[]):ForecastPractice {
  const project=action.project_id??action.home;
  if(!project||!['practice','teach','check','probe'].includes(action.kind))return unavailable('No registered practice target',action.p);
  const registered=bank.filter(i=>i.project===project&&i.concept===action.concept_id&&FACETS.includes(i.facet as Facet));
  const scopes=new Set(registered.map(i=>JSON.stringify([i.track,i.policy,i.bank,i.rubric,i.context,i.facet])));
  if(scopes.size!==1)return unavailable(scopes.size?'Conflicting bank scopes':'No approved bank for this target',action.p);
  const first=registered[0],scope={owner,project,concept:first.concept,facet:first.facet,context:first.context,
    rubric:first.rubric,bank:first.bank,policy:first.policy,track:first.track};
  // Recompute the native comparator only at the snapshot time; historical observations use their saved pre-update trace.
  const items:BankItem[]=registered.map(i=>({...i,nativeAsOf:asOf,
    nativeProbability:predict(view.model,i.concept,i.facet as Facet,view.model.now,i.difficulty)}));
  const byId=new Map(items.map(i=>[i.id,i])),events:ProofEvent[]=[];
  for(const a of rows.attempts??[]){
    const item=byId.get(a.item_id);
    if(!item||item.project!==a.project_id||a.grader!=='learner'||a.origin!=='user'||a.voided_at||a.superseded_by||
      Date.parse(item.registeredAt)>Date.parse(a.occurred_at))continue;
    const tags=(rows.attemptTags??[]).filter(t=>String(t.attempt_id)===String(a.id)&&t.role==='target'&&t.concept_id===item.concept&&t.facet===item.facet);
    const graded=tags.filter(t=>t.result==='ok'||t.result==='fail');
    if(!graded.length)continue;
    const outcome=graded.every(t=>t.result==='ok'),hint=Math.max(...graded.map(t=>Number(t.hint_level??0)));
    const trace=view.model.trace.filter(t=>t.stream==='attempt'&&t.id.startsWith(String(a.id)+':')&&t.concept_id===item.concept&&t.facet===item.facet);
    // Several internal updates may model one attempt. Only a unique matching binary target can anchor the shield.
    const native=trace.length===1&&trace[0].y===Number(outcome)?trace[0].p:undefined;
    const observations=graded.map(t=>Number(t.confidence??1));
    const reliability=Math.max(0,Math.min(1,Number(a.weight??1)*Math.min(...observations)));
    events.push({scope,id:'attempt/'+a.id,origin:a.source_evidence_id?'evidence/'+a.source_evidence_id:'attempt/'+a.id,
      at:a.occurred_at,knownAt:a.knownAt??a.occurred_at,actor:'owner',kind:item.form==='micro'||item.form==='recall'?'recall':'attempt',
      outcome,hint,reliability,uncued:item.uncued&&Array.isArray(a.cued)&&!a.cued.includes(item.concept),worked:item.form==='worked',
      feedback:false,nativeProbability:native,difficulty:item.difficulty,session:a.session_id??'',item:item.id,family:item.family,
      form:item.form,novel:item.novel&&a.context?.novelty==='novel'});
  }
  const question=selectPracticeQuestion(items,events,scope,asOf,minutes,action.kind==='teach'?'worked':action.kind==='check'?'whole':'independent');
  if(!question)return unavailable('No approved question fits the declared scope and minutes',action.p);
  const declared=rows.settings?.capacity?.weekday_minutes,days=Array.isArray(declared)?declared.flatMap((m,i)=>m>0?[i]:[]):[];
  // A forecast receipt can describe a proof certificate. It never writes a mastery fact or replaces v3 grading.
  const certificate=proofCertificate(events,scope,asOf,question.forecast.execution,question.forecast.recall,rows.settings?.time_zone??'UTC',days);
  return {status:'available',questionId:question.id,form:question.form,minutes:question.minutes,arm:question.arm,
    scope,forecast:question.forecast,certificate};
}
