import {DAY,clamp,normalCdf,normalPdf,logit} from './math.ts';
import {estimate,type MeasurementState,type Estimate,type Attempt} from './measure.ts';
import type {Facet} from './kc.ts';
export const ATLAS_DEFAULTS={threshold_p:.85,stretch_share:.2,plan_first_min:10,ask_confidence:true,card_quota_share:.5,card_cap:.125,card_weight:.4};
export type AtlasSettings=typeof ATLAS_DEFAULTS;
export function validateAtlasSettings(p:Record<string,unknown>):string[]{
 const errors:string[]=[],ranges:Record<string,[number,number]>={threshold_p:[.8,.95],stretch_share:[0,.25],plan_first_min:[0,120],card_quota_share:[.25,1],card_cap:[.05,.4],card_weight:[0,1]};
 for(const [k,v] of Object.entries(p)){if(k==='ask_confidence'){if(typeof v!=='boolean')errors.push(k+' must be boolean');}else if(!ranges[k]||typeof v!=='number'||!Number.isFinite(v)||v<ranges[k][0]||v>ranges[k][1])errors.push('Invalid Atlas setting '+k);}
 return errors;
}
export type Certification={certified:boolean;status:'certified'|'needs delayed evidence'|'needs uncued attempt'|'not yet';missing:string;probability:number};
export function certification(s:MeasurementState,k:string,f:Facet,threshold=.85,now=s.now):Certification{
 const e=estimate(s,k,f,now),p=1-normalCdf((logit(threshold)-e.m)/Math.max(e.sd,1e-9)),ev=(s.direct[k+':'+f]??[]).filter(x=>x.clean&&x.novel),last=s.lastInstruction[k]??-Infinity;
 if(p<.8)return {certified:false,status:'not yet',missing:'80% certainty above the mastery threshold',probability:p};
 if(['select','transfer'].includes(f)&&!ev.some(x=>x.uncued))return {certified:false,status:'needs uncued attempt',missing:'one uncued novel attempt',probability:p};
 const eligible=ev.filter(x=>!['select','transfer'].includes(f)||x.uncued),sessions=new Set(eligible.map(x=>x.session));
 if(sessions.size<2||!eligible.some(x=>Math.floor(x.at/DAY)>Math.floor(last/DAY)))return {certified:false,status:'needs delayed evidence',missing:'a second session at least one study day after teaching',probability:p};
 return {certified:true,status:'certified',missing:'',probability:p};
}
export const probePriority=(m:number,sd:number,weight:number,minutes:number,threshold=.85)=>{if(!(sd>0&&minutes>0))return 0;const z=Math.abs(m-logit(threshold))/sd,L=Math.max(0,normalPdf(z)-z*(1-normalCdf(z)));return weight*sd*L/minutes;};
export function probes(s:MeasurementState,threshold=.85){
 const out:{concept_id:string;facet:Facet;priority:number;b:number;reason:string}[]=[];
 for(const c of s.facts.concepts)for(const f of ['recall','understand','execute','select','transfer'] as Facet[]){const e=estimate(s,c.id,f),priority=probePriority(e.m,e.sd,1,2,threshold);if(priority>=.02)out.push({concept_id:c.id,facet:f,priority,b:logit(threshold),reason:e.gap>.2?'assumption gap':'decision close'});}
 return out.sort((a,b)=>b.priority-a.priority||a.concept_id.localeCompare(b.concept_id)).slice(0,5);
}
export const BANDS={practice:{lo:.7,hi:.9,aim:.85},stretch:{lo:.3,hi:.6,aim:.5}};
export const timeBox=(kind:string,estimate:number)=>kind==='stretch'?Math.min(40,2*estimate):kind==='micro'?1:kind==='select'?2:1.5*estimate;
export function staircase(level:number,outcomes:boolean[],kind:'practice'|'stretch'):number{
 if(!outcomes.length)return level;if(!outcomes.at(-1))return clamp(level-1,1,5);const n=kind==='stretch'?1:4;return outcomes.slice(-n).length===n&&outcomes.slice(-n).every(Boolean)?clamp(level+1,1,5):level;
}
export function frustration(attempts:(Attempt&{p?:number;abandoned?:boolean;reportedFrustration?:boolean})[]):{active:boolean;practiceRemaining:number;stretchMultiplier:number;reason:string}{
 const last=attempts.at(-1),abandons=attempts.slice(-2),fails=attempts.slice(-3);let reason='';
 if(last?.reportedFrustration)reason='learner requested';else if(last?.item_kind==='stretch'&&(last.minutes??0)>=12&&last.legacy_outcome!=='pass')reason='stretch stalled';else if(abandons.length===2&&abandons.every(x=>x.abandoned))reason='two abandons';else if(fails.length===3&&fails.every(x=>(x.p??0)>=.6&&x.legacy_outcome==='fail'))reason='three unexpected fails';
 return {active:!!reason,practiceRemaining:reason?3:0,stretchMultiplier:reason?.5:1,reason};
}
export const scrutiny=(e:Estimate,threshold=.85,prereqGap=0)=>normalCdf((logit(threshold)-1-e.m)/Math.max(e.sd,1e-9))>=.5||prereqGap>.5;
export const blameShares=(ps:number[])=>{const P=ps.reduce((a,p)=>a*p,1);return ps.map(p=>clamp((1-p)/Math.max(1e-9,1-P)));};
export function integrationGap(passes:number,n:number,parts:number[]):boolean{
 const p=parts.reduce((a,p)=>a*p,1);let probability=0;for(let k=0;k<=passes;k++){let choose=1;for(let j=1;j<=k;j++)choose*=((n-j+1)/j);probability+=choose*p**k*(1-p)**(n-k);}return n>0&&probability<.05;
}
