import {CheckpointReadiness} from '../../adaptive/panels/LearningDetails';
import {LemmaError} from '../../../data/api';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {Dock} from '../../../ui/v7/Dock';
import {useStudyUi} from '../../../data/StudyUiRelease';
import {getApi} from '../../../data';
import {useQuery} from '@tanstack/react-query';
import {reviewHref} from '../../../data/review-target';
import {currentStudyStep} from '../../project/v7/pathModel';
import {useAtlasModel} from '../../../data/adaptive/atlas-api';
import {PlanDisposition,DeferredStep,checkpointLabel,stepDisposition} from '../../adaptive/Views';
import {useMemo,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router';
import {CalendarClock,Check,ChevronRight,CircleCheck,Copy,MoreHorizontal,BookOpen} from 'lucide-react';
import {ActionSheet} from '../../../ui/v7/ActionSheet';
import {useCheckpoint,useProject,useSettings} from '../../../data/hooks';
import type {CheckpointView} from '../../../data/types';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Margin} from '../../../app/v7/Margin';
import {Button,IconButton,Skeleton} from '../../../ui/v7/components';
import {useOnline} from '../../../ui/v7/savedCopy';
import {MetaChip,StatusBadge} from '../../../ui/v7/Status';
import {isFlagOn} from '../../../flags';
import {ProofEnd} from '../../../ui/v7/ProofEnd';
import {subjectClass} from '../../../ui/v7/Subject';
import {MathText} from '../../../ui/MathText';
import {FastTex as Tex} from '../../../ui/FastTex';
import {chatLink,studyPrompt} from '../../../lib/chat';
import {ownerZone} from '../../../lib/format';
import {tutorHref} from '../../tutor/tutorHref';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {nodeStateOf,nodeWord} from '../../project/v7/pathModel';
import {EvidenceEntry,groupEvidence} from '../../project/v7/Evidence';
import '../../project/v7/learning.css';

const stateTone=(ui:CheckpointView['ui'])=>ui==='done'?'success':ui==='revisit'?'warning':'info';
const stateText=(ui:CheckpointView['ui'])=>ui==='revisit'?'Recheck due':nodeWord[nodeStateOf(ui)];

/** PLAN §6.9 Checkpoint: the statement, the steps as a stepper, prerequisites and sources, evidence by session, and the
 *  primary "Work on this with your tutor" in a sticky bar with Demonstrate and Defer behind ⋯. */
