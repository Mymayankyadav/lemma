import {clamp,DAY} from './math.ts';
import {memoryAt,memoryStep,type MeasurementState} from './measure.ts';
export type Action={id:string;kind:'practice'|'review'|'teach'|'check'|'close'|'probe';concept_id:string;card_id?:string;minutes:number;p:number;forced?:boolean;weight?:number;needAt?:number};
/** Enumerate the model's two outcomes. Ability-only gains are a martingale; only memory/learning enters ΔU. */
export type Expect=(p:number,success:number,failure:number)=>number;
const exactExpect:Expect=(p,success,failure)=>p*success+(1-p)*failure;
/** The same expectation by simulation (10⁴ draws in the acceptance test): the exact enumeration must agree with it. */
export const monteCarloExpect=(rng:()=>number,draws=10000):Expect=>(p,success,failure)=>{let z=0;for(let i=0;i<draws;i++)z+=rng()<p?success:failure;return z/draws;};
export function knowledgeGain(s:MeasurementState,a:Action,expect:Expect=exactExpect):number{
 if(!(a.minutes>0&&Number.isFinite(a.minutes)))return 0;let gain=0;
 for(let h=0;h<s.hypotheses.length;h++){
  const state=s.hypotheses[h],now=s.now,T=a.needAt??now+7*DAY,k=a.concept_id,rho=h===1?.3:0;
  const before=memoryAt(state.memory[k],T),card=a.card_id?state.cards[a.card_id]:undefined;
  if(a.kind==='review'){
   const recall=memoryAt(card,T),after=expect(a.p,memoryAt(memoryStep(card,now,3,1,true),T),memoryAt(memoryStep(card,now,1,1,true),T));
   let cross=0;if(rho&&state.memory[k])cross=expect(a.p,memoryAt(memoryStep(state.memory[k],now,3,rho,false),T),memoryAt(memoryStep(state.memory[k],now,1,rho,false),T))-before;
   gain+=s.pi[h]*(.4*Math.max(0,after-recall)+.6*Math.max(0,cross));
  }else{const old=state.memory[k],success=memoryAt(memoryStep(old,now,3,1,true),T),failure=memoryAt(memoryStep(old,now,1,1,true),T),learning=.3*(Math.log1p((state.counts[k]??0)+1)-Math.log1p(state.counts[k]??0));gain+=s.pi[h]*.6*Math.max(0,expect(a.p,success,failure)-before+learning*.1);}
 }
 return Math.max(0,gain)*(a.weight??1);
}
export function rankActions(s:MeasurementState,actions:Action[],block:number,cardUsed=0,cap=.125){
 return actions.filter(a=>a.minutes>0&&Number.isFinite(a.minutes)&&(a.kind!=='review'||cardUsed+a.minutes<=block*cap)).map(a=>{const gain=knowledgeGain(s,a);return {...a,gain,score:gain/a.minutes,reason:'+'+(gain*100).toFixed(1)+' pts/'+Math.round(a.minutes)+' min · '+(a.kind==='review'?'card':'memory')};}).sort((a,b)=>Number(!!b.forced)-Number(!!a.forced)||b.score-a.score||a.id.localeCompare(b.id));
}
export function sessionQueue(s:MeasurementState,actions:Action[],block:number,cardCap=.125){
 const checks=actions.filter(a=>a.kind==='check'&&a.forced),teaching=actions.filter(a=>a.kind==='teach'&&a.forced),out:ReturnType<typeof rankActions>=[];let used=0,cards=0,checkMinutes=0;
 for(const a of checks)if(checkMinutes+a.minutes<=block*.25){out.push({...a,gain:0,score:Infinity,reason:'due certification check'});checkMinutes+=a.minutes;used+=a.minutes;}
 for(const a of actions.filter(x=>x.kind==='probe'&&x.forced))if(used+a.minutes<=block-10){out.push({...a,gain:0,score:Infinity,reason:'re-entry probe'});used+=a.minutes;}
 for(const a of teaching)if(used+a.minutes<=block-10){out.push({...a,gain:0,score:Infinity,reason:'teaching pace'});used+=a.minutes;}
 for(const a of rankActions(s,actions.filter(x=>!x.forced&&x.kind!=='close'),block,0,cardCap)){if(used+a.minutes>block-Math.min(10,block*.1))continue;if(a.kind==='review'&&cards+a.minutes>block*cardCap)continue;out.push(a);used+=a.minutes;if(a.kind==='review')cards+=a.minutes;}
 return {items:out,closeMinutes:Math.min(10,Math.max(0,block-used)),cardMinutes:cards,cardCapMinutes:block*cardCap};
}
export function pacing(totalCore:number,taughtCore:number,start:number,lastStudy:number,today:number,freeMinutes:number){const days=Math.max(1,(lastStudy-start)/DAY),reserve=Math.max(7,.2*days),teachingDays=Math.max(1,days-reserve),expected=Math.min(totalCore,Math.ceil(totalCore*clamp((today-start)/DAY+1,0,teachingDays)/teachingDays));return {forceTeach:freeMinutes>=30&&taughtCore<totalCore,behind:taughtCore<expected,finishTeachingAt:lastStudy-reserve*DAY,expected};}
export function pruneDecision(pAll:number,pCore:number,history:{day:string;pAll:number}[],candidates:{id:string;tier:string;weight:number;pTestOut:number;minutes:number;pinned?:boolean;status?:string}[]){
 const restorable=history.length>=2&&history.slice(-2).every(h=>h.pAll>.95);
 return {prune:pAll<.8,restore:restorable,coreAtRisk:pCore<.8,candidates:pAll<.8?candidates.filter(c=>c.tier!=='core'&&!c.pinned&&!['demonstrated','in_progress'].includes(c.status??'')).map(c=>({...c,testOut:c.pTestOut>=.7,valuePerMinute:c.weight*(1-c.pTestOut)/Math.max(1,c.minutes)})).sort((a,b)=>a.valuePerMinute-b.valuePerMinute||a.id.localeCompare(b.id)):[]};
}
