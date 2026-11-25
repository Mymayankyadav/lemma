import {useId,useState, type ReactNode, type Ref} from 'react';
import {Link} from 'react-router';
import {tutorPresence} from './presence';
import {useToast} from '../../ui/Toast';
import {ArrowRight, ChevronLeft, Copy, Ellipsis} from 'lucide-react';
import type {CheckpointDetail, ProjectDetail} from '../../data/types';
import {useStudyUi} from '../../data/StudyUiRelease';
import {reviewHref} from '../../data/review-target';
import {announceFocusChange, focusClock, focusWord, useActiveFocus, useNow} from '../../app/v7/focus';
import {useSubjectColours} from '../../app/v7/subjectColours';
import {useDetailBack} from '../../app/v7/useDetailBack';
import {getStudyApi} from '../../data/study';
import {MathText} from '../../ui/MathText';
import {Button, IconButton, Sheet} from '../../ui/v7/components';
import {kitSubject} from '../atlas/v7/model';
import type {SittingRecord} from '../../data/exam/contract';
import {BackToStudy,ExamChatNotice,TutorExamControl,TutorExamHeader,type TutorExamPanel} from '../exam/TutorExamTools';
import {currentStudyStep} from '../project/v7/pathModel';


export type TutorPageContext = {project: ProjectDetail; detail: CheckpointDetail; client: 'claude' | 'chatgpt';exam?:SittingRecord;activeExam?:SittingRecord};
type Props = {
  page: TutorPageContext; sequence: number; children: ReactNode;
  overview?: boolean; offline?: boolean; onOverview?: () => void; onQuestion?: () => void;
  onCloseSession?: () => void; onConnection?: () => void; onContext?: () => void;
  listenerSeenAt?:string|null; claimExpiresAt?:string; resumePrompt?:string;
  headerHidden?: boolean;
  sessionActionsOpen?: boolean; onSessionActions?: (open: boolean) => void;
  answerActions?: Ref<HTMLDivElement>;
  examPanel?:TutorExamPanel;
  onExamPanel?:(panel?:TutorExamPanel)=>void;
};

