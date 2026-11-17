// Evidence-driven rechecks (spec §7). Pure replay: facts in, the full recheck set out.
// Nothing here reads a clock or the database, so identical facts give identical output (I3)
// and removing or restoring any fact (undo/redo) recomputes the exact previous set (I7).
import FSRS from '../fsrs.js';
import {addDays,diffDays,maxDay,minDay,type DateStr} from './dates.ts';

export type Level='recall'|'use'|'understand'|'transfer';
export const LEVELS:Level[]=['recall','use','understand','transfer'];
export const levelRank=(l:Level)=>LEVELS.indexOf(l);
export type Outcome='pass'|'partial'|'fail';
export type Novelty='novel'|'familiar'|'seen_solution'|'self_reported';
export type EvidenceKind='attempt'|'evidence'|'recheck'|'recall'|'pretest'|'explanation';
export type Evidence={
  id:string;at:number;day:DateStr;session_id?:string|null;concept_id:string|null;level:Level;
  role?:'primary'|'secondary'|'used';outcome:Outcome;hint_level:number;novelty:Novelty;kind:EvidenceKind;
  voided?:boolean;
};
export type Trigger={id:string;at:number;day:DateStr;code:'T4'|'T5';concept_id:string};
export type Decision={id:string;at:number;day:DateStr;concept_id:string;level:Level;action:'rate_easy'|'convert_card'|'remediation'};
export type ClassInfo={name:string;core:boolean;lastStudyOn:DateStr|null;active:boolean};
export type RecheckState='open'|'escalated'|'retired'|'superseded'|'expired'|'converted';
export type Recheck={
  class_id:string;level:Level;seq:number;state:RecheckState;prompt:string;
  origin_evidence_ids:string[];origin_codes:string[];
  stability:number;difficulty:number;due:DateStr|null;last_review:DateStr;reps:number;lapses:number;fail_count:number;
  pass_streak:number;created_day:DateStr;closed_day:DateStr|null;close_reason:string|null;merge_log:string[];
};
export type RecheckInput={
  evidence:Evidence[];triggers:Trigger[];decisions:Decision[];classes:Record<string,ClassInfo>;
  abandonedSessions?:string[];weights?:number[];retention?:number;
  /** concept_id → class id (identity until concept_aliases exist in PR 2). */
  classOf?:(concept:string)=>string;
};
export type RecheckResult={rechecks:Recheck[];escalations:{class_id:string;level:Level;fail_count:number}[];unresolved:string[]};

const GRADE={again:1,hard:2,good:3,easy:4};
export const GENERIC_PROMPT=/^\s*Recheck\s+CP\d+/i;
export function validPrompt(p:string|null|undefined):boolean{
  return typeof p==='string'&&p.trim().length>=8&&p.length<=300&&!GENERIC_PROMPT.test(p);
}
/** Concrete, level-specific prompt (spec §10.2 templates); never a generic "Recheck CPn". */
export function promptFor(name:string,level:Level):string{
  const n=name.slice(0,80);
  switch(level){
    case 'recall':return 'State "'+n+'" exactly, with every hypothesis.';
    case 'use':return 'Apply "'+n+'" to a problem you have not seen; say which hypothesis you check first.';
    case 'understand':return 'Why is each hypothesis of "'+n+'" needed? Give a counterexample when one is dropped.';
    default:return 'Use "'+n+'" in a setting from another subject; say what changes and what stays.';
  }
}
const interval=(w:number[],s:number,retention:number)=>Math.max(1,Math.round(FSRS.intervalFor(w,s,retention)));
export function retrievabilityOf(r:Pick<Recheck,'stability'|'last_review'>,today:DateStr,w:number[]=FSRS.DEFAULT_W):number{
  return FSRS.retrievability(w,Math.max(0,diffDays(today,r.last_review)),r.stability);
}
type Ev={t:'e';e:Evidence}|{t:'t';e:Trigger}|{t:'d';e:Decision};
const keyOf=(c:string,l:Level)=>c+'\u0000'+l;

