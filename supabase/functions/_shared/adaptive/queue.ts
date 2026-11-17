// Today's queue (spec §8.1, §8.6). Pure: facts in, an ordered list out. Byte-identical for identical facts (I3).
import {addDays,type DateStr} from './dates.ts';
import {estRemaining,isLive,paceFactor,DEFAULTS,type PlanCp,type PlanProject} from './plan.ts';
import type {Mode} from './time.ts';

export type ReviewItem={
  type:'recheck'|'cards';ref:string;classId:string;system?:string|null;minutes:number;
  retrievability:number;importance:number;prereqOfToday:boolean;
};
export type QueueItem={type:'recheck'|'cards'|'step'|'cp'|'probe';ref:string;est_minutes:number;reason_code:string};
export type QueueInput={
  today:DateStr;mode:Mode;capacity:number;configured:boolean;used:number;
  reviewShare:number;reviewBudgetMinutes:number;reviews:ReviewItem[];
  projects:PlanProject[];cps:PlanCp[];nextStudyDays:DateStr[];
  /** study days since the last session; > 3 adds a re-entry probe (§8.6) */
  absentDays?:number;probeConcepts?:string[];
};
export type Queue={
  items:QueueItem[];tail:QueueItem[];overflow:Record<DateStr,number>;
  flags:string[];minutes:{available:number;review:number;learning:number};
};
const priority=(r:ReviewItem)=>(1-r.retrievability)*r.importance*(r.prereqOfToday?2:1);
const cmpReview=(a:ReviewItem,b:ReviewItem)=>priority(b)-priority(a)||(a.ref<b.ref?-1:a.ref>b.ref?1:0);
/** No two consecutive items on one concept class; alternate systems where possible. */
export function interleave(items:ReviewItem[]):ReviewItem[]{
  const rest=[...items].sort(cmpReview),out:ReviewItem[]=[];
  while(rest.length){
    const last=out[out.length-1];
    const ok=rest.map((x,i)=>({x,i})).filter(({x})=>!last||x.classId!==last.classId);
    const pool=ok.length?ok:rest.map((x,i)=>({x,i}));
    const pick=pool.find(({x})=>!last||!x.system||x.system!==last.system)??pool[0];
    out.push(pick.x);rest.splice(pick.i,1);
  }
  return out;
}
/** Prerequisites block starting, not completing; a deferred or skipped prerequisite no longer blocks. */
const available=(c:PlanCp,done:Set<string>)=>c.prereqs.every(p=>done.has(p));
export function buildQueue(i:QueueInput):Queue{
  const flags:string[]=[];
  const q:Queue={items:[],tail:[],overflow:{},flags,minutes:{available:0,review:0,learning:0}};
  if(i.mode==='post_deadline'){flags.push('post_deadline');return q}
  if(!i.configured||i.capacity<=0){flags.push(i.configured?'zero_capacity':'capacity_unset');}
  const avail=Math.max(0,i.capacity-i.used);q.minutes.available=avail;
  const mand=i.reviews.filter(r=>r.type==='recheck'&&r.prereqOfToday);
  const rest=i.reviews.filter(r=>!mand.includes(r));
  const mandMin=mand.reduce((a,r)=>a+r.minutes,0);
  const cap=Math.max(i.reviewShare*i.capacity,i.reviewBudgetMinutes);       // review_budget.minutes is a floor, not a cap
  let room=Math.max(0,Math.min(cap,avail)-mandMin);
  const chosen:ReviewItem[]=[...mand],over:ReviewItem[]=[];
  for(const r of interleave(rest)){if(r.minutes<=room){chosen.push(r);room-=r.minutes}else over.push(r)}
  const ordered=interleave(chosen);
  const reviewMin=ordered.reduce((a,r)=>a+r.minutes,0);
  q.minutes.review=reviewMin;
  const mark=(r:ReviewItem):QueueItem=>({type:r.type,ref:r.ref,est_minutes:Math.round(r.minutes*10)/10,reason_code:r.prereqOfToday&&r.type==='recheck'?'mandatory_prereq':'due_review'});
  // Overflow is spread over the next 3 study days, never piled onto one.
  const days=i.nextStudyDays.slice(0,3);
  if(days.length)over.forEach((_,k)=>{const d=days[k%days.length];q.overflow[d]=(q.overflow[d]??0)+1});
  else if(over.length)flags.push('review_overflow_unscheduled');
  const items:QueueItem[]=[];
  if((i.absentDays??0)>3&&(i.probeConcepts?.length??0)>0)
    for(const c of (i.probeConcepts as string[]).slice(0,3))items.push({type:'probe',ref:c,est_minutes:2,reason_code:'reentry_probe'});
  items.push(...ordered.map(mark));
  const L=Math.max(0,avail-reviewMin);q.minutes.learning=L;
  // Learning fill: the current CP's remaining steps, then the next available CPs, at step level.
  const pace=new Map(i.projects.map(p=>[p.id,paceFactor(p.paceSamples)]));
  const order=new Map(i.projects.map((p,k)=>[p.id,k]));
  const live=i.cps.filter(isLive);
  const done=new Set(i.cps.filter(c=>c.status==='demonstrated'||c.planState!=='active').map(c=>c.id));
  const only=i.mode==='deadline_today'?(c:PlanCp)=>c.pinned:()=>true;
  const lane=[...live.filter(c=>c.status==='in_progress'),
    ...live.filter(c=>c.status==='not_started'&&available(c,done)).sort((a,b)=>(order.get(a.project_id)??0)-(order.get(b.project_id)??0)||(a.dueOn??'9999').localeCompare(b.dueOn??'9999')||a.position-b.position)]
    .filter(only);
  let left=L;const learn:QueueItem[]=[],tail:QueueItem[]=[];
  for(const c of lane){
    const f=pace.get(c.project_id)??1;
    const per=(c.estimate??DEFAULTS.learnMinutes)/Math.max(1,c.steps.length);
    const code=c.status==='in_progress'?'current_step':c.pinned?'pinned':'next_cp';
    if(c.compressed||(c.testOut&&c.status==='not_started')){
      const m=DEFAULTS.testOutMinutes*f;(m<=left?learn:tail).push({type:'cp',ref:c.code+':test_out',est_minutes:Math.round(m),reason_code:code});if(m<=left)left-=m;continue}
    if(!c.steps.length){const m=estRemaining(c)*f;(m<=left?learn:tail).push({type:'cp',ref:c.code,est_minutes:Math.round(m),reason_code:code});if(m<=left)left-=m;continue}
    c.steps.forEach((st,k)=>{
      if(st.done||st.deferred)return;
      const m=(st.minutes??per)*f;const item={type:'step' as const,ref:c.code+'#'+(k+1),est_minutes:Math.round(m),reason_code:code};
      if(m<=left&&tail.length===0){learn.push(item);left-=m}else tail.push(item);
    });
  }
  items.push(...learn);q.items=items;q.tail=tail.slice(0,5);
  if(avail===0&&!flags.length)flags.push('no_time_left_today');
  return q;
}
export function renderQueue(q:Queue,max=8):string{
  const line=(x:QueueItem,n:number)=>n+' '+x.type+' '+x.ref+' ~'+x.est_minutes+'m '+x.reason_code;
  const lines=['QUEUE '+q.minutes.review+'m review, '+q.minutes.learning+'m learning of '+q.minutes.available+'m'];
  q.items.slice(0,max).forEach((x,k)=>lines.push(line(x,k+1)));
  if(q.items.length>max)lines.push('+'+(q.items.length-max)+' more');
  if(q.tail.length)lines.push('if time permits: '+q.tail.map(x=>x.ref).join(', '));
  const spill=Object.entries(q.overflow).sort(([a],[b])=>a.localeCompare(b)).map(([d,n])=>d+':'+n);
  if(spill.length)lines.push('overflow '+spill.join(' '));
  return lines.join('\n');
}
export {addDays};