export function TutorLayout({page, sequence, children, overview, offline, onOverview, onQuestion, onCloseSession, onConnection, onContext, listenerSeenAt, claimExpiresAt, resumePrompt, headerHidden = false, sessionActionsOpen, onSessionActions, answerActions, examPanel, onExamPanel}: Props) {
  const [localExamPanel,setLocalExamPanel]=useState<TutorExamPanel>();
  const examView=examPanel??localExamPanel,startExamPanel=onExamPanel??setLocalExamPanel;
  const [localActionsOpen, setLocalActionsOpen] = useState(false);
  const actionsOpen = sessionActionsOpen ?? localActionsOpen;
  const setActionsOpen = onSessionActions ?? setLocalActionsOpen;
  const [panel, setPanel] = useState<'plan' | 'timer' | 'checks' | 'practice'>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const {project, detail} = page, path = '/p/' + encodeURIComponent(project.project.slug);
  const notify=useToast();
  const checkpoint = path + '/cp/' + encodeURIComponent(detail.view.code);
  const goBack=useDetailBack(page.exam?path+'?tab=exam&examSitting='+encodeURIComponent(page.exam.id):checkpoint);
  const studyUi = useStudyUi(), focus = useActiveFocus(), now = useNow();
  const clock = focus.entry ? focusClock(focus.entry, now).label : '0:00';
  const timerState = focus.entry ? focusWord(focus.entry) : null;
  const step = currentStudyStep(detail.view);
  const presence=tutorPresence(now,listenerSeenAt,claimExpiresAt,offline);
  const checking = detail.view.dueCards > 0 && sequence === 0;
  useSubjectColours();
  const subject = kitSubject(project.subject.name).toLowerCase().replaceAll(' ', '-');
  async function timerAction(action: 'toggle' | 'break' = 'toggle') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const api = getStudyApi(), entry = focus.entry;
      if (!entry) await api.startStudyEntry({source: 'timer', intent: detail.view.title,
        projectId: project.project.id, checkpointId: detail.view.id, subjectId: project.subject.id});
      else if (action === 'break') await api.breakStudyEntry(entry.id, entry.version);
      else if (entry.status === 'paused' || timerState === 'Break') await api.resumeStudyEntry(entry.id, entry.version);
      else await api.pauseStudyEntry(entry.id, entry.version);
      announceFocusChange();
    } catch {focus.refresh(); setError('Could not update the timer. Try again.');}
    finally {setBusy(false);}
  }
  const sessionAction = (action: () => void) => {
    setActionsOpen(false);
    action();
  };
  return <main id="main-content" className="v7-page lemma-tutor w-full" aria-label={page.exam?'Exam tutor':'Checkpoint tutor'} data-subject={subject} data-header-hidden={headerHidden || undefined}>
    <header className="tutor-header" inert={headerHidden}>
      <IconButton label="Back" onClick={goBack}><ChevronLeft aria-hidden="true"/></IconButton>
      <div className="tutor-header-title">{page.exam?<TutorExamHeader sitting={page.exam} open={examView==='ledger'} onOpen={()=>startExamPanel('ledger')}/>:<strong>{detail.view.title}</strong>}<TutorPresence presence={presence}/></div>
      <IconButton label="Session actions" onClick={() => setActionsOpen(true)} aria-haspopup="dialog" aria-expanded={actionsOpen} data-tutor-session-actions="" data-v7-search-opener=""><Ellipsis aria-hidden="true"/></IconButton>
    </header>
    {!overview&&!page.exam&&<div className="tutor-session-progress" aria-label="Session parts" inert={headerHidden}>
      {['Checks','Learn','Practice','Close'].map((part,index)=><span key={part} aria-label={part} data-reached={index<2||undefined}/>)}
    </div>}
    <h1 className="v7-sr-only">{project.project.title} · {detail.view.code} · {detail.view.title}{offline && ' · Offline'}</h1>
    {overview && <nav className="rail" aria-label="Session parts">
      <button className={'seg-r' + (checking ? ' cur' : sequence && !detail.view.dueCards ? ' done' : '')}
        aria-current={checking ? 'step' : undefined} aria-haspopup="dialog" onClick={() => setPanel('checks')}>
        <b>Checks</b><small>{detail.view.dueCards ? detail.view.dueCards + ' due' : 'none due'}</small></button>
      <button className={'seg-r' + (checking ? '' : ' cur')} aria-current={checking ? undefined : 'step'}
        aria-haspopup="dialog" onClick={() => setPanel('plan')}><b>Learn</b><small>{sequence ? 'Q' + sequence : step.ordinal ? step.ordinal + ' of ' + step.total : 'Start here'}</small></button>
      <button className="seg-r" aria-haspopup="dialog" onClick={() => setPanel('practice')}><b>Practice</b><small>after Learn</small></button>
      {onCloseSession && <button className="seg-r" aria-haspopup="dialog" onClick={onCloseSession}><b>Close</b><small>at the end</small></button>}
    </nav>}
    {page.activeExam&&!page.exam&&!headerHidden&&<ExamChatNotice key={page.activeExam.id} sitting={page.activeExam} slug={project.project.slug}/>}
    {children}
    {page.exam&&examView&&<TutorExamControl project={project} sitting={page.exam} key={examView} activePanel={examView} onClose={()=>startExamPanel()}/>}
    <Sheet open={actionsOpen} onClose={() => setActionsOpen(false)} title={page.exam?'Exam session':'Study session'}>
      <p><strong>{project.project.title}</strong><br/>{detail.view.code} · {detail.view.title}{step.ordinal ? ' · Step ' + step.ordinal + ' of ' + step.total : ''}</p>
      {timerState&&<p>{timerState} · {clock}</p>}
      {answerActions && <div className="tutor-session-actions" ref={answerActions}/>}
      <div className="tutor-session-actions">
        {onOverview && <Button small onClick={() => sessionAction(onOverview)}>Next up</Button>}
        {onQuestion && <Button small onClick={() => sessionAction(onQuestion)}>Latest question</Button>}
        {page.exam&&page.exam.status!=='finished'&&<>
         <BackToStudy project={project} sitting={page.exam} callback={()=>setActionsOpen(false)}/>
         <Button onClick={()=>sessionAction(()=>startExamPanel('finish'))}>Finish exam…</Button>
         <Button onClick={()=>sessionAction(()=>startExamPanel('budget'))}>I have {page.exam.study_minutes??0} min</Button>
        </>}
        {!page.exam&&<Button small onClick={() => sessionAction(() => setPanel('plan'))}>Learn plan</Button>}
        {!page.exam&&<><Button small onClick={() => sessionAction(() => setPanel('checks'))}>Checks{detail.view.dueCards > 0 ? ' · ' + detail.view.dueCards + ' due' : ''}</Button>
        <Button small onClick={() => sessionAction(() => setPanel('practice'))}>Practice</Button>
        <Button small onClick={() => sessionAction(() => setPanel('timer'))}>Study timer</Button></>}
        {onContext && <Button small onClick={() => sessionAction(onContext)}>Context</Button>}
        {onConnection && <Button small onClick={() => sessionAction(onConnection)}>Connection</Button>}
        {resumePrompt&&<Button small onClick={()=>{
          void navigator.clipboard.writeText(resumePrompt).then(()=>notify('Prompt copied')).catch(()=>notify('Could not copy the prompt.'));
        }}><Copy aria-hidden="true"/>Copy prompt</Button>}
        <Button small aria-haspopup="dialog" onClick={() => sessionAction(() => window.dispatchEvent(new CustomEvent('v7:search')))}>Search</Button>
        {onCloseSession && <Button small onClick={() => sessionAction(onCloseSession)}>Close session</Button>}
      </div>
    </Sheet>
    <Sheet open={panel === 'plan'} onClose={() => setPanel(undefined)} title={detail.view.title}>
      <div className="tutor-plan">
        <MathText source={detail.objective}/>
        {!!detail.steps.length && <ol>{detail.steps.map((text, index) => <li key={index} aria-current={index === step.index ? 'step' : undefined}><MathText source={text}/></li>)}</ol>}
        {detail.criterion && <><h3>Your goal</h3><MathText source={detail.criterion}/></>}
        {detail.sourceShort && <Link to={path + '?tab=sources'}>{detail.sourceShort}{detail.pages ? ' · p. ' + detail.pages : ''}</Link>}
      </div>
      <Link className="v7-button v7-secondary" to={path}>Open plan</Link>
    </Sheet>
    <Sheet open={panel === 'checks'} onClose={() => setPanel(undefined)} title="Checks">
      <p>{detail.view.dueCards === 1 ? '1 card is due for this checkpoint.' : detail.view.dueCards ? detail.view.dueCards + ' cards are due for this checkpoint.' : 'No cards are due for this checkpoint.'}</p>
      <Link className="v7-button v7-secondary" to={studyUi ? reviewHref({kind:'checkpoint', id: detail.view.id}) : '/review?path=' + encodeURIComponent(project.project.slug)}>Open review</Link>
    </Sheet>
    <Sheet open={panel === 'practice'} onClose={() => setPanel(undefined)} title="Practice">
      <Link className="v7-button v7-secondary" to="/practice">Open practice</Link>
    </Sheet>
    <Sheet open={panel === 'timer'} onClose={() => setPanel(undefined)} title="Study timer">
      {focus.entry ? <><p className="tbig">{clock}</p><p>{timerState} · {focus.entry.intent}</p></>
        : <p>Start a timer for {detail.view.title}. You can save the time to your study log when you finish.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="tutor-timer-actions">
        <Button disabled={busy || focus.loading || offline} onClick={() => void timerAction()}>
          {!timerState ? 'Start timer' : timerState === 'Focus' ? 'Pause timer' : 'Resume timer'}
        </Button>
        {timerState === 'Focus' && <Button disabled={busy || offline} onClick={() => void timerAction('break')}>Take a break</Button>}
      </div>
      {focus.entry && <Link className="v7-button v7-secondary" to="/focus">Open timer and finish session</Link>}
    </Sheet>
  </main>;
}

