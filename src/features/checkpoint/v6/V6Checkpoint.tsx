import {Check,Target} from 'lucide-react';
import {useV6HeaderTitle} from '../../../app/v6Title';
import { useParams, Link } from 'react-router';
import { useCheckpoint, useProject, useSettings } from '../../../data/hooks';
import type { CheckpointDetail, CheckpointUi, CheckpointView } from '../../../data/types';
import { chatLink, studyPrompt } from '../../../lib/chat';
import { FastTex as Tex } from '../../../ui/FastTex';
import { useToast } from '../../../ui/Toast';

const actionClass='flex min-h-11 items-center rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 py-2 text-label text-ink focus-visible:outline-2 focus-visible:outline-[var(--link)]';
const states: Record<CheckpointUi,string> = {
 done:'Demonstrated', revisit:'Recheck due', now:'In progress', next:'Up next', locked:'Locked', proposed:'Proposed',
};

/** Never infer successful prerequisites from their position in the plan. */
export function prerequisiteState(code:string, checkpoints:readonly CheckpointView[]):string {
 const prerequisite=checkpoints.find(checkpoint=>checkpoint.code===code);
 return prerequisite?states[prerequisite.ui]:'Status unavailable';
}

/** A checkpoint event does not identify a session; link only sessions that explicitly name this code. */
export function sessionsForCheckpoint(detail:CheckpointDetail):CheckpointDetail['sessions'] {
 return detail.sessions.filter(session=>session.checkpointCode===detail.view.code)
  .sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)||b.number-a.number);
}

function TutorAction({label,request,slug,code,title,client,notify}:{
 label:string;request:string;slug:string;code:string;title:string;
 client:'claude'|'chatgpt';notify:ReturnType<typeof useToast>;
}) {
 function launch(){
  const prompt=studyPrompt(title,code)+'\n\n'+request;
  void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'}))
   .catch(()=>notify('Prompt copy unavailable; opening tutor'));
  window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
 }
 return <button type="button" className={actionClass} onClick={launch} aria-label={label+' with tutor for '+slug+'/'+code}>
  {label}
 </button>;
}

