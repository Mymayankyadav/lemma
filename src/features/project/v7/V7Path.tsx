import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {lazy,Suspense,useMemo,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router';
import {useQueryClient} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {Archive,Copy,Layers,Pause,Play,Share2,Waypoints} from 'lucide-react';
import {useCheckpoint,useHome,useProject,useSearchCards,useSettings} from '../../../data/hooks';
import {MathText} from '../../../ui/MathText';
import type {CheckpointView,SessionSummary} from '../../../data/types';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Button,Chip,Segmented,Sheet,Skeleton} from '../../../ui/v7/components';
import {MoreActions} from '../../../ui/v7/ActionSheet';
import {MetaChip,StatusBadge} from '../../../ui/v7/Status';
import {Emblem} from '../../../ui/v7/Emblem';
import {subjectClass} from '../../../ui/v7/Subject';
import {chatLink,planPrompt,studyPrompt} from '../../../lib/chat';
import {formatMinutes} from '../../../lib/text';
import {groupCheckpointStages} from '../../../ui/timeline/progress';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {dueTotal,lineEnd,nodeSize,nodeText,shortDate,stageLabel,type NodeState} from './pathModel';
import './path.css';

const SourcesPanel=lazy(()=>import('../SourcesPanel').then(module=>({default:module.SourcesPanel})));
const ProjectSwitcher=lazy(()=>import('../ProjectSwitcher').then(module=>({default:module.ProjectSwitcher})));
const tabs=['Map','Sessions','Sources','Cards'] as const;
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
 const cp=cps[index],text=nodeText(cps,index,step),current=text.state==='current';
 return <li className="v7-path-row" data-state={text.state} data-reached={reached?'true':'false'}>
  <NodeMark state={text.state}/>
  <Link className="v7-path-body" to={'/p/'+encodeURIComponent(slug)+'/cp/'+encodeURIComponent(cp.code)}>
   <strong>{cp.title}</strong>
   <small>{text.detail}</small>
  </Link>
  {text.state==='proposed'&&<StatusBadge tone="info" to="/proposals">Proposed</StatusBadge>}
  {current&&<Link className="v7-button v7-secondary v7-small" to={'/p/'+encodeURIComponent(slug)+'/cp/'+encodeURIComponent(cp.code)}><span>Continue</span></Link>}
  <span className="v7-sr-only">{text.label}</span>
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
/** The path's own cards, first twelve by number; the library has the rest. */
function PathCards({slug}:{slug:string}){
 const cards=useSearchCards('',slug);
 if(cards.isPending)return <Skeleton/>;
 if(cards.error)return <p className="v7-path-cards-empty" role="alert">Could not load cards.</p>;
 const rows=cards.data??[];
 if(!rows.length)return <p className="v7-path-cards-empty">No cards on this path yet.</p>;
 return <ul className="v7-path-cardlist" aria-label="Cards on this path">{rows.slice(0,12).map(card=><li key={card.noteNo}>
  <Link to={'/cards/'+card.noteNo}><span className="v7-path-card-front"><MathText source={card.front}/></span>
   <small>{card.checkpointCode?card.checkpointCode+' · ':''}{card.due?'due '+shortDate(card.due):'new'}</small></Link></li>)}
  {rows.length>12&&<li className="v7-path-cards-empty">{rows.length-12} more in the card library.</li>}</ul>;
}
/** PLAN §6.9: the path as a constellation, with the primary action in a sticky bar. */
/** A 20 px progress ring for the collapsed Path bar. */
function ProgressRing({done,total}:{done:number;total:number}){
 const r=8,c=2*Math.PI*r,share=total?Math.min(1,done/total):0;
 return <svg className="v7-progress-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="v7-progress-ring-track"/>
  <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c*(1-share)} transform="rotate(-90 10 10)" className="v7-progress-ring-fill"/></svg>;
}
export default function V7Path(){
 const {slug:raw}=useParams(),slug=raw??'',query=useProject(slug),home=useHome(),settings=useSettings(),notify=useToast();
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),queryClient=useQueryClient();
 const [prompt,setPrompt]=useState(false),[switcher,setSwitcher]=useState(false);
 const tab:Tab=params.get('tab')==='sessions'?'Sessions':params.get('tab')==='sources'?'Sources':params.get('tab')==='cards'?'Cards':'Map';
 const data=query.data,cps=useMemo(()=>data?.checkpoints??[],[data]);
 const currentIndex=cps.findIndex(cp=>cp.ui==='now'),current=currentIndex>=0?cps[currentIndex]:null;
 const detail=useCheckpoint(slug,current?.code??'');
 const step=current?(detail.data?.steps??[])[Math.max(0,current.currentStep-1)]??null:null;
 if(query.isPending)return <main id="main-content" className="v7-page v7-path" aria-label="Path"><DetailHeader title="Path" back="/projects"/><Skeleton/><Skeleton/></main>;
 if(query.error||!data)return <main id="main-content" className="v7-page v7-path" aria-label="Path"><DetailHeader title="Path" back="/projects"/>
  <div role="alert" className="v7-path-empty"><p>Path unavailable. Check your connection or try again.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div></main>;
 const project=data.project,subject=kitSubject(data.subject.name),klass=subjectClass(subject);
 const stages=groupCheckpointStages(cps),end=lineEnd(cps);
 const due=dueTotal(cps),cards=home.data?.projects.find(item=>item.id===project.id)?.cardsCount??0;
 const client=settings.data?.preferredChat??'claude',text=studyPrompt(project.title,current?.code,current?.title);
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
 function setTab(label:string){
  const next=new URLSearchParams(params),value=label.split(' ')[0].toLowerCase();
  if(value==='map')next.delete('tab');else next.set('tab',value);setParams(next);
 }
 function copy(){
  void navigator.clipboard?.writeText(text).then(()=>notify('Tutor prompt copied',{tone:'success'})).catch(()=>notify('Copy was unavailable'));
 }
 const counts:Record<Tab,string>={Map:'Map',Sessions:'Sessions '+data.sessions.length,Sources:'Sources '+data.sources.length,Cards:'Cards '+cards};
 const label=counts[tab];
 return <main id="main-content" className={'v7-page v7-path '+klass} aria-label="Path">
  <DetailHeader title={project.title} back="/projects" compact={<><Emblem subject={subject} seed={project.id} size={24} tier="glyph" animate={false}/><ProgressRing done={data.done} total={data.total}/></>}
   action={<><Link className="v7-header-pill" to={'/review?path='+encodeURIComponent(slug)} aria-label={due>0?'Review '+due+' cards on this path':'Review this path'}>{due>0?'Review '+due:'Review'}</Link><MoreActions label="More path actions" title={project.title} items={[
   {label:'Switch path',hint:'Open another path in the same place',icon:<Layers aria-hidden="true"/>,onClick:()=>setSwitcher(true)},
   {label:'View in Atlas',icon:<Waypoints aria-hidden="true"/>,onClick:()=>{window.location.assign('#/atlas');}},
   ...(data.total>0&&data.done>=data.total?[{label:'Share this path',hint:'An image of the completed path',icon:<Share2 aria-hidden="true"/>,onClick:()=>{void sharePath();}}]:[]),
   project.status==='paused'
    ?{label:'Resume path',hint:'Bring it back into Today and reviews',icon:<Play aria-hidden="true"/>,onClick:()=>{void setStatus('active','Path resumed');}}
    :{label:'Pause path',hint:'Hide it from Today until you resume',icon:<Pause aria-hidden="true"/>,onClick:()=>{void setStatus('paused','Path paused');}},
   {label:'Archive path',hint:'You can restore it from Paths',destructive:true,icon:<Archive aria-hidden="true"/>,onClick:()=>{void setStatus('archived','Path archived');}},
  ]}/></>}/>
  <header className="v7-path-head">
   <span className="v7-path-emblem" aria-hidden="true"><Emblem subject={subject} seed={project.id} size={164} animate={false}/></span>
   <h1 className="v7-hub-title">{project.title}</h1>
   <p className="v7-path-goal">{project.goal?.trim()||'Your tutor fills this in.'}</p>
   <div className="v7-path-meter"><span role="meter" aria-label={project.title+' progress'} aria-valuemin={0} aria-valuemax={Math.max(1,data.total)} aria-valuenow={data.done}
    aria-valuetext={data.done+' of '+data.total}><span style={{width:(data.total?Math.min(100,data.done/data.total*100):0)+'%'}}/></span><strong>{data.done} of {data.total}</strong></div>
   <div className="v7-path-chips">{target&&<MetaChip kind="target">{'Target '+target}</MetaChip>}{project.status==='paused'&&<StatusBadge tone="warning">Paused</StatusBadge>}</div>
  </header>
  {params.get('new')==='1'&&<section className="v7-path-tell" aria-label="Tell your tutor">
   <p className="v7-eyebrow">Tell your tutor</p>
   <p>Ask your tutor to read the sources and plan this path with you.</p>
   <Button variant="primary" onClick={()=>{void navigator.clipboard?.writeText(planPrompt(project.title)).then(()=>notify('Prompt copied',{tone:'success'})).catch(()=>notify('Copy was unavailable'));}}><Copy aria-hidden="true"/>Copy prompt</Button>
  </section>}
  <div className="v7-path-tabs"><Segmented label="Path sections" tabs panelId="v7-path-panel" options={tabs.map(item=>counts[item])} value={label} onChange={setTab}/></div>
  <section id="v7-path-panel" role="tabpanel" aria-label={tab} className="v7-path-panel">
   {tab==='Map'&&(cps.length?<ol className="v7-path-map" aria-label="Checkpoints" data-line-end={end}>
    {stages.map(stage=><li key={stage.key} className="v7-path-stage"><h2 className="v7-eyebrow">{stageLabel(stage.name,stage.checkpoints)}</h2>
     <ol>{stage.checkpoints.map((cp,offset)=>{const index=stage.start+offset;return <Row key={cp.id} slug={slug} cps={cps} index={index} step={index===currentIndex?step:null} reached={index<=end}/>;})}</ol></li>)}
   </ol>:<EmptyMoment title="A plan is waiting to be written">Ask your tutor to break your goal into checkpoints.</EmptyMoment>)}
   {tab==='Sessions'&&<SessionRows slug={slug} sessions={data.sessions}/>}
   {tab==='Sources'&&<Suspense fallback={<Skeleton/>}><SourcesPanel sources={data.sources} projectId={project.id}/></Suspense>}
   {tab==='Cards'&&<ul className="v7-path-cards" aria-label="Cards by checkpoint">
    <li className="v7-path-cards-total"><strong>{cards} {cards===1?'card':'cards'}</strong><Link className="v7-button v7-secondary v7-small" to="/cards"><span>Browse cards</span></Link></li>
    {cps.filter(cp=>cp.dueCards>0).map(cp=><li key={cp.id}><Link to={'/p/'+encodeURIComponent(slug)+'/cp/'+encodeURIComponent(cp.code)}><span>{cp.code} · {cp.title}</span><small>{cp.dueCards} due</small></Link></li>)}
    {due===0&&<li className="v7-path-cards-empty">Nothing due on this path.</li>}
   </ul>}
   {tab==='Cards'&&<PathCards slug={slug}/>}
  </section>
  {/* R2 · F11: one floating layer above the tab bar — the Continue pill; Review lives in the header actions. */}
  <div className="v7-path-bar" role="group" aria-label="Path actions">
   <Button variant="primary" onClick={()=>setPrompt(true)}>Continue with tutor</Button>
  </div>
  <Sheet open={prompt} onClose={()=>setPrompt(false)} title="Continue with your tutor" eyebrow="Study prompt"
   footer={<Button variant="primary" onClick={copy}><Copy aria-hidden="true"/>Copy prompt</Button>}>
   <p className="v7-path-prompt">{text}</p>
   <p className="v7-path-note">Paste it into your tutor.</p>
   <a className="v7-button v7-secondary" href={chatLink(client,text)} target="_blank" rel="noopener noreferrer"><span>Open {client==='chatgpt'?'ChatGPT':'Claude'}</span></a>
  </Sheet>
  {switcher&&<Suspense fallback={null}><ProjectSwitcher open onClose={()=>setSwitcher(false)} current={slug}/></Suspense>}
 </main>;
}
