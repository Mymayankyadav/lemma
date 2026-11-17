// Proficiency (spec §9): an interpretable Beta(α, β) per (concept class, level), recomputed from evidence in one pass.
// Pure: no I/O, no clock, no LLM. A derived cache: undo of any evidence row recomputes it exactly (I7).
import {LEVELS,type Level,type Outcome,type Novelty} from './recheck.ts';
import {addDays,diffDays,type DateStr} from './dates.ts';

export type ProfEvidence={
  id:string;at:number;day:DateStr;concept_id:string|null;level:Level;role?:'primary'|'secondary'|'used';outcome:Outcome;
  hint_level:number;novelty:Novelty;confidence?:number;voided?:boolean;
  minutes_into_session?:number|null;local_hour?:number|null;
  /** fingerprint of the item text: the same one within 30 days is "familiar", whatever the subject (§9.2) */
  fingerprint?:string|null;
  /** the item teaches new content (§10.2): first attempt is first exposure, half weight on α */
  teaches?:boolean;
};
export type Cfg={
  hint:number[];novelty:Record<Novelty,number>;role:Record<'primary'|'secondary'|'used',number>;
  fatigueMinutes:number;fatigueBeta:number;windowStart:number;windowEnd:number;
  implies:{from:Level;to:Level;w:number}[];repeatDays:number;scribeConfidenceScale:number;
};
export const CFG:Cfg={
  hint:[1,0.7,0.4,0.2,0],novelty:{novel:1,familiar:0.5,seen_solution:0.2,self_reported:0.2},role:{primary:1,secondary:0.5,used:0.3},
  fatigueMinutes:150,fatigueBeta:0.7,windowStart:8,windowEnd:22,
  implies:[{from:'understand',to:'recall',w:0.5},{from:'transfer',to:'use',w:0.7},{from:'use',to:'recall',w:0.3}],
  repeatDays:30,scribeConfidenceScale:1
};
export type Cell={alpha:number;beta:number;n:number;last:DateStr|null;used:number};
export type Prof=Record<string,Record<Level,Cell>>;
const blank=():Cell=>({alpha:1,beta:1,n:0,last:null,used:0});
const row=():Record<Level,Cell>=>({recall:blank(),use:blank(),understand:blank(),transfer:blank()});