export default function V6Checkpoint(){
 const {slug:rawSlug,code:rawCode}=useParams();
 const slug=rawSlug??'',code=rawCode??'';
 const checkpoint=useCheckpoint(slug,code),project=useProject(slug),settings=useSettings(),notify=useToast();
 const detail=checkpoint.data,view=detail?.view,projectDetail=project.data;
 const base='/p/'+encodeURIComponent(slug);
 useV6HeaderTitle(view?.title);
 if(checkpoint.isPending)return <section aria-label="Checkpoint loading" className="p-4">
  <p role="status" className="text-label text-ink-2">Loading checkpoint…</p>
 </section>;
 if(checkpoint.isError||!detail||!view)return <section aria-label="Checkpoint unavailable" className="flex flex-col gap-3 p-4">
  <h1 className="text-title-l font-semibold">Checkpoint unavailable</h1>
  <p role="alert" className="text-label text-ink-2">This checkpoint could not be loaded.</p>
  <button type="button" className={actionClass} onClick={()=>{void checkpoint.refetch();}}>Try again</button>
  <Link className={actionClass} to={base}>Back to path</Link>
 </section>;
 const sessions=sessionsForCheckpoint(detail);
 const client=settings.data?.preferredChat??'claude';
 const context=projectDetail?.project.title??slug;
 const actions=view.ui==='proposed'?
  <Link className={actionClass} to="/proposals?tab=plan">Review proposed checkpoint</Link>:
  <div className="flex flex-wrap gap-2">
   <TutorAction label="Study" request="Help me work through the current step and gather evidence." slug={slug} code={view.code} title={context} client={client} notify={notify}/>
   {view.ui==='done'?<TutorAction label="Reopen" request={'Please reopen checkpoint '+view.code+' in my Lemma plan only after confirming with me.'} slug={slug} code={view.code} title={context} client={client} notify={notify}/>:
    <TutorAction label="Demonstrate" request={'Please assess my proof for checkpoint '+view.code+' and record a demonstration only when supported by evidence.'} slug={slug} code={view.code} title={context} client={client} notify={notify}/>}
   {view.ui!=='done'&&<TutorAction label="Defer" request={'Please help me defer checkpoint '+view.code+' and update the study plan only with my approval.'} slug={slug} code={view.code} title={context} client={client} notify={notify}/>}
   {(view.ui==='revisit'||view.ui==='done')&&<TutorAction label="Recheck" request={'Please recheck my understanding of checkpoint '+view.code+' and record the outcome.'} slug={slug} code={view.code} title={context} client={client} notify={notify}/>}
  </div>;
 return <section data-v6-checkpoint-page className="flex min-w-0 flex-col gap-5 pb-8">
  {/* N114 (mockup `20__Page`): chips, italic statement, next step, evidence and step markers. */}
  <header className="flex flex-col gap-4">
   <h1 className="sr-only"><Tex source={view.title}/></h1>
   <div className="flex flex-wrap items-center gap-2">
    <span className="lemma-state-chip !ml-0" data-checkpoint-state="now">{view.code}</span>
    <span className="lemma-state-chip !ml-0" data-checkpoint-state={view.ui}>{states[view.ui]}</span>
    {view.stage&&<span className="lemma-state-chip !ml-0"><Tex source={view.stage}/></span>}
    <Link to={base} className="lemma-switch-chip ml-auto">Back to path</Link>
   </div>
   <p className="font-math text-[1.125rem] italic leading-relaxed text-ink-2"><Tex source={detail.objective}/></p>
  </header>
  <section className="notebook-next-step !my-0"><h3>Next step</h3>
   <p><Tex source={detail.steps[view.currentStep]||detail.objective}/></p></section>
  <section aria-label="Evidence criterion" className="flex flex-col gap-2 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-4">
   <h2 className="flex items-center gap-2 !text-[1.125rem] italic text-ink-2"><Target size={17} aria-hidden="true" className="text-[var(--accent)]"/>What counts as demonstrated</h2>
   <p className="text-body text-ink-2"><Tex source={detail.criterion}/></p>
  </section>
  <section aria-label="Checkpoint steps" className="flex flex-col gap-3">
   <h2 className="text-ink-2">Steps</h2>
   {detail.steps.length===0?<p className="text-label text-ink-2">No steps recorded.</p>:
    <ol className="flex flex-col gap-3">{detail.steps.map((step,index)=>{
     const done=index<view.currentStep,current=index===view.currentStep;
     return <li key={index} className="flex items-start gap-3">
      <span aria-hidden="true" className={'flex size-7 shrink-0 items-center justify-center rounded-full text-caption '+(done?'bg-[var(--accent)] text-[var(--on-accent)]':current?'border border-[var(--accent)] text-[var(--accent)]':'border border-[var(--edge)] text-ink-3')}>
       {done?<Check size={16}/>:current?<span className="size-2.5 rounded-full bg-current"/>:index+1}</span>
      <span className={'min-w-0 flex-1 pt-1 text-body '+(done?'text-ink-2':current?'font-semibold text-ink':'text-ink-3')}><Tex source={step}/></span>
      <span className="sr-only">{done?'Complete':current?'Current':'Upcoming'}</span>
     </li>;})}</ol>}
  </section>
  <section aria-label="Prerequisites" className="flex flex-col gap-2">
   <h2 className="text-title-s font-semibold">Prerequisites</h2>
   {detail.prereqs.length===0?<p className="text-label text-ink-2">No prerequisites listed.</p>:
    detail.prereqs.map(prereq=><Link key={prereq} to={base+'/cp/'+encodeURIComponent(prereq)}
     className={actionClass+' justify-between gap-3 text-left'}>
     <span>{prereq}</span><span className="text-caption text-ink-2">
      {prerequisiteState(prereq,projectDetail?.checkpoints??[])}</span>
    </Link>)}
   {!projectDetail&&detail.prereqs.length>0&&<p className="text-caption text-ink-2">Prerequisite status is unavailable while path data is loading.</p>}
  </section>
  <section aria-label="Source citations" className="flex flex-col gap-2">
   <h2 className="text-title-s font-semibold">Source and pages</h2>
   {detail.sourceShort||detail.pages?<p className="rounded-ctl border border-edge bg-fill-1 p-3 text-label">
    {detail.sourceShort??'Source not identified'}{detail.pages?' · p. '+detail.pages:''}</p>:
    <p className="text-label text-ink-2">No source citation recorded.</p>}
   {detail.concepts.length>0&&<nav aria-label="Related concepts" className="flex flex-wrap gap-2">
    {detail.concepts.map(concept=><Link key={concept.slug} className={actionClass}
     to={'/atlas?focus='+encodeURIComponent(concept.slug)}><Tex source={concept.name}/></Link>)}
   </nav>}
  </section>
  <section aria-label="Evidence and rechecks" className="flex flex-col gap-3">
   <h2 className="text-title-s font-semibold">Evidence and rechecks</h2>
   {detail.recheckPrompt&&<p className="rounded-ctl bg-amber-tint p-3 text-label text-ink">
    Recheck prompt: <Tex source={detail.recheckPrompt}/></p>}
   {view.recheckDue&&<p className="text-label text-ink-2">Recheck due: <time dateTime={view.recheckDue}>{view.recheckDue}</time></p>}
   {detail.events.length===0?<p className="text-label text-ink-2">No evidence recorded yet.</p>:
    <ol className="flex flex-col gap-2">{detail.events.slice(0,20).map(event=><li key={event.id}
     className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
     <p className="flex flex-wrap gap-2 text-caption text-ink-2">
      <strong>{event.kind.replaceAll('_',' ')}</strong>
      {event.outcome&&<span>{event.outcome}</span>}
      {event.hintLevel!==null&&<span>Hint {event.hintLevel}</span>}
      <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleDateString()}</time>
     </p><p className="mt-2 break-words text-body"><Tex source={event.body}/></p>
    </li>)}</ol>}
   {detail.events.length>20&&<p className="text-caption text-ink-2">Showing the 20 most recent evidence entries.</p>}
  </section>
  <section aria-label="Checkpoint tutor sessions" className="flex flex-col gap-2">
   <h2 className="text-title-s font-semibold">Tutor sessions</h2>
   {sessions.length===0?<p className="text-label text-ink-2">No linked tutor sessions.</p>:
    sessions.slice(0,20).map(session=><Link key={session.id} className={actionClass+' justify-between gap-2'}
      to={'/s/'+encodeURIComponent(slug)+'/'+session.number}>
      <span>Session {session.number}</span><span className="text-caption text-ink-2">
       {session.goalMet??session.display}</span></Link>)}
   {sessions.length>20&&<Link className={actionClass} to={base+'?tab=sessions'}>All path sessions</Link>}
   <Link className={actionClass+' self-start'} to="/review">{detail.cardsCount} cards · Open Review</Link>
  </section>
  <section aria-label="Checkpoint actions" className="flex flex-col gap-3">
   <h2 className="text-title-s font-semibold">Work with your tutor</h2>
   <p className="text-label text-ink-2">Actions open your tutor to assess or request a change. They do not mark a checkpoint complete until the tutor records evidence or an approved plan change.</p>
   {actions}
  </section>
 </section>;
}
