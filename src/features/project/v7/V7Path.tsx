import {PathEstimateDetails} from '../../adaptive/panels/LearningDetails';
import {Dock} from '../../../ui/v7/Dock';
import {useStudyUi} from '../../../data/StudyUiRelease';
import {reviewHref} from '../../../data/review-target';
import {hoursEstimate,usePathEstimates} from '../../adaptive/panels/PathEstimates';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {LemmaError} from '../../../data/api';
import {ProjectScheduler,PlanDisposition,checkpointLabel,inactiveCheckpoint} from '../../adaptive/Views';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {ProofEnd} from '../../../ui/v7/ProofEnd';
import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router';
import {useQueryClient} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {Archive,ChevronDown,ChevronRight,Clock3,Copy,Pause,Play,Share2} from 'lucide-react';
import {MEANING_ICON} from '../../../ui/v7/meanings';
import {useCheckpoint,useHome,useProject,useSearchCards,useSettings} from '../../../data/hooks';
import {MathText} from '../../../ui/MathText';
import type {CheckpointView,SessionSummary} from '../../../data/types';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Margin} from '../../../app/v7/Margin';
import {Button,Chip,Segmented,Skeleton} from '../../../ui/v7/components';
import {useOnline} from '../../../ui/v7/savedCopy';
import {MoreActions} from '../../../ui/v7/ActionSheet';
import {MetaChip,StatusBadge} from '../../../ui/v7/Status';
import {Emblem} from '../../../ui/v7/Emblem';
import {subjectClass} from '../../../ui/v7/Subject';
import {planPrompt} from '../../../lib/chat';
import {tutorHref} from '../../tutor/tutorHref';
import {formatMinutes} from '../../../lib/text';
import {groupCheckpointStages} from '../../../ui/timeline/progress';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {currentStudyStep,dueTotal,isDemonstrated,lineEnd,nodeSize,nodeText,shortDate,stageLabel,type NodeState} from './pathModel';
import './path.css';
import {isFlagOn} from '../../../flags';
import {cardMode} from '../../../data/exam/contract';
import {getExamApi} from '../../../data/exam/queries';
import {usePathExam} from '../../exam/usePathExam';
import {ModeControl} from '../../exam/ModeControl';
import {PassedExamBanner} from '../../exam/PassedExamBanner';
import {ExamSetupSheet} from '../../exam/ExamSetupSheet';
import {LedgerTab} from '../../exam/LedgerTab';
import {actionTitle} from '../../exam/NextCard';
import {examTutorHref} from '../../exam/model';
import '../../exam/exam.css';

const SourcesPanel=lazy(()=>import('./SourcesV7'));
const ProjectSwitcher=lazy(()=>import('../ProjectSwitcher').then(module=>({default:module.ProjectSwitcher})));
const tabs=['Plan','Sessions','Sources','Cards','Exam'] as const;
type Tab=typeof tabs[number];
const star='M10 2.2l2.2 5 5.4.5-4.1 3.6 1.2 5.3L10 13.9l-4.7 2.7 1.2-5.3-4.1-3.6 5.4-.5z';

