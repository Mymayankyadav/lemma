// Items (spec §10): anything posed to the learner that yields evidence, with or without an exercise bank.
// Pure. Difficulty b is in logits. Selection never blocks: a candidate in the band, else a generated target, else a template.
import {predict,meanEff,type Cell,type Prof} from './proficiency.ts';
import {promptFor,type Level} from './recheck.ts';

export type ItemOrigin='source_exercise'|'source_example'|'source_theorem'|'plan_probe'|'template'|'tutor_generated'|'past_exam'|'card'|'user_supplied';
export type Tag={concept_id:string;level:Level;role:'primary'|'secondary'|'used'};
export type Item={id:string;origin:ItemOrigin;text:string;tags:Tag[];b:number;b_n:number;teaches:boolean;holdout:boolean;
  status:'active'|'needs_transcription'|'retired';has_reference_solution?:boolean};
/** Stable text fingerprint: case, spacing, punctuation and LaTeX delimiters do not matter. */
export function fingerprint(text:string):string{
  const t=text.toLowerCase().replace(/\\(?:left|right|,|;|!|quad)|[$\s{}()\[\].,;:!?'"`]+/g,' ').replace(/\s+/g,' ').trim();
  let h=0x811c9dc5;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}
  return t.length.toString(36)+'-'+h.toString(36);
}
const EST=[-2,-1,0,1,2];
/** Prior difficulty: an owner/tutor estimate of 1–5 maps to −2…+2; otherwise a default by origin and level (§10.3). */
export function priorB(origin:ItemOrigin,level:Level,estimate?:number|null):number{
  if(estimate&&estimate>=1&&estimate<=5)return EST[Math.round(estimate)-1];
  if(origin==='template')return level==='recall'?-1:level==='understand'?0.5:0;
  return origin==='past_exam'?0.5:0;
}
/** Elo-style update after an attempt: K = 0.4/√(1+b_n). A pass lowers b, a fail raises it, partial counts .5. */
export function updateB(b:number,bN:number,pBefore:number,outcome:'pass'|'partial'|'fail'):{b:number;b_n:number}{
  const score=outcome==='pass'?1:outcome==='partial'?0.5:0;
  const k=0.4/Math.sqrt(1+bN);
  return {b:Math.max(-4,Math.min(4,b-k*(score-pBefore))),b_n:bN+1};
}
export const uncalibrated=(i:Pick<Item,'b_n'>)=>i.b_n<3;
/** Templates guarantee there is always something to ask (§10.2). */
export function templateItem(conceptId:string,name:string,level:Level,setting?:string):Item{
  const text=level==='transfer'&&setting?'Use "'+name.slice(0,80)+'" in '+setting+'; say what changes and what stays.':promptFor(name,level);
  return {id:'tpl:'+conceptId+':'+level,origin:'template',text,tags:[{concept_id:conceptId,level,role:'primary'}],b:priorB('template',level),b_n:0,teaches:false,holdout:false,status:'active'};
}
export type Pick_={item:Item;p:number;score:number};
export type Target={pStar:number;band:[number,number]};
export const TARGET:Target={pStar:0.85,band:[0.7,0.9]};
export type Ctx={
  prof:Prof;classOf?:(c:string)=>string;R?:(cls:string,level:Level)=>number;
  /** value(class) = tier_weight × (1 + prereq_of_next_cp) × (1 − mean_eff) × (LBU ? 2 : 1); supplied by the caller */
  value:(cls:string)=>number;
};
const cellFor=(ctx:Ctx,cls:string,level:Level):Cell=>(ctx.prof[cls]??{recall:{alpha:1,beta:1,n:0,last:null,used:0},use:{alpha:1,beta:1,n:0,last:null,used:0},understand:{alpha:1,beta:1,n:0,last:null,used:0},transfer:{alpha:1,beta:1,n:0,last:null,used:0}})[level];
export function predictItem(it:Item,ctx:Ctx):number{
  const cls=ctx.classOf??((c:string)=>c);
  const prim=it.tags.filter(t=>t.role==='primary');
  return predict(prim.map(t=>({cell:cellFor(ctx,cls(t.concept_id),t.level),R:ctx.R?.(cls(t.concept_id),t.level)})),it.b);
}
/** score = value × (1 − |p − p*| / 0.15), only inside the band; hold-outs, retired and untranscribed items never qualify. */
export function chooseItem(items:Item[],ctx:Ctx,t:Target=TARGET,allowHoldout=false):Pick_|null{
  const cls=ctx.classOf??((c:string)=>c);let best:Pick_|null=null;
  for(const it of items){
    if(it.status!=='active'||(it.holdout&&!allowHoldout)||!it.tags.some(x=>x.role==='primary'))continue;
    const p=predictItem(it,ctx);
    if(p<t.band[0]||p>t.band[1])continue;
    const value=Math.max(...it.tags.filter(x=>x.role==='primary').map(x=>ctx.value(cls(x.concept_id))));
    const score=value*(1-Math.abs(p-t.pStar)/0.15);
    if(!best||score>best.score||(score===best.score&&it.id<best.item.id))best={item:it,p,score};
  }
  return best;
}
/** The difficulty a generated item should be declared at to land on p*, for one concept at one level. */
export function targetB(cell:Cell,R=1,pStar=TARGET.pStar):number{
  const m=Math.min(0.999,Math.max(0.001,meanEff(cell,R)));
  return Math.log(m/(1-m))-Math.log(pStar/(1-pStar));
}
/** Never block: a candidate in the band, else "generate one at this b", else a template. */
export type Next={kind:'bank'|'generate'|'template';item?:Item;b?:number;pick?:Pick_};
export function nextItem(bank:Item[],ctx:Ctx,primary:{concept_id:string;name:string;level:Level},canGenerate:boolean,t:Target=TARGET):Next{
  const hit=chooseItem(bank,ctx,t);
  if(hit)return {kind:'bank',item:hit.item,pick:hit};
  const cls=ctx.classOf?ctx.classOf(primary.concept_id):primary.concept_id;
  if(canGenerate)return {kind:'generate',b:Math.round(targetB(cellFor(ctx,cls,primary.level),ctx.R?.(cls,primary.level))*100)/100};
  return {kind:'template',item:templateItem(primary.concept_id,primary.name,primary.level)};
}
// ---- learning profile (§10.1): weights over the seven modes sum to 1; they decide which levels count as core for fast-track
export const MODES=['prove','solve','compute','recall','explain','read','construct'] as const;
export type LearningProfile=Record<typeof MODES[number],number>;
export function normalizeProfile(raw:Partial<Record<string,number>>):LearningProfile{
  const v=MODES.map(m=>Math.max(0,Number(raw[m])||0));const tot=v.reduce((a,b)=>a+b,0)||1;
  return Object.fromEntries(MODES.map((m,i)=>[m,Math.round(v[i]/tot*1000)/1000])) as LearningProfile;
}
/** Proof subjects: understand. Computational: use + transfer. Reading-led: recall + understand through explanation. */
export function coreLevels(p:LearningProfile):Level[]{
  const proof=p.prove+p.construct,comp=p.solve+p.compute,read=p.read+p.explain+p.recall;
  if(proof>=comp&&proof>=read)return ['understand'];
  if(comp>=read)return ['use','transfer'];
  return ['recall','understand'];
}
/** A first draft from source statistics (exercise density, theorem density, worked examples), for the learner to approve. */
export function draftProfile(s:{exercises:number;theorems:number;examples:number;definitions:number;pages:number}):LearningProfile{
  const per=(n:number)=>n/Math.max(1,s.pages);
  return normalizeProfile({prove:per(s.theorems)*3,construct:per(s.examples)*0.5,solve:per(s.exercises)*2,compute:per(s.examples),recall:per(s.definitions),explain:per(s.definitions)*0.5,read:0.02});
}
