import type {AgendaRead} from '../../../data/adaptive/agenda-api';
import {formatClock} from '../../../lib/format';

export type NextStep = {
  part: 'Checks' | 'Learn' | 'Practice' | 'Close';
  title: string;
  action: string;
  href?: string;
  minutes?: number;
};

export function nextStep(read: AgendaRead | null | undefined, input: {
  due: number; reviewMinutes: number; tutorHref?: string; tutorTitle?: string; active: boolean;
  now: number; localMinute: number; zone: string; closed: boolean;
}): NextStep {
  if (input.active) return {part:'Learn',title:'Focus in progress',action:'Return to focus',href:'/focus'};
  if (input.localMinute < 240 || input.closed) return {part:'Close',title:'Plan tomorrow',action:'Plan tomorrow',href:'/calendar?view=day&plan=tomorrow'};
  if (input.localMinute >= 1260) return {part:'Close',title:'Close the day',action:'Close the day',href:'/today/close'};
  const outcome = read?.decision.outcome;
  const review: NextStep = {part:'Checks',title:'Review '+input.due+' '+(input.due===1?'card':'cards'),action:'Start review',href:'/review',minutes:input.reviewMinutes};
  if (outcome?.kind === 'action') {
    const minutes = Math.max(1,Math.round(outcome.end-outcome.start));
    const label = read?.label ?? 'Study';
    if (!outcome.taskId.startsWith('task/')) {
      if (label.startsWith('Review') && input.due) return {...review,minutes};
      if (label.startsWith('Practice')) return {part:'Practice',title:label,action:'Start practice',href:'/practice',minutes};
      if (input.tutorHref) return {part:'Learn',title:label,action:'Start with tutor',href:input.tutorHref,minutes};
    }
    return {part:'Learn',title:label,action:'Start focus',minutes};
  }
  if (outcome?.kind === 'fixed' || outcome?.kind === 'protected') {
    const until = outcome.until == null ? null : outcome.until * 60_000;
    if (until !== null && until > input.now) return {part:'Learn',title:'Free at '+formatClock(new Date(until),{zone:input.zone}),action:'Plan then',href:'/calendar?plan=1'};
    return {part:'Learn',title:'Time is reserved',action:'Open calendar',href:'/calendar?view=day'};
  }
  if (outcome?.kind === 'no-capacity') return {part:'Learn',title:'How long do you have?',action:'Find a step'};
  if (input.due) return review;
  if (input.tutorHref) return {part:'Learn',title:input.tutorTitle ?? 'Continue your path',action:'Start with tutor',href:input.tutorHref};
  return {part:'Learn',title:'Find time to study',action:'Quick focus'};
}

export function freeMinutes(now: number, nextStart: string | undefined, focusMinutes: number) {
  const gap = nextStart ? (Date.parse(nextStart)-now)/60_000 : 90;
  return Math.min(90,Math.max(10,Math.floor(Math.min(gap,focusMinutes)/5)*5));
}
