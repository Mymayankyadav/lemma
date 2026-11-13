import {useMemo,useState} from 'react';
import {Link,useParams} from 'react-router';
import {CalendarClock,Check,ChevronRight,CircleCheck,Copy,MoreHorizontal,BookOpen} from 'lucide-react';
import {ActionSheet} from '../../../ui/v7/ActionSheet';
import {useCheckpoint,useProject,useSettings} from '../../../data/hooks';
import type {CheckpointView} from '../../../data/types';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Margin} from '../../../app/v7/Margin';
import {Button,IconButton,Sheet,Skeleton} from '../../../ui/v7/components';
import {MetaChip,StatusBadge} from '../../../ui/v7/Status';
import {isFlagOn} from '../../../flags';
import {ProofEnd} from '../../../ui/v7/ProofEnd';
import {subjectClass} from '../../../ui/v7/Subject';
import {MathText} from '../../../ui/MathText';
import {FastTex as Tex} from '../../../ui/FastTex';
import {chatLink,studyPrompt} from '../../../lib/chat';
import {ownerZone} from '../../../lib/format';
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
 const {slug:rawSlug,code:rawCode}=useParams(),slug=rawSlug??'',code=rawCode??'';
 const query=useCheckpoint(slug,code),project=useProject(slug),settings=useSettings(),notify=useToast();
 const [more,setMore]=useState(false);
 const zone=ownerZone(settings.data),client=settings.data?.preferredChat??'claude';
 const detail=query.data,view=detail?.view;
 const evidence=useMemo(()=>detail?groupEvidence(detail.events,detail.sessions,zone):[],[detail,zone]);
 const title=project.data?.project.title??slug,subject=kitSubject(project.data?.subject.name??''),klass=subjectClass(subject);
 const back='/p/'+encodeURIComponent(slug);
 function launch(request?:string){
  if(!view)return;
  const prompt=studyPrompt(title,view.code,view.title)+(request?'\n\n'+request:'');
  void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'})).catch(()=>notify('Prompt copy unavailable; opening your tutor'));
  window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
 }
 if(query.isPending)return <main id="main-content" className="v7-page v7-learn" aria-label="Checkpoint"><DetailHeader title="Checkpoint" back={back}/><Skeleton/><Skeleton/></main>;
 if(query.error||!detail||!view)return <main id="main-content" className="v7-page v7-learn" aria-label="Checkpoint"><DetailHeader title="Checkpoint" back={back}/>
  <div role="alert" className="v7-learn-empty"><p>Checkpoint unavailable. Check your connection or try again.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div></main>;
 const step=Math.max(0,view.currentStep);
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
   <div className="v7-learn-chips"><StatusBadge tone={stateTone(view.ui)}>{isFlagOn('v7Qed')&&view.ui==='done'&&<ProofEnd/>}{stateText(view.ui)}</StatusBadge>{view.stage&&<span className="v7-learn-chip">{view.stage}</span>}</div>
  </header>
  <section className="v7-statement" aria-label="Statement">
   <p className="v7-eyebrow">To demonstrate</p>
   <div className="v7-statement-text"><MathText source={detail.objective}/></div>
   {detail.criterion&&<details className="v7-statement-criterion"><summary>What counts</summary><MathText source={detail.criterion}/></details>}
  </section>
  {detail.steps.length>0&&<section aria-label="Steps"><h2 className="v7-learn-h2">Steps</h2>
   <ol className="v7-steps">{detail.steps.map((text,index)=>{
    const state=index<step?'done':index===step&&view.ui!=='done'?'current':'later';
    return <li key={index} data-state={state} aria-current={state==='current'?'step':undefined}>
     <span className="v7-steps-mark" aria-hidden="true">{state==='done'?<Check/>:index+1}</span>
     <span className="v7-steps-text"><Tex source={text}/></span>
     {state==='current'&&<MetaChip kind="next">Next</MetaChip>}
     <span className="v7-sr-only">{state==='done'?'Done':state==='current'?'Current step':'Later'}</span>
    </li>;})}</ol></section>}
  {(detail.prereqs.length>0||detail.sourceShort||detail.pages)&&<section aria-label="Prerequisites and sources"><h2 className="v7-learn-h2">Prerequisites and sources</h2>
   <div className="v7-learn-chiprow">
    {detail.prereqs.map(code=>{const cp=project.data?.checkpoints.find(item=>item.code===code);
     return <Link key={code} className="v7-learn-chip v7-learn-link" to={back+'/cp/'+encodeURIComponent(code)}>{cp?nodeWord[nodeStateOf(cp.ui)]+' · ':''}{cp?.title??code}</Link>;})}
    {(detail.sourceShort||detail.pages)&&<Link className="v7-learn-chip v7-learn-link" to={back+'?tab=sources'}><BookOpen aria-hidden="true"/>{detail.sourceShort??'Source'}{detail.pages?' · p. '+detail.pages:''}</Link>}
   </div></section>}
  {detail.recheckPrompt&&<section className="v7-learn-card" aria-label="Recheck"><p className="v7-eyebrow">{view.ui==='revisit'?'Recheck due':'Next recheck'}</p><MathText source={detail.recheckPrompt}/></section>}
  <section aria-label="Evidence"><h2 className="v7-learn-h2">Evidence</h2>
   {evidence.length?<ol className="v7-evidence">{evidence.map(group=><li key={group.key} className="v7-evidence-group">
    <h3 className="v7-evidence-label">{group.label}</h3><ol>{group.events.slice(0,12).map(event=><EvidenceEntry key={event.id} event={event}/>)}</ol></li>)}</ol>
   :<p className="v7-learn-empty">No evidence yet. Work on it with your tutor and the attempts appear here.</p>}
  </section>
  <Link className="v7-learn-row" to={'/review?path='+encodeURIComponent(slug)}><span>{detail.cardsCount} {detail.cardsCount===1?'card':'cards'} · Review</span><ChevronRight aria-hidden="true"/></Link>
  <div className="v7-learn-bar" role="group" aria-label="Checkpoint actions">
   {view.ui==='proposed'?<Link className="v7-button v7-primary" to="/proposals?tab=plan"><span>Review this proposal</span></Link>
    :<Button variant="primary" onClick={()=>launch()}>Work on this with your tutor</Button>}
   <IconButton label="More checkpoint actions" aria-haspopup="dialog" onClick={()=>setMore(true)}><MoreHorizontal aria-hidden="true"/></IconButton>
  </div>
  <ActionSheet open={more} onClose={()=>setMore(false)} title={view.title} label="Checkpoint actions" items={[
   ...(view.ui!=='done'&&view.ui!=='locked'?[{label:'Demonstrate',hint:'Show your proof; your tutor records it if it holds up.',icon:<CircleCheck aria-hidden="true"/>,onClick:()=>launch('Please assess my proof for checkpoint '+view.code+' and record a demonstration only when supported by evidence.')}]:[]),
   ...(view.ui!=='done'?[{label:'Defer',hint:'Move it later in your plan, with your approval.',icon:<CalendarClock aria-hidden="true"/>,onClick:()=>launch('Please help me defer checkpoint '+view.code+' and update the study plan only with my approval.')}]:[]),
   {label:'Copy study prompt',hint:'Paste it into a chat with your tutor',icon:<Copy aria-hidden="true"/>,onClick:()=>{void navigator.clipboard?.writeText(studyPrompt(title,view.code,view.title)).then(()=>notify('Tutor prompt copied',{tone:'success'})).catch(()=>notify('Copy was unavailable'));}},
  ]}/>
 </main>;
}