function TutorPresence({presence}:{presence:string}) {
  const [open,setOpen]=useState(false),id=useId();
  return <span className="tutor-presence-control" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
    <button type="button" className="v7-icon-button tutor-presence-light" data-presence={presence}
      aria-label={'Tutor status: '+presence} aria-describedby={open?id:undefined}
      onClick={()=>setOpen(true)} onBlur={()=>setOpen(false)}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);}}}>
      <span aria-hidden="true"/>
    </button>
    <span className="v7-sr-only" role="status">{presence}</span>
    {open&&<span className="tutor-presence-tooltip" id={id} role="tooltip">{presence}</span>}
  </span>;
}

export function TutorOverview({page, busy, hasTurns, onBegin, onContinue, onWrite}: {
  page: TutorPageContext; busy: boolean; hasTurns: boolean; onBegin: () => void; onContinue: () => void; onWrite?: () => void;
}) {
  const {detail} = page;
  return <section className="tutor-start">
    <div><p className="v7-eyebrow">On the table</p><h2>{detail.view.title}</h2>
      <div className="tutor-start-goal"><MathText source={detail.criterion || detail.objective}/></div></div>
    <div className="tutor-start-actions">
      <Button variant="primary" small disabled={busy} onClick={hasTurns ? onContinue : onBegin}>
        {hasTurns ? 'Continue conversation' : 'Begin session'}<ArrowRight aria-hidden="true"/>
      </Button>
      {onWrite && <Button variant="ghost" small onClick={onWrite}>Write a question</Button>}
    </div>
  </section>;
}