/** The five node marks, each readable by shape before colour. */
function NodeMark({state}:{state:NodeState}){
 const size=nodeSize[state];
 return <svg className="v7-path-node" data-state={state} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
  {state==='demonstrated'&&<path d={star} className="v7-path-demonstrated"/>}
  {state==='current'&&<><circle cx="10" cy="10" r="8" className="v7-path-halo"/><circle cx="10" cy="10" r="6.5" className="v7-path-ring"/><circle cx="10" cy="10" r="2.6" className="v7-path-core"/></>}
  {state==='proposed'&&<circle cx="10" cy="10" r="7" className="v7-path-dashed"/>}
  {state==='up_next'&&<circle cx="10" cy="10" r="6.5" className="v7-path-hollow"/>}
  {state==='locked'&&<circle cx="10" cy="10" r="4" className="v7-path-dim"/>}
 </svg>;
}
function Row({slug,cps,index,step,reached}:{slug:string;cps:CheckpointView[];index:number;step:string|null;reached:boolean}){
 const settings=useSettings();
 const cp=cps[index],text=nodeText(cps,index,step),current=text.state==='current'&&!inactiveCheckpoint(cp,settings.data?.flags);
 return <li className="v7-path-row" data-adaptive-state={inactiveCheckpoint(cp,settings.data?.flags)?cp.planState:undefined} data-checkpoint-code={cp.code} data-state={text.state} data-reached={reached?'true':'false'}>
  <NodeMark state={text.state}/>
  <Link className="v7-path-body" to={'/p/'+encodeURIComponent(slug)+'/cp/'+encodeURIComponent(cp.code)}>
   <strong>{cp.title}</strong>
   {text.state!=='up_next'&&text.state!=='proposed'&&<small>{checkpointLabel(cp,settings.data?.flags,text.detail.replace(/^Step (\d+) of (\d+):/,'$1/$2 ·'))}</small>}<PlanDisposition view={cp}/>
  </Link>
  {text.state==='proposed'&&<StatusBadge tone="info" to="/proposals?tab=plan">Review</StatusBadge>}
  {current&&cp.dueCards>0&&<span className="v7-meta-chip">{cp.dueCards} due</span>}
  <span className="v7-sr-only">{checkpointLabel(cp,settings.data?.flags,text.label)}</span>
 </li>;
}
function SessionRows({slug,sessions}:{slug:string;sessions:SessionSummary[]}){
 if(!sessions.length)return <EmptyMoment title="No sessions yet">Continue with your tutor to start an evidence trail.</EmptyMoment>;
 const sorted=[...sessions].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)||b.number-a.number).slice(0,40);
 return <ul className="v7-path-sessions" aria-label="Sessions">{sorted.map(session=><li key={session.id}>
  <Link to={'/s/'+encodeURIComponent(slug)+'/'+session.number}>
   <span><strong>{'Session '+session.number+' · '+(session.minutes===null?session.display:formatMinutes(session.minutes))+' · '+(session.client==='chatgpt'?'ChatGPT':session.client==='claude'?'Claude':'Other')}</strong>
    <small>{shortDate(session.startedAt)}</small></span>
   <em>{session.goal}</em>
   {session.goalMet==='yes'?<Chip kind="status">Goal met</Chip>:<Chip>{session.goalMet==='partial'?'Partly met':session.display==='ended'?'Ended':'Open'}</Chip>}
  </Link>
 </li>)}</ul>;
}
/** N220 (Owner report): the goal is one line under the title that opens in place, instead of a preview line and then the
 *  same text again beneath it. */
