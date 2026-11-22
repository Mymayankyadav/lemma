import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {useQuery} from '@tanstack/react-query';
import {CircleHelp, Clock, Play} from 'lucide-react';
import {Button,IconButton,Sheet} from '../../../ui/v7/components';
import {RulerSlider} from '../../../ui/v7/RulerSlider';
import {useAgenda} from '../../../data/adaptive/agenda-api';
import {setDayCapacity} from '../../../data/adaptive/capacity-override';
import {authGeneration,authSignedOut} from '../../../data/authBoundary';
import {getMode} from '../../../data/mode';
import {useStudyUi} from '../../../data/StudyUiRelease';
import type {StudyLinks} from '../../../data/study/contract';
import type {TaskRecord} from '../../../data/tasks/contract';
import type {ProjectSummary} from '../../../data/types';
import {formatDuration} from '../../../lib/format';
import {courseAction,fallbackTutor,freeMinutes,nextStep} from './nextStepModel';
import {readScheduledCheckpoint} from './scheduledCheckpoint';
import {clockTime} from './todayModel';

const parts = ['Checks','Learn','Practice','Close'] as const;
type Props = {
  now: number; day: string; zone: string; localMinute: number; logged: number;
  focusMinutes: number; due: number; reviewMinutes: number; pending: boolean; closed: boolean;
  projects: readonly ProjectSummary[]; tasks: readonly TaskRecord[];
  commitment?: {title:string;startsAt:string};
  onFocus: () => void;
  onStartFocus: (title: string, links?: StudyLinks) => void;
};

export function NextStep(props: Props) {
  const {enabled,query} = useAgenda();
  const scopedReview = useStudyUi();
  const [why,setWhy] = useState(false), [chosen,setChosen] = useState<number | null>(null);
  const [saving,setSaving] = useState(false), [error,setError] = useState('');
  const read = query.data;
  const course=courseAction(read);
  const target=props.projects.find(project=>project.id===course?.projectId);
  const checkpoint=useQuery({queryKey:['today-scheduled-checkpoint',getMode(),authGeneration(),target?.id,target?.slug,course?.kind,course?.id],
    enabled:!authSignedOut()&&!!target&&!!course&&course.kind!=='practice'&&!props.pending&&!props.closed&&props.localMinute>=240&&props.localMinute<1260,
    queryFn:()=>readScheduledCheckpoint(course!,target!.slug),staleTime:30_000});
  const waitingForAgenda = enabled && query.isPending;
  const step = nextStep(read,{...props,active:props.pending,scopedReview,checkpoint:checkpoint.data,
    loadingCheckpoint:checkpoint.isFetching&&!checkpoint.data,waitingForAgenda});
  const tutor = fallbackTutor(read,props.projects,waitingForAgenda);
  const thenTutor = tutor?.href===step.href?undefined:tutor;
  const index = parts.indexOf(step.part);
  const minutes = chosen ?? freeMinutes(props.now,props.commitment?.startsAt,props.focusMinutes);
  useEffect(()=>{setChosen(null);setError('');},[props.day]);

  async function plan(value: number) {
    setSaving(true);
    setError('');
    try{
      await setDayCapacity(props.day,Math.min(1440,Math.round(props.logged)+value));
      await query.refetch();
    }catch{
      setError('Could not update your study time.');
    }finally{
      setSaving(false);
    }
  }

  return <section className="v7-today-next v7-card" aria-label="Your next step">
    <ol className="v7-loop-ribbon" aria-label="Study loop">{parts.map((part,at)=><li key={part}
      aria-current={at===index?'step':undefined} data-step={at<=index?'reached':undefined}>{part}</li>)}</ol>
    <div className="v7-today-now-heading">
      <div><p className="v7-eyebrow">Now · {step.part}</p><h2>{step.title}</h2>
        {step.minutes!==undefined&&<p className="v7-meta">About {formatDuration(step.minutes)}</p>}</div>
      <IconButton label="Why this" onClick={()=>setWhy(true)} aria-haspopup="dialog"><CircleHelp aria-hidden="true"/></IconButton>
    </div>
    <div className="v7-today-next-actions">
      {step.href?<Link className="v7-button v7-primary" to={step.href}>{step.action==='Start review'&&<Play size={16} aria-hidden="true"/>}{step.action}</Link>
        :<Button variant="primary" loading={saving} onClick={()=>step.action==='Find a step'?void plan(minutes):
          step.action==='Start focus'?props.onStartFocus(step.title,step.focus):props.onFocus()}>{step.action}</Button>}
      {step.action!=='Quick focus'&&<IconButton label="Quick focus" onClick={()=>props.onFocus()}><Clock aria-hidden="true"/></IconButton>}
    </div>
    {(thenTutor||props.commitment)&&<div className="v7-today-then">
      <p className="v7-eyebrow">Then</p>
      {thenTutor&&<Link to={thenTutor.href}><strong>{thenTutor.title}</strong><small>With tutor</small></Link>}
      {props.commitment&&<Link to="/calendar?view=day"><strong>{props.commitment.title}</strong><small>{clockTime(props.commitment.startsAt,props.zone)}</small></Link>}
    </div>}
    {!props.pending&&step.part!=='Close'&&<div className="v7-today-capacity" aria-busy={saving}>
      <RulerSlider label="Time you have now" min={10} max={90} value={minutes} format={formatDuration} tickFormat={String}
        onChange={setChosen} onCommit={value=>{void plan(value);}}/>
      {chosen!==null&&!saving&&!error&&<p className="v7-meta" role="status">Plan updated for {formatDuration(chosen)}</p>}
      {error&&<p role="alert">{error} <button type="button" onClick={()=>{void plan(minutes);}}>Retry</button></p>}
    </div>}
    <Sheet open={why} onClose={()=>setWhy(false)} title="Why this">
      <p>{step.why}</p>
      {step.successChance!==undefined&&<p>Estimated success · {step.successChance}%</p>}
    </Sheet>
  </section>;
}

export function TodayFirstRun({configured,tutor,onFocus}: {configured:boolean;tutor:boolean;onFocus:()=>void}) {
  const done = Number(configured)+Number(tutor);
  return <section aria-label="Get started" className="v7-today-next v7-card v7-first-steps">
    <p className="v7-eyebrow">Get started · {done} of 3</p>
    <span className="v7-setup-ring" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done} data-completed={done}/>
    <ol>
      <li><Link to="/projects/new"><strong>Start a path</strong><small>Choose a goal</small></Link></li>
      <li data-done={tutor||undefined}><Link to="/settings?section=tutor"><strong>Connect your tutor</strong><small>Plan a path together.</small></Link></li>
      <li data-done={configured||undefined}><Link to="/settings?section=planning&capacity=1"><strong>Set your study time</strong><small>Find a next step that fits.</small></Link></li>
    </ol>
    <Button onClick={onFocus}>Quick focus</Button>
  </section>;
}
