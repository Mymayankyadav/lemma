import {facetForLevel} from './kc.ts';
import type {Attempt,AttemptTag,Instruction} from './measure.ts';
export function migrateEvidence(evidence:any[]):{attempts:Attempt[];tags:AttemptTag[];instructions:Instruction[];report:{source:number;attempts:number;merged:number;untagged:number;instructions:number;unresolved:string[]}}{
 const live=evidence.filter(e=>!e.voided_at&&!e.superseded_by).sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||Number(a.id)-Number(b.id)),groups=new Map<string,any[]>();
 for(const e of live){const k=JSON.stringify([Math.floor(Date.parse(e.occurred_at)/1000),e.concept_id,e.level,e.outcome]);(groups.get(k)??groups.set(k,[]).get(k)!).push(e);}
 const attempts:Attempt[]=[],tags:AttemptTag[]=[],instructions:Instruction[]=[],unresolved:string[]=[];
 for(const g of groups.values()){g.sort((a,b)=>Number(a.id)-Number(b.id));const e=g[0],weight=(e.confidence??1)*({novel:1,familiar:.5,seen_solution:.2,self_reported:.2}[e.novelty as string]??1);
  attempts.push({id:e.id,occurred_at:e.occurred_at,session_id:e.session_id,project_id:e.project_id,checkpoint_id:e.checkpoint_id,item_id:e.item_id,item_kind:e.kind==='pretest'?'prepare':['recall','recheck'].includes(e.kind)?e.kind:'legacy',legacy_outcome:e.outcome,weight,novelty:e.novelty,context:{merged:g.slice(1).map(e=>e.id),source_evidence_id:e.id}});
  if(e.concept_id)tags.push({attempt_id:e.id,concept_id:e.concept_id,facet:facetForLevel(e.level),role:e.role==='primary'?'target':e.role==='secondary'?'required':'incidental',hint_level:e.hint_level??0,confidence:1});else unresolved.push(String(e.id));
 }
 const pre=new Map<string,number>(),done=new Set<string>();for(const e of live){if(!e.session_id||!e.concept_id)continue;const k=e.session_id+':'+e.concept_id,t=Date.parse(e.occurred_at);if(e.kind==='pretest'){if(!pre.has(k))pre.set(k,t);}else if(pre.has(k)&&t>=pre.get(k)!&&!done.has(k)){done.add(k);instructions.push({id:'legacy:'+k,occurred_at:e.occurred_at,concept_id:e.concept_id});}}
 return {attempts,tags,instructions,report:{source:live.length,attempts:attempts.length,merged:live.length-attempts.length,untagged:unresolved.length,instructions:instructions.length,unresolved}};
}
