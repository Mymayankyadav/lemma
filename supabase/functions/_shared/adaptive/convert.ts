import {normaliseName} from './links.ts';
import {validateTemplate,type PlanTemplate} from './template.ts';
export type ConversionInput={project:any;checkpoints:any[];concepts:any[];cards:any[];sources?:any[];misconceptions?:any[];probes?:any[]};
export type Conversion=PlanTemplate&{map:Record<string,{id?:string;skipped?:boolean;reason?:string}>;kcs:{name:string;kind:string;concept_id?:string}[];cards:{id?:string;action:'keep'|'revise'|'suspend'|'new'|'delete';front?:string;back?:string;reason:string}[]};
export function validateConversion(input:ConversionInput,value:unknown):string[]{
 const c=value as Conversion,errors=validateTemplate(value);if(!c||!c.map||!Array.isArray(c.cards)||!Array.isArray(c.kcs))return [...errors,'Conversion requires map, kcs and cards'];
 for(const old of input.checkpoints){const m=c.map[old.id];if(!m){errors.push('Missing mapping for '+old.id);continue;}if(m.skipped&&!m.reason)errors.push('Skipped CP needs a reason: '+old.id);
  const next=c.checkpoints.find(x=>x.id===m.id);
  if(!m.skipped&&!next)errors.push('Mapping target missing: '+old.id);
  if(old.status==='demonstrated'&&(m.skipped||m.id!==old.id||(next&&JSON.stringify(next.steps)!==JSON.stringify(old.steps))))errors.push('Done CP must stay unchanged: '+old.id);
  if(old.kind==='cards'&&old.status!=='demonstrated'&&(!m.skipped||m.reason!=='template:cards-in-close'))errors.push('Open cards CP must move into Close: '+old.id);
 }
 for(const card of c.cards){const old=input.cards.find(x=>x.id===card.id);if(old&&(old.reps>0||old.reviews>0)&&card.action==='delete')errors.push('Reviewed card cannot be deleted: '+old.id);if(!card.reason)errors.push('Card action needs a reason');if(card.action!=='new'&&!old)errors.push('Unknown card '+card.id);}
 for(const old of input.cards)if(!c.cards.some(x=>x.id===old.id))errors.push('Missing card decision '+old.id);
 for(const k of c.kcs){const old=input.concepts.find(x=>normaliseName(x.name)===normaliseName(k.name));if(old&&k.concept_id!==old.id)errors.push('Reuse existing concept '+old.id);}
 return [...new Set(errors)];
}
export const conversionInstructions='Convert this project to plan_template_v1. Preserve meaning, completed checkpoints, evidence, dates and reviewed-card history. Map every old CP. Open cards CPs move into Close with reason template:cards-in-close. Reuse matching concept ids. Never invent sources or pages; supplied page labels are the complete source context. Prefer fewer cards. Return JSON only, with checkpoints, map, kcs, cards and item specs.';
export const conversionRetry=(attempts:number,errors:string[])=>errors.length?attempts<2?{retry:true,flag:false,errors}:{retry:false,flag:true,errors}:{retry:false,flag:false,errors:[]};