/** The α and β one evidence row adds at its own level (before implications). */
export function weights(e:ProfEvidence,cfg:Cfg=CFG,novelty:Novelty=e.novelty):{a:number;b:number}{
  const conf=Math.min(1,Math.max(0,e.confidence??1)),role=cfg.role[e.role??'primary'];
  const hint=cfg.hint[Math.min(4,Math.max(0,e.hint_level))];
  const tired=(e.minutes_into_session??0)>cfg.fatigueMinutes||(e.local_hour!=null&&(e.local_hour<cfg.windowStart||e.local_hour>=cfg.windowEnd));
  const pass=hint*cfg.novelty[novelty]*conf*role*(e.teaches?0.5:1);
  const fail=conf*role*(tired?cfg.fatigueBeta:1);
  if(e.outcome==='pass')return {a:pass,b:0};
  if(e.outcome==='fail')return {a:0,b:fail};
  return {a:0.5*pass,b:0.5*fail};
}
function applyOne(out:Prof,e:ProfEvidence,nov:Novelty,cfg:Cfg,cls:string):void{
  const r=out[cls]??(out[cls]=row());
  if(e.role==='used'&&e.level!=='use')return;
  const w=weights(e,cfg,nov);
  const cell=r[e.level];cell.alpha+=w.a;cell.beta+=w.b;cell.n++;cell.last=e.day;if(e.role==='used')cell.used++;
  if(e.outcome==='pass')for(const im of cfg.implies)if(im.from===e.level){
    const lo=r[im.to];lo.alpha+=w.a*im.w;lo.last=lo.last&&lo.last>e.day?lo.last:e.day;
  }
}
/** Evidence in time order, repeats resolved: the same fingerprint within 30 days is familiar (§9.2). */
function ordered(evidence:ProfEvidence[],cfg:Cfg):{e:ProfEvidence;nov:Novelty}[]{
  const seen=new Map<string,number>();
  return evidence.filter(e=>!e.voided&&e.concept_id&&e.novelty!==undefined).sort((a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0)).map(e=>{
    let nov=e.novelty;
    if(e.fingerprint){const prev=seen.get(e.fingerprint);if(prev!==undefined&&e.at-prev<=cfg.repeatDays*86400000&&nov==='novel')nov='familiar';seen.set(e.fingerprint,e.at)}
    return {e,nov};
  });
}
/** Replay all evidence in one pass. `used` role feeds only the `use` level. */
export function replayProficiency(evidence:ProfEvidence[],cfg:Cfg=CFG,classOf:(c:string)=>string=c=>c):Prof{
  const out:Prof={};
  for(const {e,nov} of ordered(evidence,cfg))applyOne(out,e,nov,cfg,classOf(e.concept_id as string));
  return out;
}
/** For calibration: the predicted success of each attempt BEFORE it was counted, against what happened (pass 1, partial .5, fail 0). */
export function calibrationPairs(evidence:ProfEvidence[],bOf:(e:ProfEvidence)=>number=()=>0,cfg:Cfg=CFG,classOf:(c:string)=>string=c=>c):{p:number;y:0|0.5|1;id:string}[]{
  const out:Prof={};const pairs:{p:number;y:0|0.5|1;id:string}[]=[];
  for(const {e,nov} of ordered(evidence,cfg)){
    if(e.role==='used'||e.novelty==='self_reported')continue;
    const cls=classOf(e.concept_id as string);
    const cell=(out[cls]??row())[e.level];
    if(cell.n>0)pairs.push({p:predict([{cell}],bOf(e)),y:e.outcome==='pass'?1:e.outcome==='partial'?0.5:0,id:e.id});   // the prior alone is not a prediction
    applyOne(out,e,nov,cfg,cls);
  }
  return pairs;
}
export const mean=(c:Cell)=>c.alpha/(c.alpha+c.beta);
export const nEff=(c:Cell)=>c.alpha+c.beta-2;
/** mean_eff = R·mean + (1−R)·0.5; R is the (class, level) recheck retrievability, or 1 when there is none. */
export const meanEff=(c:Cell,R=1)=>R*mean(c)+(1-R)*0.5;
export const sd=(c:Cell)=>{const n=c.alpha+c.beta;return Math.sqrt(c.alpha*c.beta/(n*n*(n+1)))};
const logit=(p:number)=>Math.log(p/(1-p)),sigmoid=(x:number)=>1/(1+Math.exp(-x));
/** Predicted success of an item: σ(logit(mean_eff) − b), the minimum over its primary concepts (§9.3). */
export function predict(cells:{cell:Cell;R?:number}[],b:number):number{
  if(!cells.length)return 0.5;
  return Math.min(...cells.map(({cell,R})=>sigmoid(logit(Math.min(0.999,Math.max(0.001,meanEff(cell,R))))-b)));
}
/** Load-bearing but unexamined: used ≥ 5 times, understand n_eff < 1 (§9.4). */
export const isLBU=(r:Record<Level,Cell>)=>r.use.used>=5&&nEff(r.understand)<1;

