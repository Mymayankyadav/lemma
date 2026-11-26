import {useState, useSyncExternalStore} from 'react';
import {Link, Navigate, useParams,useSearchParams} from 'react-router';
import {DetailHeader} from '../../app/v7/V7Shell';
import {authGeneration, authOwner, onAccountChange} from '../../data/authBoundary';
import {useCheckpoint, useProject, useSettings} from '../../data/hooks';
import {getMode} from '../../data/mode';
import {tutorOwnerDeleted} from '../../data/tutor/local-storage';
import {isFlagOn} from '../../flags';
import {chatLink, planPrompt, studyPrompt} from '../../lib/chat';
import {CheckpointTutor} from './DemoCheckpointTutor';
import {TutorLayout, type TutorPageContext} from './TutorLayout';
import {tutorHref} from './tutorHref';
import {useExamSnapshot} from '../../data/exam/queries';
import {useOnline} from '../../ui/v7/savedCopy';
import type {CheckpointDetail,ProjectDetail} from '../../data/types';
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
  const [params]=useSearchParams();
  const examId=isFlagOn('examMode')?params.get('exam'):null;
  const project = useProject(slug);
  const checkpoint = useCheckpoint(slug, examId?'':code??'');
  if (!project.data) return <RouteMessage slug={slug}
    message={project.isError ? 'Could not load this path.' : 'Opening your path…'}
    retry={project.isError ? () => void project.refetch() : undefined}/>;
  if(examId)return <ExamTutor key={JSON.stringify([slug,examId])} project={project.data} id={examId} question={params.get('question')?.trim().slice(0,2000)}/>;
  const checkpoints = project.data.checkpoints.filter(cp => cp.ui !== 'proposed');
  if (code && !checkpoints.some(cp => cp.code === code))
    return <RouteMessage slug={slug} message="This checkpoint is unavailable."/>;
  if (!code) {
    const question=params.get('question')?.trim().slice(0,2000);
    const query=question?'?'+new URLSearchParams({question}).toString():'';
    const current = checkpoints.find(cp => cp.ui === 'now');
    if (current) return <Navigate replace to={tutorHref(slug, current.code)+query}/>;
    return <main id="main-content" className="v7-page tutor-message" aria-label="Checkpoint tutor">
      <DetailHeader title="Checkpoint tutor" back={'/p/' + encodeURIComponent(slug)}/>
      <h1>{project.data.project.title}</h1>
      {checkpoints.length ? <><p>Choose a checkpoint to continue with your tutor.</p>
        {checkpoints.map(cp => <Link key={cp.id} to={tutorHref(slug, cp.code)+query}>{cp.title}</Link>)}</>
        : <><p>This path has no plan yet.</p><a className="v7-button v7-primary"
          href={chatLink('claude',question??planPrompt(project.data.project.title))} target="_blank" rel="noopener noreferrer">{question?'Open in Claude':'Plan with your tutor'}</a></>}
      <Link to={'/p/' + encodeURIComponent(slug)}>Back to path</Link>
    </main>;
  }
  return <SelectedTutor key={JSON.stringify([slug, code])} slug={slug} code={code} project={project.data} checkpoint={checkpoint}/>;
}

function ExamTutor({project,id,question}:{project:ProjectDetail;id:string;question?:string}){
  useSyncExternalStore(onAccountChange,authGeneration);
  const slug=project.project.slug, online=useOnline(), settings=useSettings();
  const {query,owner}=useExamSnapshot(project.project.id,slug,true);
  const sitting=query.data?.sittings.find(item=>item.id===id);
  if(!sitting)return <RouteMessage slug={slug} message={query.isPending?'Opening exam chat…':'This exam sitting is unavailable.'}/>;
  const checkpointId='exam:'+sitting.id;
  const authScope=owner&&owner!=='demo'&&owner===authOwner()?{ownerId:owner,generation:authGeneration(),checkpointId}:undefined;
  const detail:CheckpointDetail={
   view:{id:checkpointId,code:'Exam',title:sitting.title,position:0,ui:'now',currentStep:0,stepsTotal:0,recheckDue:null,dueCards:0},
   objective:'',criterion:'',steps:[],pages:null,sourceShort:null,prereqs:[],concepts:[],
   recheckPrompt:null,events:[],cardsCount:0,sessions:[],authScope,
  };
  const page:TutorPageContext={project,detail,exam:sitting,client:settings.data?.preferredChat??'claude'};
  if(getMode()==='live'&&(!authScope||!isFlagOn('tutorThreads')))
   return <RouteMessage slug={slug} message={online?'Sign in to open this exam chat.':'Connect to open this exam chat.'}/>;
  return <CheckpointTutor initialQuestion={question} page={page} connectorUrl={settings.data?.connectorUrl}
   connectorLoading={getMode()==='live'&&settings.isPending}
   scope={{pathId:slug,checkpointId,sittingId:sitting.id,title:sitting.title,objective:'',authScope}}/>;
}

function SelectedTutor({slug, code, project, checkpoint}: {
  slug: string; code: string; project: ProjectDetail; checkpoint: ReturnType<typeof useCheckpoint>;
}) {
  useSyncExternalStore(onAccountChange, authGeneration);
  const [params]=useSearchParams();
  const settings = useSettings();
  const {query:exam}=useExamSnapshot(project.project.id,slug,isFlagOn('examMode'));
  const detail = checkpoint.data;
  if (!detail || detail.view.code !== code) return <RouteMessage slug={slug}
    message={checkpoint.isError ? 'Could not load this checkpoint.' : 'Opening your checkpoint…'}
    retry={checkpoint.isError ? () => void checkpoint.refetch() : undefined}/>;
  const live = getMode() === 'live';
  if (live && (!detail.authScope || detail.authScope.ownerId !== authOwner() ||
      detail.authScope.checkpointId !== detail.view.id || tutorOwnerDeleted(detail.authScope.ownerId)))
    return <RouteMessage slug={slug} message="Reopen this checkpoint with its signed-in account." retry={() => void checkpoint.refetch()}/>;
  const page: TutorPageContext = {project, detail, activeExam:exam.data?.sittings.find(item=>item.status==='active'), client: settings.data?.preferredChat ?? 'claude'};
  if (live && !isFlagOn('tutorThreads')) return <HandoffOnly page={page}/>;
  return <CheckpointTutor initialQuestion={params.get('question')?.trim().slice(0,2000)} page={page} connectorUrl={live ? settings.data?.connectorUrl : undefined}
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
      <a className="v7-button v7-primary" href={chatLink(page.client, [prompt, draft].filter(Boolean).join('\n\n'))}
        target="_blank" rel="noopener noreferrer">Open {page.client === 'claude' ? 'Claude' : 'ChatGPT'}</a>
    </div>
  </TutorLayout>;
}
