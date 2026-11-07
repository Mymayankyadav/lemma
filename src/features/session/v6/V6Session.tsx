import {useState} from 'react';
import {Link,useParams} from 'react-router';
import {useProject,useSession,useSettings} from '../../../data/hooks';
import type {SessionEvent,SessionDetail} from '../../../data/types';
import {chatLink,resumePrompt,studyPrompt} from '../../../lib/chat';
import {FastTex as Tex} from '../../../ui/FastTex';
import {useToast} from '../../../ui/Toast';

const control='inline-flex min-h-11 items-center justify-center rounded-ctl border border-edge bg-fill-1 px-4 py-2 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber';

/** Present the actual recorded chronology, not a guessed tutor reasoning order. */
export function orderedSessionEvents(events:readonly SessionEvent[]):SessionEvent[]{
 return [...events].sort((a,b)=>{
  const first=Date.parse(a.createdAt),second=Date.parse(b.createdAt);
  return (Number.isFinite(first)?first:0)-(Number.isFinite(second)?second:0)||a.id-b.id;
 });
}

/** Only the session's stored status tells us whether ending is still applicable. */
export function sessionActions(session:SessionDetail):{resume:boolean;end:boolean}{
 const ended=session.summary.display==='ended';
 return {resume:!ended,end:!ended};
}

export default function V6Session(){
 const {slug:rawSlug,n:rawNumber}=useParams();
 const slug=rawSlug??'',number=Number(rawNumber);
 const [visibleEvents,setVisibleEvents]=useState(50);
 const session=useSession(slug,number),project=useProject(slug),settings=useSettings(),notify=useToast();
 const data=session.data,summary=data?.summary;
 const client=settings.data?.preferredChat??'claude';
 const path='/p/'+encodeURIComponent(slug);
 function openTutor(prompt:string){
  void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'}))
   .catch(()=>notify('Tutor prompt copy unavailable'));
  window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
 }
 if(session.isPending)return <section aria-label="Session loading" className="p-4">
  <p role="status" className="text-label text-ink-2">Loading tutor session…</p>
 </section>;
 if(session.isError||!data||!summary||!Number.isSafeInteger(number)||number<1)return <section aria-label="Session unavailable" className="flex flex-col gap-3 p-4">
  <h1 className="text-title-l font-semibold">Session unavailable</h1>
  <p role="alert" className="text-label text-ink-2">The session record could not be loaded.</p>
  <button type="button" className={control} onClick={()=>{void session.refetch();}}>Try again</button>
  <Link to={path+'?tab=sessions'} className={control}>Back to path sessions</Link>
 </section>;
 const events=orderedSessionEvents(data.events),actions=sessionActions(data);
 const projectTitle=project.data?.project.title??slug;
 return <section data-v6-session-page className="flex min-w-0 flex-col gap-5 pb-8">
  <header className="flex flex-col gap-2">
   <Link to={path+'?tab=sessions'} className={control+' self-start'}>Back to path sessions</Link>
   <p className="text-label text-ink-2">Session {summary.number} · {summary.display}</p>
   <h1 className="text-title-l font-semibold"><Tex source={summary.goal}/></h1>
   <div className="flex flex-wrap gap-2 text-label text-ink-2">
    <span>{summary.minutes===null?'Study time not yet recorded':summary.minutes+' minutes'}</span>
    <span>· {summary.client==='claude'?'Claude':summary.client==='chatgpt'?'ChatGPT':'Tutor'}</span>
    {summary.goalMet&&<span>· Goal {summary.goalMet==='yes'?'met':summary.goalMet==='partial'?'partly met':'not met'}</span>}
   </div>
   <p className="text-caption text-ink-2"><time dateTime={summary.startedAt}>{new Date(summary.startedAt).toLocaleString()}</time></p>
   {summary.checkpointCode&&<Link className={control+' self-start'}
    to={path+'/cp/'+encodeURIComponent(summary.checkpointCode)}>
    Checkpoint {summary.checkpointCode}</Link>}
  </header>
  <section aria-label="Session summary" className="flex flex-col gap-2 rounded-ctl border border-edge bg-raised p-4">
   <h2 className="text-title-s font-semibold">Summary</h2>
   {data.summaryText?<p className="text-body text-ink-2"><Tex source={data.summaryText}/></p>:
    <p className="text-label text-ink-2">No summary recorded yet.</p>}
   <p className="text-caption text-ink-2">Teaching style: {data.styleName||'Not recorded'}</p>
   {data.pages&&<p className="text-caption text-ink-2">Source pages: {data.pages}</p>}
  </section>
  <section aria-label="Resume checkpoint" className="flex flex-col gap-2 rounded-ctl border border-edge bg-fill-1 p-4">
   <h2 className="text-title-s font-semibold">Pick up where you left off</h2>
   {data.resumeStep!==null&&<p className="text-label text-ink-2">Resume step {data.resumeStep}</p>}
   {data.resumeQuestion?<p className="text-body"><Tex source={data.resumeQuestion}/></p>:
    <p className="text-label text-ink-2">No resume question recorded.</p>}
  </section>
  <section aria-label="Session event timeline" className="flex flex-col gap-3">
   <h2 className="text-title-s font-semibold">Tutor timeline</h2>
   {events.length===0?<p className="text-label text-ink-2">No tutor events recorded.</p>:
    <ol className="flex flex-col gap-2">{events.slice(0,visibleEvents).map((event,index)=><li key={event.id}
     className="rounded-ctl border border-edge bg-raised p-3">
     <div className="flex flex-wrap items-center gap-2 text-caption text-ink-2">
      <span className="font-semibold">{index+1}. {event.kind.replaceAll('_',' ')}</span>
      {event.outcome&&<span>· {event.outcome}</span>}
      {event.hintLevel!==null&&<span>· Hint level {event.hintLevel}</span>}
      <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
     </div>
     <div className="mt-2 break-words text-body"><Tex source={event.body}/></div>
     {event.checkpointCode&&<Link className="mt-2 inline-flex min-h-11 items-center text-label text-amber"
       to={path+'/cp/'+encodeURIComponent(event.checkpointCode)}>Checkpoint {event.checkpointCode}</Link>}
    </li>)}</ol>}
   {events.length>visibleEvents&&<button type="button" className={control} onClick={()=>setVisibleEvents(count=>count+50)}>
    Show 50 more events · {events.length-visibleEvents} remaining</button>}
  </section>
  <section aria-label="Session actions" className="flex flex-col gap-2">
   <h2 className="text-title-s font-semibold">Session actions</h2>
   {actions.resume?<button type="button" className={control}
     onClick={()=>openTutor(resumePrompt(projectTitle))}>Resume with tutor</button>:
    <button type="button" className={control}
     onClick={()=>openTutor(studyPrompt(projectTitle,summary.checkpointCode??undefined))}>Start another study session</button>}
   {actions.end&&<button type="button" className={control}
     onClick={()=>openTutor(resumePrompt(projectTitle)+'\n\nPlease end this session, save the evidence and summary, and mark its outcome.')}>
     End with tutor</button>}
   <p className="text-caption text-ink-2">The tutor records session changes; opening a prompt does not change the saved session.</p>
  </section>
 </section>;
}