// ---- modes (§9.3)
export type Mode='fast_track'|'normal'|'scrutiny';
export type ModeState={mode:Mode;up:number;down:number};
export type ModeIn={
  criterionLevel:Level;primary:{id:string;core:boolean;star?:boolean}[];
  prof:Prof;R?:(cls:string,level:Level)=>number;criterionB:number;
  /** in-session signals */
  fails:Record<string,number>;maxHint:Record<string,number>;pAtStart?:number;
};
export const THRESH={fastP:0.85,fastN:2,starMean:0.7,starN:1,scrutinyP:0.5,needSignals:2};
function cellOf(prof:Prof,cls:string,level:Level):Cell{return (prof[cls]??row())[level]}
export function rawSignal(i:ModeIn):'up'|'down'|'hold'{
  const R=i.R??(()=>1);
  const cells=i.primary.map(c=>({cell:cellOf(i.prof,c.id,i.criterionLevel),R:R(c.id,i.criterionLevel)}));
  const p=predict(cells,i.criterionB);
  const trouble=Object.entries(i.fails).some(([,n])=>n>=2)||Object.values(i.maxHint).some(h=>h>=3)||(i.pAtStart??p)<THRESH.scrutinyP||p<THRESH.scrutinyP;
  if(trouble)return 'down';
  const enough=cells.length>0&&cells.every(c=>nEff(c.cell)>=THRESH.fastN)&&p>=THRESH.fastP;
  const coreOk=i.primary.filter(c=>c.core&&c.star).every(c=>{const u=cellOf(i.prof,c.id,'understand');return meanEff(u,R(c.id,'understand'))>=THRESH.starMean&&nEff(u)>=THRESH.starN});
  return enough&&coreOk?'up':'hold';
}
/** Moving up needs 2 consistent signals plus the thresholds; moving down needs 2 as well (hysteresis). */
export function nextMode(prev:ModeState,signal:'up'|'down'|'hold'):ModeState{
  let {mode,up,down}=prev;
  up=signal==='up'?up+1:0;down=signal==='down'?down+1:0;
  if(up>=THRESH.needSignals){mode=mode==='scrutiny'?'normal':'fast_track';up=0}
  else if(down>=THRESH.needSignals){mode=mode==='fast_track'?'normal':'scrutiny';down=0}
  return {mode,up,down};
}
/** Scrutiny: go back through prerequisites, at most 2 deep; the weakest first (§9.3). */
export function scrutinyOrder(start:string,prereqs:Map<string,string[]>,prof:Prof,level:Level,R:(c:string,l:Level)=>number=()=>1,depth=2):string[]{
  const seen=new Set([start]);let frontier=[start];const found:string[]=[];
  for(let d=0;d<depth;d++){
    const next:string[]=[];
    for(const c of frontier)for(const p of prereqs.get(c)??[])if(!seen.has(p)){seen.add(p);next.push(p);found.push(p)}
    frontier=next;
  }
  const score=(c:string)=>{const cell=cellOf(prof,c,level);return meanEff(cell,R(c,level))-1/Math.sqrt(nEff(cell)+1)};
  return found.sort((a,b)=>score(a)-score(b)||(a<b?-1:1));
}
export type CardIn={name:string;prof:Record<Level,Cell>|undefined;R?:Partial<Record<Level,number>>;seen?:DateStr|null;gaps?:string[];assume?:string[];lbu?:boolean};
/** '.82±.08', or '-' when nothing has been observed at that level */
const fmt=(c:Cell,R=1)=>nEff(c)<1e-9?'-':meanEff(c,R).toFixed(2).replace(/^0/,'')+'±'+sd(c).toFixed(2).replace(/^0/,'');
const SHORT:Record<Level,string>={recall:'R',use:'Us',understand:'Un',transfer:'T'};
/** Node card: fixed compact format, at most ~100 tokens (§11.1). */
export function nodeCard(c:CardIn):string{
  const p=c.prof??row();
  const levels=LEVELS.map(l=>SHORT[l]+fmt(p[l],c.R?.[l]??1)).join(' ');
  return (c.name.slice(0,30)+' '+levels+' gaps:['+(c.gaps??[]).slice(0,3).join(',')+'] assume:['+(c.assume??[]).slice(0,2).join(',')+']'
    +(c.seen?' seen:'+c.seen:'')+' flags:['+(c.lbu?'LBU':'')+']');
}
export {addDays,diffDays};
