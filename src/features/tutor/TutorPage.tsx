import {useState, useSyncExternalStore} from 'react';
import {Link, Navigate, useParams} from 'react-router';
import {DetailHeader} from '../../app/v7/V7Shell';
import {authGeneration, authOwner, onAccountChange} from '../../data/authBoundary';
import {useCheckpoint, useProject, useSettings} from '../../data/hooks';
import {getMode} from '../../data/mode';
import {tutorOwnerDeleted} from '../../data/tutor/local-storage';
import {isFlagOn} from '../../flags';
import {chatLink, studyPrompt} from '../../lib/chat';
import {CheckpointTutor} from './DemoCheckpointTutor';
import {TutorLayout, type TutorPageContext} from './TutorLayout';
import {tutorHref} from './tutorHref';
import type {ProjectDetail} from '../../data/types';
import {Button} from '../../ui/v7/components';
import './tutor.css';

function RouteMessage({slug, message, retry}: {slug: string; message: string; retry?: () => void}) {
  return <main id="main-content" className="v7-page tutor-message" aria-label="Checkpoint tutor">
    <DetailHeader title="Checkpoint tutor" back={'/p/' + encodeURIComponent(slug)}/>
    <p role="status">{message}</p>
    {retry && <Button onClick={retry}>Try again</Button>}
    <Link to={'/p/' + encodeURIComponent(slug)}>Back to path</Link>
  </main>;
}

export default function TutorPage() {
  const {slug = '', code} = useParams();
  const project = useProject(slug);
  if (!project.data) return <RouteMessage slug={slug}
    message={project.isError ? 'Could not load this path.' : 'Opening your path…'}
    retry={project.isError ? () => void project.refetch() : undefined}/>;
  const checkpoints = project.data.checkpoints.filter(cp => cp.ui !== 'proposed');
  if (code && !checkpoints.some(cp => cp.code === code))
    return <RouteMessage slug={slug} message="This checkpoint is unavailable."/>;
  if (!code) {
    const current = checkpoints.find(cp => cp.ui === 'now');
    if (current) return <Navigate replace to={tutorHref(slug, current.code)}/>;
    return <main id="main-content" className="v7-page tutor-message" aria-label="Checkpoint tutor">
      <DetailHeader title="Checkpoint tutor" back={'/p/' + encodeURIComponent(slug)}/>
      <h1>{project.data.project.title}</h1>
      {checkpoints.length ? <><p>Choose a checkpoint to continue with your tutor.</p>
        {checkpoints.map(cp => <Link key={cp.id} to={tutorHref(slug, cp.code)}>{cp.title}</Link>)}</>
        : <p>Approve a checkpoint in your plan to start a tutor conversation.</p>}
      <Link to={'/p/' + encodeURIComponent(slug)}>Back to path</Link>
    </main>;
  }
  return <SelectedTutor key={JSON.stringify([slug, code])} slug={slug} code={code} project={project.data}/>;
}

function SelectedTutor({slug, code, project}: {slug: string; code: string; project: ProjectDetail}) {
  useSyncExternalStore(onAccountChange, authGeneration);
  const checkpoint = useCheckpoint(slug, code), settings = useSettings();
  const detail = checkpoint.data;
  if (!detail || detail.view.code !== code) return <RouteMessage slug={slug}
    message={checkpoint.isError ? 'Could not load this checkpoint.' : 'Opening your checkpoint…'}
    retry={checkpoint.isError ? () => void checkpoint.refetch() : undefined}/>;
  const live = getMode() === 'live';
  if (live && (!detail.authScope || detail.authScope.ownerId !== authOwner() ||
      detail.authScope.checkpointId !== detail.view.id || tutorOwnerDeleted(detail.authScope.ownerId)))
    return <RouteMessage slug={slug} message="Reopen this checkpoint with its signed-in account." retry={() => void checkpoint.refetch()}/>;
  const page: TutorPageContext = {project, detail, client: settings.data?.preferredChat ?? 'claude'};
  if (live && !isFlagOn('tutorThreads')) return <HandoffOnly page={page}/>;
  return <CheckpointTutor page={page} connectorUrl={live ? settings.data?.connectorUrl : undefined}
    connectorLoading={live && settings.isPending} scope={{pathId: slug, checkpointId: detail.view.id, title: detail.view.title,
    objective: detail.objective, sourceShort: detail.sourceShort, authScope: detail.authScope,
    linkedSessions: detail.sessions.filter(s => s.display !== 'ended')}}/>;
}

/** A client rollback still offers the established, explicitly opened study prompt. */
function HandoffOnly({page}: {page: TutorPageContext}) {
  const [draft, setDraft] = useState('');
  const prompt = studyPrompt(page.project.project.title, page.detail.view.code, page.detail.view.title);
  return <TutorLayout page={page} sequence={0}>
    <div className="chat"><p>Saved conversations are unavailable. Open this checkpoint in your tutor to continue.</p>
      <label>Question<textarea className="v7-field" value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)}/></label>
      <a className="btn primary" href={chatLink(page.client, [prompt, draft].filter(Boolean).join('\n\n'))}
        target="_blank" rel="noopener noreferrer">Open {page.client === 'claude' ? 'Claude' : 'ChatGPT'}</a>
    </div>
  </TutorLayout>;
}
