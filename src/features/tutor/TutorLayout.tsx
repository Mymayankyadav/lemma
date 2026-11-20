import {useState, type ReactNode} from 'react';
import {Link} from 'react-router';
import {ArrowRight, Ellipsis} from 'lucide-react';
import type {CheckpointDetail, ProjectDetail} from '../../data/types';
import {useStudyUi} from '../../data/StudyUiRelease';
import {reviewHref} from '../../data/review-target';
import {announceFocusChange, focusClock, focusWord, useActiveFocus, useNow} from '../../app/v7/focus';
import {useSubjectColours} from '../../app/v7/subjectColours';
import {DetailHeader} from '../../app/v7/V7Shell';
import {getStudyApi} from '../../data/study';
import {MathText} from '../../ui/MathText';
import {Button, IconButton, Sheet} from '../../ui/v7/components';
import {kitSubject} from '../atlas/v7/model';
import {currentStudyStep} from '../project/v7/pathModel';
import {TutorMark} from './TutorMark';

export type TutorPageContext = {project: ProjectDetail; detail: CheckpointDetail; client: 'claude' | 'chatgpt'};
type Props = {
  page: TutorPageContext; sequence: number; children: ReactNode;
  overview?: boolean; offline?: boolean; onOverview?: () => void; onQuestion?: () => void;
  onCloseSession?: () => void; onConnection?: () => void;
};

export function TutorLayout({page, sequence, children, overview, offline, onOverview, onQuestion, onCloseSession, onConnection}: Props) {
  const [panel, setPanel] = useState<'session' | 'plan' | 'timer' | 'checks' | 'practice'>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const {project, detail} = page, path = '/p/' + encodeURIComponent(project.project.slug);
  const title = detail.view.code + ' · ' + (offline ? 'Offline' : detail.view.title);
  const checkpoint = path + '/cp/' + encodeURIComponent(detail.view.code);
  const studyUi = useStudyUi(), focus = useActiveFocus(), now = useNow();
  const clock = focus.entry ? focusClock(focus.entry, now).label : '0:00';
  const timerState = focus.entry ? focusWord(focus.entry) : null;
  const step = currentStudyStep(detail.view);
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
    setPanel(undefined);
    action();
  };
  return <main id="main-content" className="v7-page lemma-tutor w-full" aria-label="Checkpoint tutor" data-subject={subject}>
    <DetailHeader title={title} back={checkpoint} extraAction={
      <IconButton label="Session actions" onClick={() => setPanel('session')} aria-haspopup="dialog">
        <Ellipsis aria-hidden="true"/>
      </IconButton>
    }/>
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
    {children}
    <Sheet open={panel === 'session'} onClose={() => setPanel(undefined)} title="Study session">
      <p><strong>{project.project.title}</strong><br/>{detail.view.title}{step.ordinal ? ' · Step ' + step.ordinal + ' of ' + step.total : ''}</p>
      <div className="tutor-session-actions">
        {onOverview && <Button small onClick={() => sessionAction(onOverview)}>Next up</Button>}
        {onQuestion && <Button small onClick={() => sessionAction(onQuestion)}>Latest question</Button>}
        <Button small onClick={() => setPanel('plan')}>Learn plan</Button>
        <Button small onClick={() => setPanel('checks')}>Checks{detail.view.dueCards > 0 ? ' · ' + detail.view.dueCards + ' due' : ''}</Button>
        <Button small onClick={() => setPanel('practice')}>Practice</Button>
        <Button small onClick={() => setPanel('timer')}>Study timer</Button>
        {onConnection && <Button small onClick={() => sessionAction(onConnection)}>Tutor connection</Button>}
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

export function TutorOverview({page, busy, hasTurns, onBegin, onContinue, onWrite}: {
  page: TutorPageContext; busy: boolean; hasTurns: boolean; onBegin: () => void; onContinue: () => void; onWrite?: () => void;
}) {
  const {project, detail} = page, step = currentStudyStep(detail.view);
  const [title, ...subtitle] = detail.view.title.split(/:\s+/);
  return <div className="nextup"><section className="hero">
    <TutorMark className="emblem"/>
    <div className="chips"><span className="chip subjchip"><i className="sd" aria-hidden="true"/>{project.subject.name}</span>
      <span className="chip mute">{detail.view.code}{step.ordinal ? ' · step ' + step.ordinal + ' of ' + step.total : ''}</span></div>
    <h2>{title}</h2>
    {!!subtitle.length && <p className="sub">{subtitle.join(': ')}</p>}
    {!!detail.steps.length && <><ol className="steps" aria-label="Steps of this checkpoint">{detail.steps.map((_, i) =>
      <li key={i} className={i < step.index ? 'done' : i === step.index ? 'cur' : ''} aria-current={i === step.index ? 'step' : undefined}>
        <span className="sr">Step {i + 1}</span></li>)}</ol>
      <MathText className="now" source={detail.steps[step.index] ? 'Now: ' + detail.steps[step.index] : 'All steps completed'}/></>}
    <div className="goal"><span className="eyebrow">Your goal</span><MathText source={detail.criterion || detail.objective}/></div>
    {detail.sourceShort && <div className="facts"><span>Book <b>{detail.sourceShort}</b></span></div>}
    <div className="actions">
      <Button className="cta" variant="primary" disabled={busy} onClick={hasTurns ? onContinue : onBegin}>
        {hasTurns ? 'Continue conversation' : 'Begin session'}<ArrowRight aria-hidden="true"/>
      </Button>
      <div className="duo">
        <Link className="v7-button v7-secondary" to={'/p/' + encodeURIComponent(project.project.slug)}>Plan</Link>
        {onWrite && <Button onClick={onWrite}>Write a question</Button>}
      </div>
    </div>
  </section></div>;
}
