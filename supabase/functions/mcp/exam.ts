import {scoped, type Context} from './db.ts';
import {project} from './resolve.ts';
import {planExam, type ConceptEvidence, type ExamAttempt, type ExamSitting} from '../_shared/exam/plan.ts';
import {describeAction, examTimeLeft, localExamTime, renderExam, renderExamResume} from '../_shared/exam/render.ts';
import {selectorModel, selectExam, predictionRows, inputsHash} from '../_shared/exam/selector.ts';
import {readAgenda,type AgendaRead} from './agenda.ts';
import {EXAM_RULES} from './rules.ts';

interface ProjectRef {id: string; slug: string; subject_id: string | null; system?: boolean}
type JoinedSitting = ExamSitting & {projects: ProjectRef};
const joined = '*,projects!inner(id,slug,subject_id,system,status)';
const openStatuses = ['active','paused','planned'];
const day = 86_400_000;
const examNext = 'follow NEXT; log each scored answer with save_progress and exam_attempts';
function data<T>(result: {data: T; error: {message: string} | null}): T {
  if (result.error) throw Error(result.error.message);
  return result.data;
}
function visibleSittings(c: Context) {
  return scoped(c, 'exam_sittings', joined).eq('projects.system',false).neq('projects.status','archived');
}
async function projectSitting(c: Context, projectId: string, now: string, recentFinished: boolean): Promise<JoinedSitting | null> {
  let query = visibleSittings(c).eq('project_id', projectId);
  if (recentFinished) {
    const cutoff = new Date(Date.parse(now) - 14 * day).toISOString();
    query = query.or(`status.in.(active,paused,planned),and(status.eq.finished,finished_at.gte.${cutoff})`);
  } else query = query.in('status', openStatuses);
  return data(await query.order('finished_at',{ascending:false,nullsFirst:true}).order('status').order('starts_at').order('id').limit(1).maybeSingle());
}
async function ideaCount(c: Context, id: string) {
  const {count,error} = await c.db.from('card_ideas').select('id',{count:'exact',head:true}).eq('user_id',c.userId).eq('sitting_id',id).in('status',['saved','drafted']);
  if (error) throw Error(error.message);
  return count ?? 0;
}
async function rowEvidence(c: Context, s: JoinedSitting, now: string): Promise<ConceptEvidence[]> {
  if (!s.projects.subject_id || !s.blueprint.some(r => r.concepts?.length)) return [];
  return data(await c.db.rpc('exam_row_evidence',{p_owner:c.userId,p_sitting:s.id,p_as_of:now}));
}
async function sittingPlan(c: Context, sitting: JoinedSitting, now: string, log = false, slotMinutes?:number) {
  const [attempts,evidence] = await Promise.all([
    scoped(c,'exam_attempts','row_key,occurred_at,outcome,independence,hint_level,novelty,marks_awarded,marks_possible,confidence,timed,seconds')
      .eq('sitting_id',sitting.id).is('voided_at',null).lte('occurred_at',now).order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(500),
    rowEvidence(c,sitting,now),
  ]);
  const plan = planExam({sitting, attempts:data<ExamAttempt[]>(attempts), evidence, now,slotMinutes});
  if (log) {
    try {
      const inputs={...selectorModel(slotMinutes===undefined?plan:{...plan,minutes:Math.min(plan.minutes??0,slotMinutes)}),blueprintVersion:sitting.blueprint_version}, predictions=predictionRows(plan);
      const hash=await inputsHash({inputs,predictions,qualitative:plan.next});
      const result=await c.db.rpc('log_exam_decision',{p_owner:c.userId,p_sitting:sitting.id,p_as_of:now,
        p_decision:{...selectExam(inputs),inputs,inputs_hash:hash,qualitative:plan.next,predictions}});
      if(result.error)throw Error('Decision log unavailable');
    } catch { console.warn('Exam shadow decision could not be recorded'); }
  }
  return plan;
}
async function listSittings(c: Context, activeOnly: boolean) {
  return data<JoinedSitting[]>(await visibleSittings(c).in('status',activeOnly ? ['active'] : openStatuses).order('starts_at').order('id').limit(60));
}
const listLine = (s: JoinedSitting, now: string) => `${s.projects.slug} “${s.title.replace(/\s+/g,' ')}” · ${s.status} · ${localExamTime(s.starts_at,s.time_zone)} (${examTimeLeft(s.starts_at,now)})`;
export async function readExam(c: Context, args: {id?: string; project?: string}, now = new Date().toISOString()) {
  const limit = 3000 - ('\nNEXT: '+examNext).length;
  if (!args.id && !args.project) {
    const sittings = await listSittings(c,false);
    const lines = ['EXAMS'];
    for (const s of sittings) {
      if (lines.join('\n').length + listLine(s,now).length + 2 > limit) break;
      const next = s.status === 'active' ? ' · next '+describeAction((await sittingPlan(c,s,now,true)).next) : '';
      const line = listLine(s,now)+next;
      if (lines.join('\n').length + line.length + 1 > limit) break;
      lines.push(line);
    }
    if (!sittings.length) lines.push('No planned, active or paused sittings.');
    c.next = 'select a sitting with get(what=exam, id=<id>) or pass its project';
    return lines.join('\n');
  }
  const p = args.project ? await project(c,args.project) : null;
  const sitting = args.id ? data<JoinedSitting | null>(await visibleSittings(c).eq('id',args.id).maybeSingle()) : await projectSitting(c,p.id,now,false);
  if (!sitting || (p && sitting.project_id !== p.id)) throw Error('Exam sitting not found.');
  const agenda=sitting.status==='active'?(await readAgenda(c)).agenda:null;
  const slot=agenda?.decision.exam;
  const [plan,ideas] = await Promise.all([sittingPlan(c,sitting,now,true,slot?.sittingId===sitting.id?slot.slotMinutes:undefined),ideaCount(c,sitting.id)]);
  c.next = slot?.sittingId===sitting.id?agenda!.decision.reason+' '+examNext:
    agenda&&plan.next.kind!=='confirm'?'The owner agenda has another priority now. Keep this exam action for an available block.':examNext;
  return renderExam(sitting,sitting.projects.slug,plan,now,ideas,3000-('\nNEXT: '+c.next).length);
}
export async function resumeExam(c: Context, p: ProjectRef | null, brief: boolean, now = new Date().toISOString(), agenda?:AgendaRead|null) {
  const empty = {text:'', activeSlugs:[] as string[], next:''};
  if (p?.system) return empty;
  if (!p) {
    const active = await listSittings(c,true);
    return {text:active.map(s => 'EXAM active: '+listLine(s,now)).join('\n').slice(0,1500), activeSlugs:active.map(s => s.projects.slug), next:''};
  }
  const s = await projectSitting(c,p.id,now,true);
  if (!s) return empty;
  const passed = !!s.starts_at && Date.parse(s.starts_at) <= Date.parse(now);
  const slot=agenda?.decision.exam;
  const plan = s.status === 'active' && !passed ? await sittingPlan(c,s,now,false,slot?.sittingId===s.id?slot.slotMinutes:undefined) : undefined;
  const ideas = s.status === 'finished' ? await ideaCount(c,s.id) : 0;
  let text=renderExamResume(s,p.slug,plan,now,ideas,brief ? '' : EXAM_RULES);
  if(agenda&&plan)text=text.replace(/^NEXT .*$/m,slot?.sittingId===s.id?'NEXT '+agenda.decision.reason:'NEXT Follow the owner QUEUE. This sitting can resume in a free slot.');
  return {text:text.slice(0,1500), activeSlugs:s.status === 'active' ? [p.slug] : [],
    next:s.status === 'active' ? (passed ? 'ask whether the exam took place' : agenda ? 'follow the owner QUEUE and its available minutes' : `follow EXAM: ${describeAction(plan!.next)}`) : ''};
}
/** Called only after the existing grant check authorizes the pending turn. */
export async function handoffExam(c: Context, turnId: string, now = new Date().toISOString(), sittingId?:string) {
  let query=visibleSittings(c);
  if(sittingId) query=query.eq('id',sittingId);
  else {
    const turn=data<{tutor_threads:{project_id:string}} | null>(await scoped(c,'tutor_turns','tutor_threads!inner(project_id)').eq('id',turnId).maybeSingle());
    if(!turn)return null;
    query=query.eq('project_id',turn.tutor_threads.project_id).eq('status','active');
  }
  const s=data<JoinedSitting | null>(await query.maybeSingle());
  return s ? {sittingId:s.id,title:s.title,startsLocal:localExamTime(s.starts_at,s.time_zone),timeLeft:examTimeLeft(s.starts_at,now),phase:s.phase,cardMode:s.card_mode,planner:`get(what=exam, id=${s.id})`,...(sittingId?{status:s.status}:{})} : null;
}