function GoalLine({goal}:{goal:string}){
 const [open,setOpen]=useState(false);
 return <button type="button" className="v7-path-goal-line" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
  <span className="v7-path-goal" data-open={open||undefined}>{goal}</span><ChevronDown aria-hidden="true"/>
 </button>;
}
/** The path's own cards, first twelve by number; the library has the rest. */
function PathCards({slug}:{slug:string}){
 const cards=useSearchCards('',slug),project=useProject(slug);
 // V18: a card names its checkpoint by title, never its code.
 const cpTitle=(code:string)=>project.data?.checkpoints.find(cp=>cp.code===code)?.title;
 if(cards.isPending)return <Skeleton/>;
 if(cards.error)return <p className="v7-path-cards-empty" role="alert">Erratum: cards didn’t load. Try again.</p>;
 const rows=cards.data??[];
 if(!rows.length)return <p className="v7-path-cards-empty">No cards on this path yet.</p>;
 return <ul className="v7-path-cardlist" aria-label="Cards on this path">{rows.slice(0,12).map(card=><li key={card.noteNo}>
  <Link to={'/cards/'+card.noteNo}><span className="v7-path-card-front"><MathText source={card.front}/></span>
   <small>{card.checkpointCode&&cpTitle(card.checkpointCode)?cpTitle(card.checkpointCode)+' · ':''}{card.due?'due '+shortDate(card.due):'new'}</small></Link></li>)}
  {rows.length>12&&<li className="v7-path-cards-empty">{rows.length-12} more in the card library.</li>}</ul>;
}
/** PLAN §6.9: the path as a constellation, with the primary action in a sticky bar. */
/** A 20 px progress ring for the collapsed Path bar. */
function ProgressRing({done,total}:{done:number;total:number}){
 const r=8,c=2*Math.PI*r,share=total?Math.min(1,done/total):0;
 return <svg className="v7-progress-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="v7-progress-ring-track"/>
  <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c*(1-share)} transform="rotate(-90 10 10)" className="v7-progress-ring-fill"/></svg>;
}
export default function V7Path({selectedSlug}:{selectedSlug?:string}={}){
 const studyRepair=useStudyUi();
 const room=isFlagOn('v7Room');
 const {slug:raw}=useParams(),slug=selectedSlug??raw??'',query=useProject(slug),home=useHome(),settings=useSettings(),notify=useToast();
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),queryClient=useQueryClient();
 const [switcher,setSwitcher]=useState(false),[setup,setSetup]=useState(false),[modeBusy,setModeBusy]=useState(false);
 const examEnabled=isFlagOn('examMode'),exam=usePathExam(query.data?.project.id??'',slug,params.get('examSitting'),examEnabled);
 const sitting=exam.sitting,hasExam=examEnabled&&!!sitting;
 const requested=params.get('tab');
 const tab:Tab=tabs.find(item=>item.toLowerCase()===requested&&(item!=='Exam'||examEnabled&&(hasExam||exam.loading||!!exam.loadError)))??'Plan';
 const online=useOnline(),data=query.data,cps=useMemo(()=>data?.checkpoints??[],[data]);
 const estimates=usePathEstimates(cps);
 const currentIndex=cps.findIndex(cp=>cp.ui==='now'),current=currentIndex>=0?cps[currentIndex]:null;
 const detail=useCheckpoint(slug,current?.code??'');
 const step=current?(detail.data?.steps??[])[currentStudyStep(current).index]??null:null;
 useEffect(()=>{
  if(!room||!data||tab!=='Plan'||!current||window.innerWidth<700)return;
  const frame=requestAnimationFrame(()=>{
   const row=document.querySelector<HTMLElement>('.v7-path-row[data-state="current"]'),box=row?.getBoundingClientRect();
   // Keep the current checkpoint in view without scrolling when it already fits.
   if(row&&box&&(box.top<56||box.bottom>innerHeight-92))row.scrollIntoView({block:'nearest',behavior:'instant'});
  });
  return()=>cancelAnimationFrame(frame);
 },[room,!!data,slug,tab,current?.id]);
 const unavailable=query.error instanceof LemmaError&&['not_found','auth'].includes(query.error.code);
 if(!data||unavailable)return <main id="main-content" className="v7-page v7-path" aria-label="Path"><DetailHeader title="Path" back="/projects"/>
  {!online?<EmptyMoment title="Connect to open this path." action={{label:'Back to Paths',to:'/projects'}}/>
   :query.isPending?<><Skeleton/><Skeleton/></>
   :query.error instanceof LemmaError&&query.error.code==='not_found'?<EmptyMoment title="This path doesn't exist." action={{label:'Back to Paths',to:'/projects'}}/>
   :<div role="alert" className="v7-path-empty"><p>Could not open this path.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div>}</main>;
 const project=data.project,subject=kitSubject(data.subject.name),klass=subjectClass(subject);
 const stages=groupCheckpointStages(cps),end=lineEnd(cps);
 const due=dueTotal(cps),cards=home.data?.projects.find(item=>item.id===project.id)?.cardsCount??0;
 const target=project.targetDate?shortDate(project.targetDate):'';
 async function setStatus(status:'active'|'paused'|'archived',message:string){
  const prior=project.status,apply=async(value:typeof status|typeof prior)=>{
   await getApi().updateProject(project.id,{status:value as 'active'|'paused'|'archived'});
   await Promise.all([query.refetch(),queryClient.invalidateQueries({queryKey:['home']}),queryClient.invalidateQueries({queryKey:['projects']})]);
  };
  try{
   await apply(status);
   notify(message,{tone:'success',action:{label:'Undo',onClick:()=>{void apply(prior).catch(()=>notify('Could not undo',{tone:'danger'}));}}});
   if(status==='archived')navigate('/projects');
  }catch{notify('Could not update this path',{tone:'danger'});}
 }
 /** N131 · A5′ "Share the page": a completed path as a 1200 × 630 notebook-page image (the drawing module loads only now). */
 async function sharePath(){
  try{
   const {shareCard}=await import('../../../ui/v7/shareImage');
   const outcome=await shareCard({kind:'path',title:project.title,subject:subject==='Other'?data!.subject.name:subject,done:data!.done,total:data!.total,date:shortDate(new Date().toISOString())});
   if(outcome==='saved')notify('Image saved',{tone:'success'});
  }catch{notify('Could not make the image',{tone:'danger'});}
 }
 function setTab(label:string,sittingId?:string){
  const next=new URLSearchParams(params),value=label.split(' ')[0].toLowerCase();
  if(value==='plan')next.delete('tab');else next.set('tab',value);
  if(sittingId)next.set('examSitting',sittingId);
  setParams(next);
 }
 async function changeMode(active:boolean){
  try{
   setModeBusy(true);
   await exam.change({operation:active?'activate':'pause'});
   setTab(active?'Exam':'Plan');
  }catch(error){notify(error instanceof Error?error.message:'Could not switch study mode.',{tone:'danger'});}
  finally{setModeBusy(false);}
 }
 const visibleTabs=tabs.filter(item=>item!=='Exam'||hasExam||tab==='Exam');
 const counts:Record<Tab,string>={Plan:'Plan',Sessions:'Sessions',Sources:'Sources',Cards:'Cards',Exam:'Exam'};
 const label=counts[tab];
 return <main id="main-content" className={'v7-page v7-path '+klass} aria-label="Path">
  <DetailHeader title={project.title} back="/projects" compact={<><Emblem subject={subject} seed={project.id} size={24} tier="glyph" animate={false}/><ProgressRing done={data.done} total={data.total}/></>}
   extraAction={<MoreActions label="More path actions" title={project.title} items={[
   {label:'Switch path',hint:'Open another path in the same place',icon:<MEANING_ICON.switchPath aria-hidden="true"/>,onClick:()=>setSwitcher(true)},
   ...(examEnabled&&online&&!exam.pendingSetup?[{label:'Prepare for an exam…',icon:<Clock3 aria-hidden="true"/>,onClick:()=>setSetup(true)}]:[]),
   {label:'View in Atlas',icon:<MEANING_ICON.concepts aria-hidden="true"/>,onClick:()=>{window.location.assign('#/atlas');}},
   ...(data.total>0&&data.done>=data.total?[{label:'Share this path',hint:'An image of the completed path',icon:<Share2 aria-hidden="true"/>,onClick:()=>{void sharePath();}}]:[]),
   project.status==='paused'
    ?{label:'Resume path',hint:'Bring it back into Today and reviews',icon:<Play aria-hidden="true"/>,onClick:()=>{void setStatus('active','Path resumed');}}
    :{label:'Pause path',hint:'Hide it from Today until you resume',icon:<Pause aria-hidden="true"/>,onClick:()=>{void setStatus('paused','Path paused');}},
   {label:'Archive path',hint:'You can restore it from Paths',destructive:true,icon:<Archive aria-hidden="true"/>,onClick:()=>{void setStatus('archived','Path archived');}},
  ]}/>}/>
  {/* N157 · U1 S11 (flag v7Margin): the path's sources and its last sessions, beside the page. */}
  <Margin notes={[
   ...(data.sources.length?[{title:'Sources',body:<ul>{data.sources.slice(0,6).map(source=><li key={source.id}>{source.short||source.title}{source.pageCount?' · '+source.pageCount+' pages':''}</li>)}</ul>}]:[]),
   ...(data.sessions.length?[{title:'Last sessions',body:<ul>{[...data.sessions].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,3).map(session=>
    <li key={session.id}><Link to={'/s/'+encodeURIComponent(slug)+'/'+session.number}>{'Session '+session.number}</Link> · {shortDate(session.startedAt)}</li>)}</ul>}]:[]),
  ]}/>
  <header className="v7-path-head">
   <span className="v7-path-emblem" aria-hidden="true"><Emblem subject={subject} seed={project.id} size={40} tier="tile" animate={false}/></span>
   <h1 className="v7-hub-title">{project.title}</h1>
   {project.goal?.trim()&&<GoalLine goal={project.goal.trim()}/>}
   <div className="v7-path-meter"><span role="meter" aria-label={project.title+' progress'} aria-valuemin={0} aria-valuemax={Math.max(1,data.total)} aria-valuenow={data.done}
    aria-valuetext={data.done+' of '+data.total}><span style={{width:(data.total?Math.min(100,data.done/data.total*100):0)+'%'}}/></span><strong aria-hidden="true">{data.done}/{data.total}</strong></div>
   {(target||!!estimates.total||project.status==='paused')&&<div className="v7-path-chips">{target&&<span title="Target date"><MEANING_ICON.targetDate size={14} aria-label="Target date"/> {target}</span>}
    {!!estimates.total&&<span title={'About '+hoursEstimate(estimates.total)+' left'}><Clock3 size={14} aria-hidden="true"/>~{hoursEstimate(estimates.total).replace(' ','')} left</span>}
    {!!estimates.total&&!estimates.hasCapacity&&<Link className="v7-path-chip-action" to="/settings?section=planning&capacity=1">Set time<ChevronRight size={14} aria-hidden="true"/></Link>}{project.status==='paused'&&<StatusBadge tone="warning">Paused</StatusBadge>}</div>}
   {isFlagOn('v7Qed')&&(project.status==='done'||data.total>0&&data.done>=data.total)&&<p className="v7-subhead"><ProofEnd/> Q.E.D.</p>}
  </header>
  {params.get('new')==='1'&&cps.length>0&&<section className="v7-path-tell" aria-label="Tell your tutor">
   <p className="v7-eyebrow">Plan with your tutor</p>
   <Button variant="primary" onClick={()=>{void navigator.clipboard?.writeText(planPrompt(project.title)).then(()=>notify('Prompt copied',{tone:'success'})).catch(()=>notify('Copy was unavailable'));}}><Copy aria-hidden="true"/>Copy prompt</Button>
  </section>}
  {examEnabled&&(exam.pendingSetup||exam.pendingCalendar)&&<section className="v7-exam-panel" aria-label="Exam calendar update pending">
   <p>{exam.pendingSetup?'Finish linking your exam to Calendar.':'Update Calendar with the new exam date.'}</p>
   <div className="v7-exam-actions"><Button disabled={!online||modeBusy||setup} onClick={()=>{void (async()=>{
    try{
     setModeBusy(true);
     if(exam.pendingSetup){
      const id=await getExamApi().resumeSetup(project.id);
      setTab('Exam',id);
     }else if(exam.pendingCalendar)await getExamApi().resumeCalendar(project.id,exam.pendingCalendar);
    }catch(error){notify(error instanceof Error?error.message:'Could not update Calendar.',{tone:'danger'});}
    finally{await exam.refresh();setModeBusy(false);}
   })();}}>{exam.pendingSetup?'Retry setup':'Retry Calendar update'}</Button></div>
  </section>}
  {sitting&&<>
   {exam.sittings.length>1&&<label className="v7-exam-picker v7-field-group">Exam sitting
    <select className="v7-field" value={sitting.id} onChange={event=>setTab(tab,event.target.value)}>
     {exam.sittings.map(item=><option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}
    </select>
   </label>}
   {!online&&<p role="status" className="v7-path-note">Reconnect to change exam prep.</p>}
   <ModeControl sitting={sitting} now={exam.now} disabled={!online||modeBusy}
    studyNext={current?current.code+' step '+(currentStudyStep(current).index+1)+' · '+(step??current.title):'Open your study plan'}
    examNext={exam.plan&&actionTitle(exam.plan.next,exam.plan)} onChange={value=>{void changeMode(value);}}/>
   <PassedExamBanner key={sitting.id+':'+sitting.starts_at} sitting={sitting} owner={exam.owner??''} now={exam.now} disabled={!online||modeBusy} onChange={exam.change}/>
  </>}
  <div className="v7-path-tabs"><Segmented label="Path sections" tabs panelId="v7-path-panel" options={visibleTabs.map(item=>counts[item])} value={label} onChange={setTab}/></div>
  <section id="v7-path-panel" role="tabpanel" aria-label={tab} className="v7-path-panel">
   {tab==='Plan'&&(cps.length?<ol className="v7-path-map" aria-label="Checkpoints" data-line-end={end}>
    {stages.map(stage=>{
     const active=stage.checkpoints.some(cp=>cp.id===current?.id),minutes=estimates.minutes(stage.checkpoints);
     const title=stageLabel(stage.name,stage.checkpoints).replace(/(\d+) of (\d+)$/,'$1/$2')+(minutes>0?' · ~'+hoursEstimate(minutes).replace(' ',''):'');
     const rows=<ol>{stage.checkpoints.map((cp,offset)=>{
      const index=stage.start+offset;
      return <Row key={cp.id} slug={slug} cps={cps} index={index} step={index===currentIndex?step:null} reached={index<=end}/>;
     })}</ol>;
     return <li key={stage.key} className="v7-path-stage">
      {active?<><h2 className="v7-eyebrow">{title}</h2>{rows}</>:<Disclosure label={title}>{rows}</Disclosure>}
     </li>;
    })}
   </ol>:<EmptyMoment title="No plan yet." action={{label:'Plan with your tutor',to:tutorHref(slug)}}/>)}
   {tab==='Plan'&&<PathEstimateDetails projectId={project.id}/>}
   {tab==='Plan'&&(settings.data?.flags?.recheck_v2||settings.data?.flags?.time_block)&&<Disclosure label={settings.data?.flags?.recheck_v2?'Rechecks':'Study schedule'}><ProjectScheduler projectId={project.id}/></Disclosure>}
   {tab==='Sessions'&&<SessionRows slug={slug} sessions={data.sessions}/>}
   {tab==='Sources'&&<Suspense fallback={<Skeleton/>}><SourcesPanel sources={data.sources} projectId={project.id} focusSourceId={studyRepair?params.get('source'):null}/></Suspense>}
   {tab==='Cards'&&<ul className="v7-path-cards" aria-label="Cards by checkpoint">
    <li className="v7-path-cards-total"><strong>{cards} {cards===1?'card':'cards'}</strong><Link className="v7-button v7-secondary v7-small" to="/cards"><span>Browse cards</span></Link></li>
    {cps.filter(cp=>cp.dueCards>0).map(cp=><li key={cp.id}><Link to={'/p/'+encodeURIComponent(slug)+'/cp/'+encodeURIComponent(cp.code)}><span>{cp.title}</span><small>{cp.dueCards} due</small></Link></li>)}
    {due===0&&<li className="v7-path-cards-empty">Nothing due on this path.</li>}
   </ul>}
   {tab==='Cards'&&<PathCards slug={slug}/>}
   {tab==='Exam'&&(sitting&&exam.plan?<LedgerTab key={sitting.id} sitting={sitting} project={data} plan={exam.plan}
    now={exam.now} disabled={!online||modeBusy} onChange={exam.change}/>
    :!online?<p className="v7-path-note">Connect to load this exam ledger.</p>
    :exam.loadError?<p role="alert">Could not load the exam ledger.</p>:<Skeleton/>)}
  </section>
  {/* R2 · F11: one floating layer above the tab bar — the Continue pill; Review lives in the header actions. */}
  {setup&&<ExamSetupSheet key={project.id} data={data} zone={settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone}
   mode={cardMode(settings.data?.planning?.exam_card_mode)} disabled={!online} allowActivate={!exam.sittings.some(item=>item.status==='active')} onClose={()=>setSetup(false)} onSave={async(input,draft)=>{
    let id:string;
    try{id=await getExamApi().setup(input);}
    finally{await exam.refresh();}
    if(draft)navigate(examTutorHref(data,id,'draft'));else setTab('Exam',id);
   }}/>}
  {cps.length>0&&tab!=='Exam'&&<Dock className="v7-path-bar" role="group" aria-label="Path actions">
   <Button variant="primary" onClick={()=>navigate(tutorHref(slug,current?.code))}>Continue with tutor</Button>
   {due>0&&<Link className="v7-button v7-secondary" to={studyRepair?reviewHref({kind:'path',id:project.id}):'/review?path='+encodeURIComponent(slug)}>Review {due}</Link>}
  </Dock>}
  {switcher&&<Suspense fallback={null}><ProjectSwitcher open onClose={()=>setSwitcher(false)} current={slug}/></Suspense>}
 </main>;
}