export default function CheckpointV7(){
 const atlas=useAtlasModel();
 const studyRepair=useStudyUi();
 const {slug:rawSlug,code:rawCode}=useParams(),slug=rawSlug??'',code=rawCode??'';
 const query=useCheckpoint(slug,code),project=useProject(slug),settings=useSettings(),notify=useToast();
 const [more,setMore]=useState(false),navigate=useNavigate();
 const zone=ownerZone(settings.data),client=settings.data?.preferredChat??'claude';
 const online=useOnline(),detail=query.data,view=detail?.view;
 const evidence=useMemo(()=>detail?groupEvidence(detail.events,detail.sessions,zone):[],[detail,zone]);
 const title=project.data?.project.title??slug,subject=kitSubject(project.data?.subject.name??''),klass=subjectClass(subject);
 const back='/p/'+encodeURIComponent(slug);
 function launch(request?:string){
  if(!view)return;
  const prompt=studyPrompt(title,view.code,view.title)+(request?'\n\n'+request:'');
  void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'})).catch(()=>notify('Prompt copy unavailable; opening your tutor'));
  window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
 }
 const due=useQuery({queryKey:['checkpoint-review-count',view?.id],enabled:studyRepair&&!!view,
  queryFn:async()=>await getApi().getStudyTargetDue?.({kind:'checkpoint',id:view!.id})??0});
 const unavailable=query.error instanceof LemmaError&&['not_found','auth'].includes(query.error.code);
 if(!detail||!view||unavailable)return <main id="main-content" className="v7-page v7-learn" aria-label="Checkpoint"><DetailHeader title="Checkpoint" back={back}/>
  {!online?<EmptyMoment title="Connect to open this checkpoint." action={{label:'Back to the path',to:back}}/>
   :query.isPending?<><Skeleton/><Skeleton/></>
   :query.error instanceof LemmaError&&query.error.code==='not_found'?<EmptyMoment title="This checkpoint doesn't exist." action={{label:'Back to the path',to:back}}/>
   :<div role="alert" className="v7-learn-empty"><p>Could not open this checkpoint.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div>}</main>;
 const step=currentStudyStep(view).index;
 const lockedAfter=detail.prereqs.map(code=>project.data?.checkpoints.find(cp=>cp.code===code)).find(cp=>cp&&cp.ui!=='done'&&cp.ui!=='revisit');
 return <main id="main-content" className={'v7-page v7-learn '+klass} aria-label="Checkpoint">
  {/* V18: the collapsed header names the checkpoint, not its code ("CP4"). */}
  <DetailHeader title={view.title} back={back}/>
  {/* N157 · U1 S11 (flag v7Margin): sources and pages, prerequisites and the recheck, beside the page. */}
  <Margin notes={[
   ...(detail.sourceShort||detail.pages?[{title:'Sources',body:<p><Link to={back+'?tab=sources'}>{detail.sourceShort??'Source'}</Link>{detail.pages?', p. '+detail.pages:''}</p>}]:[]),
   ...(detail.prereqs.length?[{title:'Before this',body:<ul>{detail.prereqs.map(code=><li key={code}><Link to={back+'/cp/'+encodeURIComponent(code)}>{project.data?.checkpoints.find(item=>item.code===code)?.title??code}</Link></li>)}</ul>}]:[]),
   ...(detail.sessions.length?[{title:'Sessions',body:<ul>{[...detail.sessions].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,3).map(session=>
    <li key={session.id}><Link to={'/s/'+encodeURIComponent(slug)+'/'+session.number}>{'Session '+session.number}</Link></li>)}</ul>}]:[]),
  ]}/>
  <header className="v7-learn-head">
   <p className="v7-eyebrow">{'Checkpoint '+view.code.replace(/^\D+/,'')+' · '+title}</p>
   <h1 className="v7-learn-title"><Tex source={view.title}/></h1>
   <div className="v7-learn-chips"><StatusBadge tone={stateTone(view.ui)}>{isFlagOn('v7Qed')&&view.ui==='done'&&<ProofEnd/>}{checkpointLabel(view,settings.data?.flags,stateText(view.ui))}</StatusBadge>{view.stage&&<span className="v7-learn-chip">{view.stage}</span>}</div>
  </header>
  <PlanDisposition view={view}/>
  <section className="v7-statement" aria-label="Statement">
   <p className="v7-eyebrow">Goal</p>
   <div className="v7-statement-text"><MathText source={detail.objective}/></div>
   {detail.criterion&&<p className="v7-statement-criterion"><strong>What counts</strong> · <Tex source={detail.criterion}/></p>}
  </section>
  {detail.steps.length>0&&<section aria-label="Steps"><h2 className="v7-learn-h2">Steps</h2>
   <ol className="v7-steps">{detail.steps.map((text,index)=>{
    const deferred=stepDisposition(view,index,settings.data?.flags);
    const state=deferred??(index<step?'done':index===step&&view.ui!=='done'?'current':'later');
    return <li key={index} data-adaptive-state={deferred} data-state={state} aria-current={state==='current'?'step':undefined}>
     <span className="v7-steps-mark" aria-hidden="true">{state==='done'?<Check/>:index+1}</span>
     <span className="v7-steps-text"><Tex source={text}/><DeferredStep view={view} index={index}/></span>
     {state==='current'&&<MetaChip kind="next">Next</MetaChip>}
     <span className="v7-sr-only">{state==='deferred'?'Deferred':state==='done'?'Done':state==='current'?'Current step':'Later'}</span>
    </li>;})}</ol></section>}
  {(detail.prereqs.length>0||detail.sourceShort||detail.pages)&&<section aria-label="Prerequisites and sources"><h2 className="v7-learn-h2">Prerequisites</h2>
   {/* N223 (Owner: "looks weird"): one full-width row each, the title wrapping in its own column and the state at the
       end, instead of chips that ran off the screen with a long title. */}
   <ul className="v7-prereqs">
    {detail.prereqs.map(code=>{const cp=project.data?.checkpoints.find(item=>item.code===code);
     return <li key={code}><Link className="v7-prereq" to={back+'/cp/'+encodeURIComponent(code)}>
      <span className="v7-prereq-title">{cp?.title??code}</span>
      {cp&&<span className="v7-prereq-state">{nodeWord[nodeStateOf(cp.ui)]}</span>}<ChevronRight aria-hidden="true"/></Link></li>;})}
    {(detail.sourceShort||detail.pages)&&<li><Link className="v7-prereq" to={back+'?tab=sources'}><BookOpen aria-hidden="true"/>
     <span className="v7-prereq-title">{detail.sourceShort??'Source'}</span>
     {detail.pages&&<span className="v7-prereq-state">p. {detail.pages}</span>}<ChevronRight aria-hidden="true"/></Link></li>}
   </ul></section>}
  {!settings.data?.flags?.recheck_v2&&detail.recheckPrompt&&<section className="v7-learn-card" aria-label="Recheck"><p className="v7-eyebrow">{view.ui==='revisit'?'Recheck due':'Next recheck'}</p><MathText source={detail.recheckPrompt}/></section>}
  {view.ui!=='locked'&&atlas.data&&<p className="v7-learn-empty">Recheck: {view.ui==='revisit'?'due':view.ui==='done'?'not due yet':'not ready yet'}</p>}
  <CheckpointReadiness checkpointId={view.id}/>
  <section aria-label="Evidence"><h2 className="v7-learn-h2">Evidence</h2>
   {evidence.length?<ol className="v7-evidence">{evidence.map(group=><li key={group.key} className="v7-evidence-group">
    <h3 className="v7-evidence-label">{group.label}</h3><ol>{group.events.slice(0,12).map(event=><EvidenceEntry key={event.id} event={event}/>)}</ol></li>)}</ol>
   :<p className="v7-learn-empty">No evidence yet.</p>}
  </section>
  <Link className="v7-learn-row" to={studyRepair?reviewHref({kind:'checkpoint',id:view.id}):'/review?path='+encodeURIComponent(slug)}><span>{studyRepair?(due.isSuccess?due.data+' due · Review '+view.title:'Review '+view.title):detail.cardsCount+' '+(detail.cardsCount===1?'card':'cards')+' · Review'}</span><ChevronRight aria-hidden="true"/></Link>
  <Dock className="v7-learn-bar" role="group" aria-label="Checkpoint actions">
   {view.ui==='proposed'?<Link className="v7-button v7-primary" to="/proposals?tab=plan"><span>Review this proposal</span></Link>
    :view.ui==='locked'?<p>{lockedAfter?'Unlocks after '+lockedAfter.title:'Complete the preceding checkpoint'}</p>
    :<Button variant="primary" onClick={()=>navigate(tutorHref(slug,code))}>Continue with tutor</Button>}
   <IconButton label="More checkpoint actions" aria-haspopup="dialog" onClick={()=>setMore(true)}><MoreHorizontal aria-hidden="true"/></IconButton>
  </Dock>
  <ActionSheet open={more} onClose={()=>setMore(false)} title={view.title} label="Checkpoint actions" items={[
   ...(view.ui!=='done'&&view.ui!=='locked'?[{label:'Demonstrate',hint:'Show your proof; your tutor records it if it holds up.',icon:<CircleCheck aria-hidden="true"/>,onClick:()=>launch('Please assess my proof for checkpoint '+view.code+' and record a demonstration only when supported by evidence.')}]:[]),
   ...(view.ui!=='done'?[{label:'Defer',hint:'Move it later in your plan, with your approval.',icon:<CalendarClock aria-hidden="true"/>,onClick:()=>launch('Please help me defer checkpoint '+view.code+' and update the study plan only with my approval.')}]:[]),
   {label:'Copy study prompt',hint:'Paste it into a chat with your tutor',icon:<Copy aria-hidden="true"/>,onClick:()=>{void navigator.clipboard?.writeText(studyPrompt(title,view.code,view.title)).then(()=>notify('Tutor prompt copied',{tone:'success'})).catch(()=>notify('Copy was unavailable'));}},
  ]}/>
 </main>;
}
