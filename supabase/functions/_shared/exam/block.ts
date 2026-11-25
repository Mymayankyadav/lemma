import {planExam,type ExamAction,type ExamSnapshot} from './plan.ts';
export type ExamInput = Omit<ExamSnapshot,'now'|'slotMinutes'>;
export interface ExamBlock {
  sittingId:string; projectId:string; title:string; slotMinutes:number; remainingMinutes:number;
  next:ExamAction; fallback:string;
}
export function examBlock(input:ExamInput,asOf:string,slot:number):ExamBlock | undefined {
  const {sitting}=input;
  if(sitting.status!=='active'||sitting.study_minutes==null||slot<=0)return;
  const cutoff=Math.min(...[sitting.starts_at,sitting.last_study_at].filter((x):x is string=>!!x).map(Date.parse));
  const remainingMinutes=Math.min(sitting.study_minutes,Math.floor((cutoff-Date.parse(asOf))/60000));
  const slotMinutes=Math.min(remainingMinutes,Math.floor(slot));
  if(slotMinutes<1)return;
  const plan=planExam({...input,now:asOf,slotMinutes});
  if(!plan.next.minutes||plan.next.minutes>slotMinutes)return;
  const fallback=plan.runnerUp?`${plan.runnerUp.kind} ${plan.runnerUp.keys.join(', ')} (${plan.runnerUp.minutes} min)`:'A light recap or rest';
  return {sittingId:sitting.id,projectId:sitting.project_id,title:sitting.title,slotMinutes,remainingMinutes,next:plan.next,fallback};
}
export function describeBlock(b:ExamBlock) {
  return `${b.next.kind} ${b.next.keys.join(', ')} · ${b.next.minutes} min. ${b.next.why} ${b.slotMinutes} min in this slot, ${b.remainingMinutes} min available for the exam. Fallback: ${b.fallback}.`;
}
