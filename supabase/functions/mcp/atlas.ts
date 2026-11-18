import {all,scoped,type Context} from './db.ts';
import {assembleAtlas,atlasCard,type AtlasRows} from '../_shared/adaptive/atlas.ts';
import {probes} from '../_shared/adaptive/policy.ts';
import {TEMPLATE_RULES} from '../_shared/adaptive/template.ts';
import {conversionInstructions} from '../_shared/adaptive/convert.ts';
import {KINDS,FACETS,STAGES} from '../_shared/adaptive/kc.ts';
import type {Rows} from '../_shared/adaptive/facts.ts';
export const ATLAS_READS=['profile','theme','themes','bridges','probes','model_health','plan_template','card_budget','conversion_input','atlas_concepts','atlas_settings'] as const;
const optional=async(p:Promise<any[]>):Promise<any[]>=>{try{return await p;}catch(e){if(/does not exist|schema cache/i.test(String(e)))return [];throw e;}};
/** Deterministic pages (ordered by id) so a table larger than one page is read whole; `all` cut a read off at 1,000 unordered rows. */
export async function allPaged(c:Context,table:string,pageSize=1000,maxPages=50):Promise<any[]>{
 const out:any[]=[];
 for(let page=0;page<maxPages;page++){
  const {data,error}=await scoped(c,table).order('id').range(page*pageSize,page*pageSize+pageSize-1) as any;
  if(error)throw Error(error.message);
  out.push(...(data??[]));if((data?.length??0)<pageSize)break;
 }
 return out;
}
export async function loadAtlasRows(c:Context):Promise<Partial<Rows>>{
 const [attempts,attemptTags,instructionEvents,atlasLinks,modelFits,cards,notes,reviews,studyEntries]=await Promise.all([
  optional(scoped(c,'attempts').order('occurred_at').order('id').limit(5000).then((r:any)=>{if(r.error)throw Error(r.error.message);return r.data??[];})),
  optional(allPaged(c,'attempt_tags')),optional(allPaged(c,'instruction_events')),optional(allPaged(c,'atlas_links')),optional(all(c,'model_fits')),
  allPaged(c,'cards'),allPaged(c,'notes'),allPaged(c,'reviews'),allPaged(c,'study_entries')]);
 return {attempts,attemptTags,instructionEvents,atlasLinks,modelFits,cards,notes,reviews,studyEntries};
}
export function validateAttempt(value:unknown):string[]{
 const errors:string[]=[],a=value as any;if(!a||typeof a!=='object'||Array.isArray(a))return ['attempt must be an object'];
 if(a.kind!==undefined&&!['practice','stretch','prepare','select','micro','recall','recheck','retry','holdout','legacy'].includes(a.kind))errors.push('Invalid attempt kind');
 for(const [key,lo,hi] of [['confidence_before',0,1],['minutes',0,600],['plan_score',0,3]] as const)if(a[key]!=null&&(typeof a[key]!=='number'||!Number.isFinite(a[key])||a[key]<lo||a[key]>hi))errors.push('Invalid '+key);
 if(a.plan_score!=null&&!Number.isInteger(a.plan_score))errors.push('plan_score must be an integer');
 if(a.cued!==undefined&&(!Array.isArray(a.cued)||a.cued.length>24||a.cued.some((x:any)=>typeof x!=='string'||!/^[0-9a-f-]{36}$/i.test(x))))errors.push('cued must contain concept UUIDs');
 if(!Array.isArray(a.stages)||!a.stages.length||a.stages.length>4)return [...errors,'stages must contain 1–4 stages'];
 let previous=-1;for(const s of a.stages){if(!s||typeof s!=='object'){errors.push('Invalid stage');continue;}const index=STAGES.indexOf(s.stage);if(index<0||index<=previous)errors.push('Stages must be U → S → E → C without repeats');previous=index;
  if(!['ok','fail','not_reached'].includes(s.result))errors.push('Invalid stage result');if(s.hint!=null&&(!Number.isInteger(s.hint)||s.hint<0||s.hint>4))errors.push('Invalid hint');
  if(!Array.isArray(s.tags)||s.tags.length<1||s.tags.length>12){errors.push('Stage needs 1–12 tags');continue;}
  const seen=new Set<string>();for(const t of s.tags){if(!t||typeof t.concept!=='string'||!FACETS.includes(t.facet)||!['target','required','incidental'].includes(t.role??'target'))errors.push('Invalid stage tag');const key=t?.concept+':'+t?.facet;if(seen.has(key))errors.push('Duplicate stage tag');seen.add(key);}
  if(s.error&&(!s.tags.some((t:any)=>t.concept===s.error.concept)||!['misread_definition','quantifier_order','unjustified_step','missing_case','wrong_approach','slip'].includes(s.error.tag)))errors.push('Error must name a stage tag and valid error code');
 }
 return errors;
}
export function renderAtlasRead(rows:Rows,a:any,now=new Date()):string{
 if(a.what==='plan_template')return TEMPLATE_RULES;
 const view=assembleAtlas(rows,now),id=String(a.id??a.project??''),concept=rows.concepts.find(c=>c.id===id||c.slug===id||c.name===id),project=rows.projects.find(p=>p.id===id||p.slug===id);
 if(a.what==='atlas_settings')return JSON.stringify(rows.settings?.atlas??{});
 if(a.what==='atlas_concepts')return JSON.stringify(rows.concepts.map(c=>({id:c.id,name:c.name,kind:c.kind??'topic',family_id:c.family_id,version:c.version})));
 if(a.what==='model_health'||a.what==='calibration')return JSON.stringify({health:view.health,mix:view.model.mix,coupling:view.model.pi});
 if(a.what==='card_budget')return JSON.stringify(view.budget);
 if(a.what==='probes')return JSON.stringify(probes(view.model,rows.settings?.atlas?.threshold_p));
 if(a.what==='theme'||a.what==='themes')return JSON.stringify(view.themes.filter(t=>!id||t.id===concept?.id).map(t=>({...t,instances:t.instances.map(id=>({id,card:atlasCard(view,id)}))})));
 if(a.what==='bridges')return JSON.stringify(view.bridges);
 if(a.what==='profile'){const ids=project?rows.cpConcepts.filter(x=>rows.checkpoints.some(c=>c.id===x.checkpoint_id&&c.project_id===project.id)).map(x=>x.concept_id):rows.concepts.filter(c=>c.id===concept?.id||c.parent_id===concept?.id).map(c=>c.id);return JSON.stringify([...new Set(ids)].map(id=>({id,name:rows.concepts.find(c=>c.id===id)?.name,facets:view.facets[id]})));}
 if(a.what==='conversion_input'){
  if(!project)throw Error('Project id or slug required');const cps=rows.checkpoints.filter(c=>c.project_id===project.id),notes=(rows.notes??[]).filter(n=>n.project_id===project.id);
  return JSON.stringify({instructions:conversionInstructions,template:TEMPLATE_RULES,project,checkpoints:cps,concepts:rows.concepts.filter(c=>c.subject_id===project.subject_id),cards:notes.map(n=>({...n,reps:(rows.cards??[]).filter(c=>c.note_id===n.id).reduce((a,c)=>a+c.reps,0)})),misconceptions:rows.misconceptions.filter(m=>m.project_id===project.id)});
 }
 if(a.what==='node'){if(!concept)return 'Unknown concept';return a.depth==='profile'?JSON.stringify({card:atlasCard(view,concept.id),facets:view.facets[concept.id]}):atlasCard(view,concept.id);}
 return JSON.stringify(view.fits);
}
