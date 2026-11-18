import {clamp} from './math.ts';
import type {Kind,Facet} from './kc.ts';
export const cardUnits=(kind:string)=>kind==='skeleton'?3:1;
export function cardLimit(kind:Kind,tier:string,options:{confusable?:boolean;canonical?:boolean;proof?:boolean;error?:boolean}={}):number{
 if(tier==='venture')return 0;const core=tier==='core';
 if(options.proof)return core?2:0;
 if(kind==='definition')return core&&options.confusable?2:1;
 if(kind==='result')return core?2:1;
 if(kind==='example')return core&&options.canonical?1:0;
 if(kind==='technique')return core?1:0;
 if(kind==='notation')return options.error?1:0;
 return 0;
}
export type CardPlan={concept_id:string;kind:string;facet:Facet;front?:string;back?:string;moves?:string[];reverse?:boolean;reason?:string};
export function validateCard(card:CardPlan):string[]{const errors:string[]=[];if(!card.concept_id)errors.push('Card needs a KC');if(!['recall','understand','select'].includes(card.facet))errors.push('Card facet must be recall, understand or select');if((card.back??'').split(/\n/).length>3)errors.push('Answer exceeds three lines');if(/\blist all\b/i.test(card.front??''))errors.push('List-all card is not a single retrieval target');if(card.kind==='skeleton'&&(!(card.moves?.length!>=3)||card.moves!.length>5))errors.push('Skeleton needs 3–5 moves');if(card.kind==='proof_line')errors.push('Proof lines cannot be cards');return errors;}
export function cardBudget(input:{capacity:number;reviewShare?:number;reviewBudget?:number;quotaShare?:number;used7?:number;usedToday?:number;existingLoad?:number[]}){
 const B=Math.min(.5*(input.reviewShare??.25)*Math.max(0,input.capacity),input.reviewBudget??Infinity),daily=clamp(input.quotaShare??.5,.25,1)*B/(.5*5.7),used7=Math.max(0,input.used7??0),available=Math.max(0,7*daily-used7);
 return {quota:daily,available,used:input.usedToday??0,budgetMinutes:B,weeklyUnits:7*daily,load30:Array.from({length:30},(_,i)=>Math.min(B,(input.existingLoad?.[i]??0)+daily*.5*2.6*(i+1)/30))};
}
export function cardAdvice(card:{lapses:number;certified:boolean;stability:number;daysToExam:number}){if(card.lapses>=3)return {kind:'understand_probe',reason:'three lapses; probe or split'};if(card.certified&&card.stability>card.daysToExam)return {kind:'suspend_proposal',reason:'certified and stable past exam'};return null;}
