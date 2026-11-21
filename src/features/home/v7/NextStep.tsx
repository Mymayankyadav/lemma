import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {CircleHelp, Clock, Play} from 'lucide-react';
import {Button,IconButton,Sheet} from '../../../ui/v7/components';
import {RulerSlider} from '../../../ui/v7/RulerSlider';
import {useAgenda} from '../../../data/adaptive/agenda-api';
import {setDayCapacity} from '../../../data/adaptive/capacity-override';
import {formatDuration} from '../../../lib/format';
import {freeMinutes,nextStep} from './nextStepModel';
import {clockTime} from './todayModel';
import {tutorHref} from '../../tutor/tutorHref';

const parts = ['Checks','Learn','Practice','Close'] as const;
type Props = {
  now: number; day: string; zone: string; localMinute: number; logged: number;
  focusMinutes: number; due: number; reviewMinutes: number; pending: boolean; closed: boolean;
  project?: {slug:string;title:string;current?:{code:string;title:string} | null};
  commitment?: {title:string;startsAt:string};
  onFocus: () => void;
  onStartFocus: (title: string) => void;
  onStartReview: () => void;
};

export function NextStep(props: Props) {
  const {query} = useAgenda();
  const [why,setWhy] = useState(false), [chosen,setChosen] = useState<number | null>(null);
  const [saving,setSaving] = useState(false), [error,setError] = useState('');
  const read = query.data;
  const actionProject = read?.decision.outcome.kind === 'action' ? read.decision.outcome.taskId.split('/')[0] : null;
  const project = props.project;
  const tutor = project?.current ? tutorHref(project.slug,project.current.code) : undefined;
  const step = nextStep(read,{...props,active:props.pending,tutorHref:tutor,tutorTitle:project?.current?.title});
  const index = parts.indexOf(step.part), practice = read?.practice;
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
      {step.action==='Start review' ? <Button variant="primary" onClick={props.onStartReview}><Play size={16} aria-hidden="true"/>Start review</Button>
        :step.href?<Link className="v7-button v7-primary" to={step.href}>{step.action}</Link>
        :<Button variant="primary" loading={saving} onClick={()=>step.action==='Find a step'?void plan(minutes):
          step.action==='Start focus'?props.onStartFocus(step.title):props.onFocus()}>{step.action}</Button>}
      {step.action!=='Quick focus'&&<IconButton label="Quick focus" onClick={()=>props.onFocus()}><Clock aria-hidden="true"/></IconButton>}
    </div>
    {(tutor||props.commitment)&&<div className="v7-today-then">
      <p className="v7-eyebrow">Then</p>
      {tutor&&<Link to={tutor}><strong>{project?.current?.title}</strong><small>With tutor</small></Link>}
      {props.commitment&&<Link to="/calendar?view=day"><strong>{props.commitment.title}</strong><small>{clockTime(props.commitment.startsAt,props.zone)}</small></Link>}
    </div>}
    {!props.pending&&step.part!=='Close'&&<div className="v7-today-capacity" aria-busy={saving}>
      <RulerSlider label="Time you have now" min={10} max={90} value={minutes} format={formatDuration} tickFormat={String}
        onChange={setChosen} onCommit={value=>{void plan(value);}}/>
      {chosen!==null&&!saving&&!error&&<p className="v7-meta" role="status">Plan updated for {formatDuration(chosen)}</p>}
      {error&&<p role="alert">{error} <button type="button" onClick={()=>{void plan(minutes);}}>Retry</button></p>}
    </div>}
    <Sheet open={why} onClose={()=>setWhy(false)} title="Why this">
      <p>{step.part==='Checks'?'Reviews first help you keep what you learned.':step.part==='Close'?'Close today and make room for tomorrow.'
        :step.part==='Practice'?'Practice puts what you learned to work.':actionProject&&project?`${project.current?.title ?? project.title} is next on ${project.title}.`:'Choose the time you have to find a step that fits.'}</p>
      {practice?.status==='available'&&<p>Estimated success · {Math.round((practice.forecast?.probability??practice.native)*100)}%</p>}
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