export function replayRechecks(input:RecheckInput):RecheckResult{
  const w=input.weights&&input.weights.length===21?input.weights:FSRS.DEFAULT_W;
  const retention=input.retention??0.91;
  const classOf=input.classOf??((c:string)=>c);
  const abandoned=new Set(input.abandonedSessions??[]);
  const unresolved:string[]=[];
  const all:Recheck[]=[];                       // every recheck ever created (history + open)
  const open=new Map<string,Recheck>();         // key → the single open/escalated one
  const seqs=new Map<string,number>();
  const failedIn=new Map<string,boolean>();     // session|key → saw fail/partial earlier in the session
  const easyNext=new Set<string>();
  const timeline:Ev[]=[
    ...input.evidence.filter(e=>!e.voided).map(e=>({t:'e' as const,e})),
    ...input.triggers.map(e=>({t:'t' as const,e})),
    ...input.decisions.map(e=>({t:'d' as const,e}))
  ].sort((a,b)=>a.e.at-b.e.at||(a.t<b.t?-1:a.t>b.t?1:0)||(a.e.id<b.e.id?-1:a.e.id>b.e.id?1:0));

  const info=(cls:string):ClassInfo=>input.classes[cls]??{name:cls,core:false,lastStudyOn:null,active:true};
  /** FSRS clamp (I5 and §7): never today, never beyond last_study_on; core keeps one check in the buffer. */
  function schedule(r:Recheck,day:DateStr):void{
    const ci=info(r.class_id);const next=addDays(day,1);
    const raw=addDays(day,interval(w,r.stability,retention));
    const last=ci.lastStudyOn;
    r.last_review=day;
    if(!last){r.due=maxDay(next,raw);return}
    if(next>last){r.due=null;r.state='retired';r.close_reason='beyond_deadline';r.closed_day=day;return}
    if(raw>last||(ci.core&&raw>addDays(last,-1))){
      if(ci.core){r.due=maxDay(next,addDays(last,-1));return}
      r.due=null;r.state='retired';r.close_reason='beyond_deadline';r.closed_day=day;return;
    }
    r.due=maxDay(next,raw);
  }
  function review(r:Recheck,day:DateStr,grade:number):void{
    const t=Math.max(0,diffDays(day,r.last_review));
    const m=FSRS.step(w,{s:r.stability,d:r.difficulty},t,grade);
    r.stability=m.s;r.difficulty=m.d;r.reps++;
    if(grade===GRADE.again)r.lapses++;
  }
  function create(cls:string,level:Level,day:DateStr,grade:number,origin:string,code:string):void{
    const key=keyOf(cls,level);
    const seq=(seqs.get(key)??0)+1;seqs.set(key,seq);
    const m=FSRS.step(w,null,0,grade);
    const r:Recheck={class_id:cls,level,seq,state:'open',prompt:promptFor(info(cls).name,level),origin_evidence_ids:[origin],origin_codes:[code],
      stability:m.s,difficulty:m.d,due:null,last_review:day,reps:1,lapses:grade===GRADE.again?1:0,fail_count:grade===GRADE.again?1:0,
      pass_streak:0,created_day:day,closed_day:null,close_reason:null,merge_log:[]};
    schedule(r,day);
    all.push(r);
    if(r.state==='open')open.set(key,r);
  }
  /** A new trigger on an open recheck merges: due = min, origins appended, reason logged (§7 Deduplication). */
  function merge(r:Recheck,day:DateStr,grade:number,origin:string,code:string):void{
    const before=r.due;const probe:Recheck={...r,stability:r.stability,difficulty:r.difficulty};
    const m=FSRS.step(w,null,0,grade);probe.stability=Math.min(r.stability,m.s);probe.state='open';
    schedule(probe,day);
    if(probe.due&&(!before||probe.due<before)){r.due=probe.due}
    if(!r.origin_evidence_ids.includes(origin))r.origin_evidence_ids.push(origin);
    if(!r.origin_codes.includes(code))r.origin_codes.push(code);
    r.merge_log.push(code+'@'+day+':'+origin);
    if(grade===GRADE.again){r.fail_count++;if(r.fail_count>=4)r.state='escalated'}
  }
  function trigger(cls:string,level:Level,day:DateStr,grade:number,origin:string,code:string){
    const r=open.get(keyOf(cls,level));
    if(r)merge(r,day,grade,origin,code);else create(cls,level,day,grade,origin,code);
  }
  function result(r:Recheck,day:DateStr,outcome:Outcome,hint:number,direct:boolean,origin:string):void{
    if(r.state==='escalated')return;                    // paused until a remediation step is logged
    const key=keyOf(r.class_id,r.level);
    if(outcome==='pass'&&hint===0){
      const g=easyNext.has(key)?GRADE.easy:GRADE.good;easyNext.delete(key);
      review(r,day,g);r.pass_streak++;
      if(r.pass_streak>=2||diffDays(day,r.created_day)>=3){
        r.state=direct?'retired':'superseded';r.close_reason=direct?'passed':'passed_elsewhere';r.closed_day=day;r.due=null;open.delete(key);
      }else schedule(r,day);
    }else if(outcome==='fail'){
      review(r,day,GRADE.again);r.pass_streak=0;r.fail_count++;
      if(r.fail_count>=4){r.state='escalated';r.due=null}else schedule(r,day);
    }else{                                              // partial, or a pass that needed hints
      review(r,day,GRADE.hard);r.pass_streak=0;schedule(r,day);
    }
    if(r.state==='retired'&&r.close_reason==='beyond_deadline')open.delete(key);
    if(!r.origin_evidence_ids.includes(origin)&&direct)r.merge_log.push('result@'+day+':'+origin);
  }

  for(const item of timeline){
    if(item.t==='d'){
      const d=item.e,r=open.get(keyOf(classOf(d.concept_id),d.level));
      const key=keyOf(classOf(d.concept_id),d.level);
      if(d.action==='rate_easy')easyNext.add(key);
      else if(r&&d.action==='convert_card'){r.state='converted';r.close_reason='converted_to_card';r.closed_day=d.day;r.due=null;open.delete(key)}
      else if(r&&d.action==='remediation'&&r.state==='escalated'){r.state='open';r.fail_count=0;schedule(r,d.day)}
      continue;
    }
    if(item.t==='t'){
      const t=item.e;trigger(classOf(t.concept_id),'understand',t.day,GRADE.again,t.id,t.code);continue;
    }
    const e=item.e;
    if(e.novelty==='self_reported'||e.role==='used')continue;           // not independent evidence
    if(!e.concept_id){unresolved.push(e.id);continue;}
    const cls=classOf(e.concept_id),key=keyOf(cls,e.level);
    const sess=(e.session_id??'day:'+e.day)+'|'+key;
    // Triggers first (T1, T2, T3), so one evidence row never both creates and answers a recheck.
    let grade=0;const codes:string[]=[];
    if(e.kind==='recall'&&e.outcome!=='pass'&&!(e.session_id&&abandoned.has(e.session_id))){
      grade=Math.max(grade,0);codes.push('T3');grade=e.outcome==='fail'?GRADE.again:GRADE.hard;
    }
    if(e.outcome==='pass'&&failedIn.get(sess)){codes.push('T1');grade=GRADE.again;failedIn.delete(sess)}
    if(e.outcome==='pass'&&e.hint_level>=2){codes.push('T2');grade=grade?Math.min(grade,GRADE.hard):GRADE.hard}
    if(e.outcome!=='pass')failedIn.set(sess,true);
    if(e.kind==='recheck'){                                              // an explicit recheck result
      const r=open.get(key);if(r){result(r,e.day,e.outcome,e.hint_level,true,e.id);continue}
    }
    if(codes.length){trigger(cls,e.level,e.day,grade,e.id,codes.join('+'));continue}
    // Outside pass: same or higher level, hint 0, novel item → counts as a pass on every open lower recheck.
    if(e.outcome==='pass'&&e.hint_level===0&&e.novelty==='novel'){
      for(const lv of LEVELS){
        if(levelRank(lv)>levelRank(e.level))break;
        const r=open.get(keyOf(cls,lv));if(r&&e.kind!=='recheck')result(r,e.day,'pass',0,false,e.id);
      }
    }
  }
  // Plan state: a recheck whose class has no active checkpoint (all deferred/skipped, or project archived) is expired.
  // Derived at read time, so restoring the checkpoints reopens it (§7 expired).
  for(const r of all){
    if((r.state==='open'||r.state==='escalated')&&!info(r.class_id).active)r.state='expired';
  }
  const sorted=[...all].sort((a,b)=>a.class_id<b.class_id?-1:a.class_id>b.class_id?1:levelRank(a.level)-levelRank(b.level)||a.seq-b.seq);
  return {rechecks:sorted,unresolved:unresolved.sort(),
    escalations:sorted.filter(r=>r.state==='escalated').map(r=>({class_id:r.class_id,level:r.level,fail_count:r.fail_count}))};
}
/** Open rechecks due on or before `day`, most overdue first. */
export const dueRechecks=(rs:Recheck[],day:DateStr)=>rs.filter(r=>r.state==='open'&&r.due!==null&&r.due<=day)
  .sort((a,b)=>(a.due as string).localeCompare(b.due as string)||a.class_id.localeCompare(b.class_id));
export {minDay};
