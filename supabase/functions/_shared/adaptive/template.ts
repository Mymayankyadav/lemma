import {KINDS,type Kind} from './kc.ts';
import {validateCard,cardLimit,type CardPlan} from './cards.ts';
export type TemplateKc={id:string;kind:Kind;home:string;confusable?:boolean;canonical?:boolean};
export type ItemSpec={text:string;concept_id:string;facet:string;kind?:string;cued?:string[];novel?:boolean;earlier?:boolean;b?:number};
export type TemplateCheckpoint={id:string;title:string;objective:string;criterion:ItemSpec;kind:'learn'|'milestone';tier:'core'|'standard'|'venture';estimate:number;kcs:TemplateKc[];steps:string[];prereqs:string[];stage?:number;prepare?:{text:string;minutes:number};teach:string[];practice:ItemSpec[];stretch?:ItemSpec;close:{questions:string[];minutes:number};card_plan:CardPlan[]};
export type PlanTemplate={schema:'plan_template_v1';checkpoints:TemplateCheckpoint[]};
const DATE=/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2})\b/i;
export function validateTemplate(value:unknown):string[]{
 const errors:string[]=[],p=value as PlanTemplate;if(!p||p.schema!=='plan_template_v1'||!Array.isArray(p.checkpoints))return ['Expected plan_template_v1 with checkpoints'];
 const ids=new Set<string>();for(const cp of p.checkpoints){if(!cp.id||ids.has(cp.id))errors.push('Checkpoint ids must be unique');ids.add(cp.id);}
 for(const cp of p.checkpoints){const at=cp.id+': ';if(!['learn','milestone'].includes(cp.kind))errors.push(at+'cards CPs belong in Close');if(!['core','standard','venture'].includes(cp.tier))errors.push(at+'tier is required');if(!(cp.estimate>0&&Number.isFinite(cp.estimate)))errors.push(at+'positive estimate required');
  if(!Array.isArray(cp.kcs)||cp.kcs.length<1||cp.kcs.length>6)errors.push(at+'1–6 KCs required');for(const k of cp.kcs??[])if(!k.id||!k.home||!KINDS.includes(k.kind))errors.push(at+'KC needs id, kind and home');
  if(!cp.criterion?.text||cp.criterion.kind!=='holdout'||cp.criterion.novel!==true||cp.criterion.cued?.length)errors.push(at+'criterion must be an uncued novel holdout');
  if(!Array.isArray(cp.steps)||cp.steps.length<1||cp.steps.length>8||cp.steps.some(s=>typeof s!=='string'||s.length>80))errors.push(at+'steps: at most eight strings of 80 characters');
  if(!Array.isArray(cp.practice)||cp.practice.length<3||cp.practice.length>6)errors.push(at+'3–6 practice items required');
  if((cp.stage??1)>=2&&(cp.practice??[]).filter(x=>x.earlier).length<Math.ceil(.3*(cp.practice??[]).length))errors.push(at+'at least 30% earlier practice after stage 1');
  if(cp.prepare&&(cp.tier!=='core'||cp.prepare.minutes<10||cp.prepare.minutes>20))errors.push(at+'Prepare is core only, 10–20 minutes');
  if(cp.stretch&&cp.tier!=='core')errors.push(at+'Stretch is core only');if(!cp.teach?.length)errors.push(at+'Teach section is required');
  if(cp.close?.questions?.length!==3||!(cp.close.minutes>0&&cp.close.minutes<=10))errors.push(at+'Close needs three recall questions and at most ten minutes');
  for(const text of [cp.title,cp.objective,...(cp.steps??[]),...(cp.teach??[]),cp.criterion?.text])if(typeof text==='string'&&DATE.test(text))errors.push(at+'dates belong in structured fields');
  for(const pre of cp.prereqs??[])if(!ids.has(pre))errors.push(at+'unknown prerequisite '+pre);
  for(const card of cp.card_plan??[])errors.push(...validateCard(card).map(x=>at+x));
  for(const k of cp.kcs??[]){const cards=(cp.card_plan??[]).filter(c=>c.concept_id===k.id);if(cards.length>cardLimit(k.kind,cp.tier,k))errors.push(at+'card limit exceeded for '+k.id);}
 }
 const visited=new Set<string>(),active=new Set<string>(),byId=new Map(p.checkpoints.map(c=>[c.id,c]));
 const visit=(id:string)=>{if(active.has(id)){errors.push('Prerequisites contain a cycle');return;}if(visited.has(id))return;active.add(id);for(const pre of byId.get(id)?.prereqs??[])visit(pre);active.delete(id);visited.add(id);};for(const id of ids)visit(id);
 return [...new Set(errors)];
}
export const TEMPLATE_RULES='plan_template_v1: Each CP has kind learn|milestone, tier core|standard|venture, estimate, 1–6 typed KCs with homes, Teach, 3–6 Practice items, one uncued novel holdout Criterion, and Close (three recall questions, card drafting, stage logging; ≤10 min). Prepare: conceptual core only, 10–20 min. Stretch: core only. From stage 2, ≥30% Practice targets earlier CPs. Steps ≤8 strings, each ≤80 chars. Prerequisites form a DAG. No dates in free text. No cards CPs. Definition 1 card (+1 core confusable), result core 2/standard 1, core proof key idea+skeleton (3–5 moves), canonical core example 1, core technique 1, notation only after error; venture 0. One retrieval target; answers ≤3 lines; no proof-line cards. Draft only in Close, within new_cards_quota; full proofs get spaced reconstruction checks.';
