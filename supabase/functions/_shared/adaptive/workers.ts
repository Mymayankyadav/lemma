// Worker pipeline core (spec §12). Pure: the model is injected, so tests use a mock and no key exists yet.
// Small models extract, tag and propose; they never decide correctness, set outcomes, merge concepts or change tiers (I8).
import type {Level,Outcome,Novelty} from './recheck.ts';
export const LEVEL_SET=new Set<string>(['recall','use','understand','transfer']);
export const ROLE_SET=new Set<string>(['primary','secondary','used']);
export const NOVELTY_SET=new Set<string>(['novel','familiar','seen_solution','self_reported']);
export type ScribeEvent={id:string;kind:string;outcome:Outcome;hint_level:number;text:string;session_id:string;checkpoint_id:string|null;tutorTagged:boolean};
export type ScribeRow={event_id:string;concept_id:string;level:string;role?:string;novelty?:string;item_text?:string;confidence?:number};
export type EvidenceDraft={session_event_id:string;concept_id:string;level:Level;role:'primary'|'secondary'|'used';novelty:Novelty;outcome:Outcome;hint_level:number;
  origin:'scribe';confidence:number;item_text?:string};
export type ScribeResult={drafts:EvidenceDraft[];unresolved:{event_id:string;reason:string}[]};
/** Validate whatever the model said. A concept outside the candidates is unresolved, never invented; outcome and hint come from the event. */
export function validateScribe(rows:unknown,events:ScribeEvent[],candidates:Set<string>,confidenceScale=1):ScribeResult{
  const byId=new Map(events.map(e=>[e.id,e]));const drafts:EvidenceDraft[]=[];const unresolved:ScribeResult['unresolved']=[];const done=new Set<string>();
  const list=Array.isArray(rows)?rows:[];
  for(const r of list as ScribeRow[]){
    const e=r&&typeof r==='object'?byId.get(String((r as any).event_id)):undefined;
    if(!e){continue}                                                    // an event the model made up
    if(e.tutorTagged||done.has(e.id))continue;                          // tutor tags win; one row per event
    done.add(e.id);
    if(!candidates.has(String(r.concept_id))){unresolved.push({event_id:e.id,reason:'concept not in candidates'});continue}
    if(!LEVEL_SET.has(String(r.level))){unresolved.push({event_id:e.id,reason:'invalid level'});continue}
    const conf=Math.min(1,Math.max(0,Number(r.confidence)));
    drafts.push({session_event_id:e.id,concept_id:r.concept_id,level:r.level as Level,role:(ROLE_SET.has(String(r.role))?r.role:'primary') as any,
      novelty:(NOVELTY_SET.has(String(r.novelty))?r.novelty:'novel') as Novelty,outcome:e.outcome,hint_level:e.hint_level,origin:'scribe',
      confidence:Number.isFinite(conf)?Math.min(0.9,conf)*confidenceScale:0.5*confidenceScale,
      ...(typeof r.item_text==='string'&&r.item_text?{item_text:r.item_text.slice(0,300)}:{})});
  }
  for(const e of events)if(!e.tutorTagged&&!done.has(e.id))unresolved.push({event_id:e.id,reason:'not tagged by the model'});
  return {drafts,unresolved};
}
export type JobState={enabled:boolean;tokensToday:number;tokenCap:number;done:Set<string>};
export type Telemetry={job:string;input_id:string;status:'ok'|'failed'|'skipped_disabled'|'skipped_cap'|'skipped_done';input_tokens:number;output_tokens:number;attempts:number;error?:string};
export type Model=(prompt:string)=>Promise<{json:unknown;input_tokens:number;output_tokens:number}>;
/** Idempotent per (job, input_id); one retry; kill switch and daily token cap; every outcome is telemetry. */
export async function runJob<T>(s:JobState,job:string,inputId:string,estimateTokens:number,model:Model,prompt:string,write:(json:unknown)=>T):Promise<{telemetry:Telemetry;result?:T}>{
  const key=job+':'+inputId;
  const base={job,input_id:inputId,input_tokens:0,output_tokens:0,attempts:0};
  if(!s.enabled)return {telemetry:{...base,status:'skipped_disabled'}};
  if(s.done.has(key))return {telemetry:{...base,status:'skipped_done'}};
  if(s.tokensToday+estimateTokens>s.tokenCap)return {telemetry:{...base,status:'skipped_cap'}};
  let last='';
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const out=await model(prompt);
      s.tokensToday+=out.input_tokens;
      const result=write(out.json);                                    // the write is one transaction in the adapter; an exception rolls it back
      s.done.add(key);
      return {telemetry:{...base,status:'ok',attempts:attempt,input_tokens:out.input_tokens,output_tokens:out.output_tokens},result};
    }catch(err){last=err instanceof Error?err.message:'failed'}
  }
  return {telemetry:{...base,status:'failed',attempts:2,error:last.slice(0,200)}};
}
/** Candidate concepts for the scribe: the checkpoint's concepts, their prerequisites and children, and the top 20 by text match (§12). */
export function scribeCandidates(cp:string[],prereqs:Map<string,string[]>,children:Map<string,string[]>,textMatches:string[]):Set<string>{
  const out=new Set<string>(cp);
  for(const c of cp){for(const p of prereqs.get(c)??[])out.add(p);for(const k of children.get(c)??[])out.add(k)}
  for(const m of textMatches.slice(0,20))out.add(m);
  return out;
}
/** Prompt cache friendliness: the system prompt is fixed; only the events and candidates vary. */
export const SCRIBE_SYSTEM='You tag study events. For each event return {event_id, concept_id, level, role, novelty, item_text, confidence}. concept_id must be one of the candidates; if none fits, use null. Never judge correctness and never change outcomes.';
export function scribePrompt(events:ScribeEvent[],candidates:{id:string;name:string}[]):string{
  return 'CANDIDATES\n'+candidates.map(c=>c.id+' '+c.name).join('\n')+'\nEVENTS\n'+events.map(e=>e.id+' ['+e.kind+'/'+e.outcome+'] '+e.text.slice(0,300)).join('\n');
}
// ---- the gardener's deterministic proposals (§12): exact normalised name under the same-named parent topic
export const normName=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
export type Concept={id:string;name:string;subject_id:string;parent_id:string|null};
export function aliasProposals(concepts:Concept[]):{auto:[string,string][];propose:[string,string][]}{
  const byName=new Map<string,Concept[]>();
  for(const c of concepts)(byName.get(normName(c.name))??byName.set(normName(c.name),[]).get(normName(c.name))!).push(c);
  const parentName=(c:Concept)=>{const p=concepts.find(x=>x.id===c.parent_id);return p?normName(p.name):null};
  const auto:[string,string][]=[],propose:[string,string][]=[];
  for(const g of byName.values()){
    const subs=[...new Set(g.map(c=>c.subject_id))];if(subs.length<2)continue;
    const sorted=[...g].sort((a,b)=>a.id<b.id?-1:1);
    for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
      const a=sorted[i],b=sorted[j];if(a.subject_id===b.subject_id)continue;
      const pa=parentName(a),pb=parentName(b);
      (pa&&pa===pb?auto:propose).push([a.id,b.id]);
    }
  }
  return {auto,propose};
}
