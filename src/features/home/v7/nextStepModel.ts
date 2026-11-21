import type {AgendaRead} from '../../../data/adaptive/agenda-api';
import {reviewHref} from '../../../data/review-target';
import type {StudyLinks} from '../../../data/study/contract';
import type {TaskRecord} from '../../../data/tasks/contract';
import type {ProjectSummary} from '../../../data/types';
import {formatClock} from '../../../lib/format';
import {tutorHref} from '../../tutor/tutorHref';

export type NextStep = {
  part: 'Checks' | 'Learn' | 'Practice' | 'Close';
  title: string;
  action: string;
  href?: string;
  minutes?: number;
  why: string;
  focus?: StudyLinks;
  successChance?: number;
};

type NextStepInput = {
  due: number; reviewMinutes: number; active: boolean;
  now: number; localMinute: number; zone: string; closed: boolean;
  projects: readonly ProjectSummary[]; tasks: readonly TaskRecord[]; scopedReview: boolean;
  checkpoint?: {code:string;title:string} | null; loadingCheckpoint?: boolean;
  waitingForAgenda?: boolean;
};

type CourseKind = 'teach' | 'practice' | 'check' | 'probe' | 'final';
export type CourseAction = {kind:CourseKind;projectId:string;id:string};

export function courseAction(read: AgendaRead | null | undefined): CourseAction | undefined {
  const outcome=read?.decision.outcome;
  if (outcome?.kind!=='action') return undefined;
  const match=/^([^/]+)\/(teach|practice|check|probe|final):([^/]+)$/.exec(outcome.taskId);
  if (match) return {projectId:match[1],kind:match[2] as CourseKind,id:match[3]};
}

export function fallbackTutor(read: AgendaRead | null | undefined, projects: readonly ProjectSummary[], waiting = false) {
  if (waiting||read?.decision.outcome.kind==='action') return undefined;
  const project=projects.find(item=>item.current);
  if (project?.current) return {title:project.current.title,href:tutorHref(project.slug,project.current.code)};
}

function scheduledStep(read: AgendaRead, input: NextStepInput, outcome: Extract<AgendaRead['decision']['outcome'],{kind:'action'}>): NextStep {
  const minutes = Math.max(1,Math.round(outcome.end-outcome.start));
  const label = read.label ?? 'Study';
  const taskId = /^task\/([^/]+)$/.exec(outcome.taskId)?.[1];
  if (taskId) {
    const task = input.tasks.find(item=>item.id===taskId);
    const focus = task ? {subjectId:task.subjectId,projectId:task.projectId,checkpointId:task.checkpointId} : undefined;
    return {part:'Learn',title:task?.title??label,action:'Start focus',minutes,focus,why:'Your study plan made time for this task.'};
  }

  const review = /^(?:([^/]+)\/)?review:([^/]+)$/.exec(outcome.taskId);
  const course = courseAction(read);
  const projectId = course?.projectId ?? review?.[1];
  const project = input.projects.find(item=>item.id===projectId);
  const unavailable: NextStep = {part:'Learn',title:label,action:'Quick focus',minutes,why:'The recommended step is unavailable.'};
  if (review) {
    const why=project?`A card from ${project.title} is ready to review.`:'A card is ready to review.';
    if (input.scopedReview) return {part:'Checks',title:read.label??'Review a card',action:'Start review',href:reviewHref({kind:'card',id:review[2]}),minutes,why};
    if (project) return {part:'Checks',title:label,action:'Open review',href:'/review?path='+encodeURIComponent(project.slug),minutes,why};
  }
  if (!project||!course) return unavailable;
  const {kind}=course;
  const practice = read.practice;
  const successChance=practice?.status==='available'?Math.round((practice.forecast?.probability??practice.native)*100):undefined;
  if (kind==='practice') {
    const topic=read.label?.replace(/^Practice(?: · )?/,'')||'this topic';
    return {part:'Practice',title:read.label??'Practice',action:'Start practice',href:'/practice',minutes,
      why:`The plan has time to practise ${topic} on ${project.title}.`,successChance};
  }
  const path: NextStep = {...unavailable,action:'Open path',href:'/p/'+encodeURIComponent(project.slug)};
  const checkpoint = input.checkpoint;
  if (!checkpoint) return {...path,why:input.loadingCheckpoint?`Looking up the checkpoint on ${project.title}.`
    :`The recommended checkpoint on ${project.title} is unavailable.`};
  const scope = `${checkpoint.title} on ${project.title}`;
  const why = kind==='teach'?`${checkpoint.title} is next on ${project.title}.`:kind==='probe'?`Revisit ${scope}.`
    :`Check your understanding of ${scope}.`;
  return {part:kind==='check'||kind==='final'?'Checks':'Learn',title:read.label??checkpoint.title,
    action:'Start with tutor',href:tutorHref(project.slug,checkpoint.code),minutes,why,successChance};
}

export function nextStep(read: AgendaRead | null | undefined, input: NextStepInput): NextStep {
  if (input.active) return {part:'Learn',title:'Focus in progress',action:'Return to focus',href:'/focus',why:'Finish or resume your current session first.'};
  if (input.localMinute < 240 || input.closed) return {part:'Close',title:'Plan tomorrow',action:'Plan tomorrow',href:'/calendar?view=day&plan=tomorrow',why:'Set aside time for your next day of study.'};
  if (input.localMinute >= 1260) return {part:'Close',title:'Close the day',action:'Close the day',href:'/today/close',why:'Close today and make room for tomorrow.'};
  const outcome = read?.decision.outcome;
  if (outcome?.kind === 'action' && read) return scheduledStep(read,input,outcome);
  if (outcome?.kind === 'fixed' || outcome?.kind === 'protected') {
    const until = outcome.until == null ? null : outcome.until * 60_000;
    const why='Your calendar has time reserved for a commitment.';
    if (until !== null && until > input.now) return {part:'Learn',title:'Free at '+formatClock(new Date(until),{zone:input.zone}),action:'Plan then',href:'/calendar?plan=1',why};
    return {part:'Learn',title:'Time is reserved',action:'Open calendar',href:'/calendar?view=day',why};
  }
  if (outcome?.kind === 'no-capacity') return {part:'Learn',title:'How long do you have?',action:'Find a step',why:'Choose the time you have to find a step that fits.'};
  if (input.waitingForAgenda) return {part:'Learn',title:'Finding your next step…',action:'Quick focus',why:'Your study plan is loading.'};
  if (input.due) return {part:'Checks',title:'Review '+input.due+' '+(input.due===1?'card':'cards'),action:'Start review',
    href:'/review?start=1',minutes:input.reviewMinutes,why:'Reviews first help you keep what you learned.'};
  const tutor=fallbackTutor(read,input.projects);
  if (tutor) return {part:'Learn',title:tutor.title,action:'Start with tutor',href:tutor.href,why:'Continue your current checkpoint.'};
  return {part:'Learn',title:'Find time to study',action:'Quick focus',why:'Choose the time you have to find a step that fits.'};
}

export function freeMinutes(now: number, nextStart: string | undefined, focusMinutes: number) {
  const gap = nextStart ? (Date.parse(nextStart)-now)/60_000 : 90;
  return Math.min(90,Math.max(10,Math.floor(Math.min(gap,focusMinutes)/5)*5));
}
