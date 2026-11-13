import {useState} from 'react';
import {Link,useParams} from 'react-router';
import {ChevronRight,Copy} from 'lucide-react';
import {useProject,useResolveMisconception,useSession,useSettings} from '../../../data/hooks';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Button,Skeleton} from '../../../ui/v7/components';
import {StatusBadge} from '../../../ui/v7/Status';
import {subjectClass} from '../../../ui/v7/Subject';
import {MathText} from '../../../ui/MathText';
import {FastTex as Tex} from '../../../ui/FastTex';
import {chatLink,resumePrompt,studyPrompt} from '../../../lib/chat';
import {formatClock,formatShortDate,formatDuration,ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {EvidenceEntry} from '../../project/v7/Evidence';
import {sessionCardSummary} from '../counts';
import '../../project/v7/learning.css';

const clientName=(client:string)=>client==='claude'?'Claude':client==='chatgpt'?'ChatGPT':'Tutor';

/** PLAN §6.9 Session: goal as the title with its chips, a summary card, the timeline with times, and "Start another session". */
export default function SessionV7(){
 const {slug='',n=''}=useParams(),number=Number(n),query=useSession(slug,number),project=useProject(slug),settings=useSettings(),notify=useToast();
 const resolve=useResolveMisconception();
 const [shown,setShown]=useState(40),[cards,setCards]=useState(5);
 const zone=ownerZone(settings.data),session=query.data,summary=session?.summary;
 const title=project.data?.project.title??slug,klass=subjectClass(kitSubject(project.data?.subject.name??''));
 const back='/p/'+encodeURIComponent(slug)+'?tab=sessions';
 function launch(){
  if(!summary)return;
  const prompt=summary.display==='ended'?studyPrompt(title,summary.checkpointCode||undefined):resumePrompt(title);
  void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'})).catch(()=>notify('Prompt copy unavailable; opening your tutor'));
  window.open(chatLink(settings.data?.preferredChat??'claude',prompt),'_blank','noopener,noreferrer');
 }
 if(query.isPending)return <main id="main-content" className="v7-page v7-learn" aria-label="Session"><DetailHeader title="Session" back={back}/><Skeleton/><Skeleton/></main>;
 if(query.isError||!session||!summary)return <main id="main-content" className="v7-page v7-learn" aria-label="Session"><DetailHeader title="Session" back={back}/>
  <div role="alert" className="v7-learn-empty"><p>Session unavailable.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div></main>;
 const goal=summary.goalMet==='yes'?{tone:'success' as const,text:'Goal met'}:summary.goalMet==='partial'?{tone:'warning' as const,text:'Partly met'}:summary.goalMet==='no'?{tone:'danger' as const,text:'Not yet met'}
  :{tone:'info' as const,text:summary.display==='live'?'Live':summary.display==='paused'?'Paused':'Ended'};
 const events=[...session.events].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
 const open=session.misconceptions.filter(item=>!item.resolvedAt);
 const pending=session.pendingProposals.cards+session.pendingProposals.planChanges;
 return <main id="main-content" className={'v7-page v7-learn '+klass} aria-label="Session">
  <DetailHeader title={'Session '+summary.number} back={back}/>
  <header className="v7-learn-head">
   <p className="v7-eyebrow">{'Session '+summary.number+' · '+title}</p>
   <h1 className="v7-learn-title"><Tex source={summary.goal}/></h1>
   <div className="v7-learn-chips">
    <span className="v7-learn-chip">{summary.minutes===null?'In progress':formatDuration(summary.minutes)}</span>
    <span className="v7-learn-chip">{clientName(summary.client)}</span>
    <span className="v7-learn-chip">{formatShortDate(summary.startedAt,{zone})+', '+formatClock(summary.startedAt,{zone})}</span>
    <StatusBadge tone={goal.tone}>{goal.text}</StatusBadge>
   </div>
  </header>
  <section className="v7-learn-card" aria-label="Summary">
   <p className="v7-eyebrow">Summary</p>
   {session.summaryText?<MathText source={session.summaryText}/>:<p className="v7-meta">Your tutor has not written a summary yet.</p>}
   <p className="v7-meta">{[session.styleName&&'Style: '+session.styleName,session.pages&&'Pages '+session.pages,].filter(Boolean).join(' · ')}</p>
   {session.summaryText&&<Button small onClick={()=>{void navigator.clipboard?.writeText(session.summaryText??'').then(()=>notify('Summary copied',{tone:'success'})).catch(()=>notify('Copy was unavailable'));}}><Copy aria-hidden="true"/>Copy summary</Button>}
  </section>
  {open.length>0&&<section aria-label="Things to revisit"><h2 className="v7-learn-h2">Things to revisit</h2>
   <ul className="v7-learn-list">{open.map(item=><li key={item.id} className="v7-learn-card v7-learn-revisit">
    <StatusBadge tone="warning">{item.times+'×'}</StatusBadge><MathText source={item.label}/>
    <Button small disabled={resolve.isPending} onClick={()=>resolve.mutate(item.id,{onSuccess:()=>notify('Marked resolved',{tone:'success'}),onError:()=>notify('Could not save. Try again.',{tone:'danger'})})}>Mark resolved</Button>
   </li>)}</ul></section>}
  <section aria-label="Timeline"><h2 className="v7-learn-h2">Timeline</h2>
   {events.length?<ol className="v7-evidence v7-evidence-flat">{events.slice(0,shown).map(event=><EvidenceEntry key={event.id} event={event} time zone={zone}/>)}</ol>
    :<p className="v7-learn-empty">No reasoning was recorded in this session.</p>}
   {shown<events.length&&<Button onClick={()=>setShown(value=>value+40)}>Show {Math.min(40,events.length-shown)} more</Button>}
  </section>
  {session.cards.length>0&&<section aria-label="Cards from this session"><h2 className="v7-learn-h2">{sessionCardSummary(session.cards.length,session.cards.filter(card=>card.state==='pending').length)}</h2>
   <ul className="v7-learn-list">{session.cards.slice(0,cards).map((card,index)=><li key={card.noteNo+'-'+index}>
    <Link className="v7-learn-row" to={card.state==='pending'?'/proposals':'/cards/'+card.noteNo}><span className="v7-learn-front"><MathText source={card.front}/></span><small>{card.state==='pending'?'Waiting for approval':'In your cards'}</small><ChevronRight aria-hidden="true"/></Link></li>)}</ul>
   {cards<session.cards.length&&<Button onClick={()=>setCards(value=>value+20)}>Show {Math.min(20,session.cards.length-cards)} more cards</Button>}
  </section>}
  {pending>0&&<Link className="v7-learn-row" to="/proposals"><span>{pending} {pending===1?'proposal':'proposals'} waiting in your Inbox</span><ChevronRight aria-hidden="true"/></Link>}
  <div className="v7-learn-bar v7-learn-bar-single" role="group" aria-label="Session actions">
   <Button variant="primary" onClick={launch}>{summary.display==='ended'?'Start another session':'Resume session'}</Button>
  </div>
 </main>;
}
