import type {FacetValue} from '../../../supabase/functions/_shared/adaptive/atlas';
import type {Kind} from '../../../supabase/functions/_shared/adaptive/kc';
import './atlas-values.css';
export function IntervalBar({p,lo,hi,label}:{p:number;lo:number;hi:number;label:string}){
 return <span className="v7-interval" role="meter" aria-label={label+'; 80% interval '+lo.toFixed(2)+' to '+hi.toFixed(2)} aria-valuemin={0} aria-valuemax={1} aria-valuenow={p}>
  <span className="v7-interval-band" style={{left:lo*100+'%',width:Math.max(0,hi-lo)*100+'%'}}/><span className="v7-interval-point" style={{left:p*100+'%'}}/>
 </span>;
}
export function ProficiencyValue({value}:{value:Pick<FacetValue,'p'|'lo'|'hi'|'sessions'|'state'|'certified'|'inferredFrom'>}){
 if(value.state==='none')return <span aria-label="No proficiency estimate yet">—</span>;
 const inferred=value.state==='inferred',label=(inferred?'Inferred proficiency ':'Proficiency ')+value.p.toFixed(2)+', 80% interval '+value.lo.toFixed(2)+' to '+value.hi.toFixed(2)+', '+value.sessions+' sessions'+(value.certified?', certified':'');
 return <span className="v7-proficiency" aria-label={label}><span>{inferred?'~':''}{value.p.toFixed(2)} ({value.lo.toFixed(2)}–{value.hi.toFixed(2)}) {value.certified&&<span title="Certified">∎</span>}</span><small>{value.sessions} {value.sessions===1?'session':'sessions'}{inferred?' · inferred'+(value.inferredFrom?' from '+value.inferredFrom:''):''}</small></span>;
}
export type StageValue={stage:string;result?:string|null;hint_level?:number;hint?:number};
export function StageStrip({stages,cued=false,legacy=false}:{stages:StageValue[];cued?:boolean;legacy?:boolean}){
 if(legacy)return <span className="v7-stage-legacy">legacy</span>;
 return <span className="v7-stage-strip" aria-label={'Attempt stages'+(cued?', cued':'')}>{['U','S','E','C'].map(stage=>{const s=stages.find(s=>s.stage===stage),hint=s?.hint_level??s?.hint??0,label=!s?'unlogged':s.result==='not_reached'?'not reached':hint?'hint '+hint:s.result==='ok'?'ok':s.result==='fail'?'failed':'unlogged';return <span key={stage} data-state={label} aria-label={stage+': '+label}>{stage}<small>{hint?hint:s?.result==='ok'?'✓':s?.result==='fail'?'×':s?.result==='not_reached'?'–':'·'}</small></span>;})}{cued&&<span title="Cued" aria-label="Cued">◦</span>}</span>;
}
export const KindChip=({kind}:{kind:Kind})=><span className="v7-tag">{kind}</span>;
export const GapBadge=({p}:{p:number})=><span className="v7-gap">gap {p.toFixed(2)}{p>.2?' · probe':''}</span>;
export const LinkKindChip=({kind,proposed=false}:{kind:string;proposed?:boolean})=><span className="v7-tag" data-proposed={proposed||undefined}>{kind.replaceAll('_',' ')}</span>;
export function FitMeter({pAll,pCore,required,supply}:{pAll:number;pCore:number;required:number;supply:number}){return <div className="v7-atlas-fit" data-risk={pAll<.8||undefined}><strong>Plan fits {Math.round(pAll*100)}% · core {Math.round(pCore*100)}%</strong><small>{Math.round(required)} min required · {Math.round(supply)} min available</small></div>;}
export function CardBudget({quota,used,load30=[]}:{quota:number;used:number;load30?:number[]}){return <div className="v7-card-budget"><strong>New cards {used}/{Math.floor(quota)} today</strong><small>{quota.toFixed(1)} units/day · rolling seven-day allowance</small>{load30.length>0&&<svg viewBox="0 0 120 24" role="img" aria-label="30-day forecast card review minutes"><polyline fill="none" stroke="currentColor" points={load30.map((v,i)=>[i*120/Math.max(1,load30.length-1),23-v/Math.max(1,...load30)*20].join(',')).join(' ')}/></svg>}</div>;}
export const EstimateRange=({p10,p90}:{p10:number;p90:number})=><span aria-label={'Estimated duration, 80% range '+Math.round(p10)+' to '+Math.round(p90)+' minutes'}>{Math.round(p10)}–{Math.round(p90)} min</span>;
