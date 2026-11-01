import {Tex} from '../../ui/Tex';
import {useCallback,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router';
import {BookOpen,Calendar,CheckCircle,Clock,Copy,History,MessageCircle,MoreHorizontal,Target,TriangleAlert,XCircle,Lightbulb,BookMarked,Sparkles,Bot,Check,ArrowRight} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {useProject,useSession,useSettings,useResolveMisconception} from '../../data/hooks';
import {chatLink,resumePrompt,studyPrompt} from '../../lib/chat';
import {Slab} from '../../ui/Slab';
import {Chip} from '../../ui/Chip';
import {Button} from '../../ui/Button';
import {IconButton} from '../../ui/IconButton';
import {Sheet} from '../../ui/Sheet';
import {MathText} from '../../ui/MathText';
import {useToast} from '../../ui/Toast';
import {useOnlineStatus,networkWritable} from '../../ui/useOnlineStatus';
import type {EventKind,GoalMet,SessionEvent} from '../../data/types';
import {reasoningRuns} from './runs';
import {sessionCardSummary} from './counts';
const icons:Record<EventKind,typeof Lightbulb>={pretest:BookMarked,attempt:Target,hint:Lightbulb,explanation:BookOpen,misconception:TriangleAlert,evidence:CheckCircle,recheck:History,note:MessageCircle};
const name:Record<EventKind,string>={pretest:'Warm-up',attempt:'Attempt',hint:'Hint',explanation:'Explanation',misconception:'Misconception',evidence:'Evidence',recheck:'Recheck',note:'Note'};
const goalText:Record<Exclude<GoalMet,null>,string>={yes:'Goal met',partial:'Partly met',no:'Not yet met'};
const date=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
const short=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{weekday:'long'});
function ReasoningEvent({event,index}:{event:SessionEvent;index:number}){
 const Icon=icons[event.kind],reduce=!!useReducedMotion(),demonstrated=event.kind==='evidence'&&event.outcome==='demonstrated',hintLevel=event.hintLevel??0;
 return <motion.li initial={reduce?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.4,delay:Math.min(index,6)*0.07}} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
  <span aria-hidden="true" className={`relative z-10 flex size-10 items-center justify-center rounded-full border font-semibold ${demonstrated?'border-amber bg-amber text-amber-ink':event.kind==='misconception'?'border-amber-line text-amber':'border-edge-2 bg-tile text-ink-2'}`} style={{fontFamily:'var(--font-display)',fontSize:20}}>{index+1}</span>
  <div className="min-w-0 pt-1">
   <div className="flex flex-wrap items-center gap-2"><Icon size={15} aria-hidden="true" className={event.kind==='misconception'?'text-amber':'text-ink-3'}/><h3 className="text-body-l font-semibold">{name[event.kind]}</h3>
   {event.checkpointCode&&<span className="text-caption text-ink-3">{event.checkpointCode}</span>}
   {event.hintLevel!==null&&event.kind==='hint'&&<span aria-label={`Hint level ${event.hintLevel}`} className="inline-flex items-center gap-1.5"><span className="text-caption tabular-nums text-ink-2">Level {event.hintLevel}</span>{[1,2,3,4].map(n=><i key={n} aria-hidden="true" className={`h-1 w-2.5 rounded-[1px] ${n<=Math.ceil(hintLevel/5)?'bg-amber':'bg-fill-2'}`}/>)}</span>}
   </div>
   <div className={event.kind==='misconception'?'mt-2 border-l-2 border-amber pl-3 italic':'mt-1.5'}><MathText source={event.body} className="text-body text-ink-2"/></div>
   {event.outcome&&<Chip size={28} tone={event.outcome==='demonstrated'?'success':event.outcome==='failed'?'danger':'amber'}>{event.outcome}</Chip>}
  </div></motion.li>;
}
export default function Page(){
 const {slug='',n=''}=useParams(),number=Number(n),query=useSession(slug,number),project=useProject(slug),settings=useSettings();
 const [params]=useSearchParams(),viewCards=params.get('cards')==='1';
 const [cardPage,setCardPage]=useState(0);
 const online=useOnlineStatus();
 const resolve=useResolveMisconception(),notify=useToast(),[menu,setMenu]=useState(false),[pagesOpen,setPagesOpen]=useState(false),[expanded,setExpanded]=useState<number[]>([]),[visibleRuns,setVisibleRuns]=useState(40);
 const session=query.data,summary=session?.summary;
 const runs=reasoningRuns(session?.events??[]);
 const copy=useCallback(async(text:string)=>{try{await navigator.clipboard.writeText(text);notify('Copied to clipboard',{tone:'success'})}catch{notify('Copy unavailable. Select the text to copy.',{tone:'danger'})}},[notify]);
 const launch=(prompt:string)=>{void navigator.clipboard.writeText(prompt).catch(()=>{});notify('Prompt copied');window.open(chatLink(settings.data?.preferredChat??'claude',prompt),'_blank','noopener,noreferrer')};
 const proposalCount=(session?.pendingProposals.cards??0)+(session?.pendingProposals.planChanges??0);
 const title=`Session ${Number.isInteger(number)?number:''}`;
 return <section data-euclid-session className="flex flex-col gap-5">
  <header className="flex items-center gap-2"><Link aria-label="Back to project" to={`/p/${slug}?tab=sessions`} className="flex size-11 items-center justify-center rounded-ctl text-ink-2"><ArrowRight className="rotate-180" size={22}/></Link><div className="min-w-0 flex-1"><h1 className="sr-only">Session record</h1><h2 className="text-num-l font-medium italic" style={{fontFamily:'var(--font-display)'}}>{title}</h2></div><IconButton icon={MoreHorizontal} label="More actions" onClick={()=>setMenu(!menu)}/></header>
  {menu&&<div className="glass flex flex-wrap gap-2 rounded-slab p-3"><button className="min-h-11 rounded-ctl px-4 text-ink-2" onClick={()=>{void copy(session?.summaryText||summary?.goal||'');setMenu(false)}}>Copy summary</button><Link className="inline-flex min-h-11 items-center rounded-ctl px-4" to={`/p/${slug}`}>Open project</Link></div>}
  {query.isPending?<p role="status" className="p-4 text-ink-2">Loading session…</p>:query.isError||!session||!summary?<div role="alert" className="p-4">Session unavailable. <Link className="text-ink-2" to={`/p/${slug}`}>Open project</Link></div>:<>
   <div className="flex items-center gap-4 text-label text-ink-2"><span className="flex items-center gap-1.5"><Clock size={14}/>{summary.minutes===null?'In progress':`${summary.minutes} min`}</span><span className="flex items-center gap-1.5">{summary.client==='claude'?<Sparkles size={14}/>:<Bot size={14}/>} {summary.client==='claude'?'Claude':summary.client==='chatgpt'?'ChatGPT':'Tutor'}</span><span className="flex items-center gap-1.5"><Calendar size={14}/>{short(summary.startedAt)}</span></div>
   <Slab className="flex flex-col gap-4"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-label text-ink-3">Session goal</p><MathText source={summary.goal} className="mt-1 text-headline"/></div></div>
    <div className="flex flex-wrap gap-2">{summary.goalMet?<Chip tone={summary.goalMet==='yes'?'success':summary.goalMet==='no'?'danger':'amber'} icon={summary.goalMet==='yes'?Check:undefined}>{goalText[summary.goalMet]}</Chip>:<Chip tone="amber">{summary.display==='live'?'Live':summary.display==='paused'?'Paused':'Ended'}</Chip>}
    {summary.checkpointCode&&<Chip>{summary.checkpointCode}</Chip>}</div>
    {session.summaryText&&<div className="flex flex-col gap-2 border-t border-[var(--hair)] pt-3"><h2 className="text-body font-semibold">Summary</h2><MathText source={session.summaryText} className="text-body-l"/></div>}
   </Slab>
   {viewCards&&<section aria-label="Cards from this session" className="flex flex-col gap-3">
    <Link to={`/s/${slug}/${number}`} className="inline-flex min-h-11 items-center text-label font-semibold text-ink-2">Back to reasoning</Link>
    <h2 className="text-title-s font-semibold">Cards from S{number}</h2>
    <p className="text-label text-ink-3">{Math.min(cardPage*20+1,session.cards.length)}–{Math.min((cardPage+1)*20,session.cards.length)} of {session.cards.length}</p>
    {session.cards.slice(cardPage*20,(cardPage+1)*20).map((card,i)=><Link key={card.noteNo+'-'+i} to={card.state==='pending'?'/proposals':`/cards/${card.noteNo}`} className="flex min-h-14 items-center gap-3 rounded-ctl border border-edge bg-raised px-3">
     <span className="min-w-0 flex-1 line-clamp-2 font-math text-body"><MathText source={card.front}/></span>
     <span className="shrink-0 text-label text-ink-3">{card.state==='pending'?'Waiting':`N${card.noteNo}`}</span><ArrowRight size={17} className="shrink-0"/>
    </Link>)}
    <div className="flex gap-2">{cardPage>0&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-ink-2" onClick={()=>setCardPage(p=>p-1)}>Previous 20</button>}{(cardPage+1)*20<session.cards.length&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-ink-2" onClick={()=>setCardPage(p=>p+1)}>More cards</button>}</div>
   </section>}
   {!viewCards&&<section aria-label="Reasoning" className="flex flex-col gap-4"><h2 className="text-headline font-semibold italic" style={{fontFamily:'var(--font-display)'}}>Reasoning</h2>
    {session.events.length?<><ol className="relative before:absolute before:bottom-5 before:left-5 before:top-4 before:w-px before:bg-linear-to-b before:from-edge-2 before:to-amber/60">
     {runs.slice(0,visibleRuns).map(run=>{
      const fold=run.events.length>=3;
      const open=expanded.includes(run.start);
      return fold?<li key={run.events[0].id} className="relative pb-5">
       <button type="button" aria-expanded={open} onClick={()=>setExpanded(old=>open?old.filter(i=>i!==run.start):[...old,run.start])}
        className="flex min-h-11 w-full items-center gap-3 rounded-ctl border border-edge bg-fill-1 px-3 text-left text-body font-semibold text-ink-2">
        <Lightbulb size={16} className="shrink-0 text-amber"/><span className="flex-1">{run.events.length} {name[run.kind].toLowerCase()}{run.events.length===1?'':'s'} · events {run.start+1}–{run.start+run.events.length}</span><span className="text-ink-2">{open?'Hide':'Show'}</span>
       </button>
       {open&&<ol className="mt-3">{run.events.map((event,i)=><ReasoningEvent key={event.id} event={event} index={run.start+i}/>)}</ol>}
      </li>:run.events.map((event,i)=><ReasoningEvent key={event.id} event={event} index={run.start+i}/>);
     })}
    </ol>{visibleRuns<runs.length&&<button type="button" onClick={()=>setVisibleRuns(n=>n+40)} className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold text-ink-2">More reasoning · {runs.length-visibleRuns} groups remaining</button>}</>:<p className="text-body text-ink-3">No reasoning events recorded for this session.</p>}
   </section>}
   {!viewCards&&!!session.misconceptions.filter(m=>!m.resolvedAt).length&&<section className="flex flex-col gap-3"><h2 className="text-title-s font-semibold italic" style={{fontFamily:'var(--font-display)'}}>Things to revisit</h2>{session.misconceptions.filter(m=>!m.resolvedAt).map(m=><div key={m.id} className="flex flex-wrap items-center gap-3 border-l-2 border-amber py-2 pl-3"><TriangleAlert className="text-amber" size={18}/><span className="min-w-0 flex-1 text-body-l"><Tex source={m.label}/></span><Chip tone="amber">{m.times}×</Chip><button disabled={resolve.isPending} aria-disabled={!online||undefined} aria-label={online?'Resolved':'Resolved, needs a connection'} className="min-h-11 rounded-ctl px-2 text-label font-semibold text-ink-2" onClick={()=>{
     if(!networkWritable()){notify('Needs a connection');return}
     resolve.mutate(m.id,{onSuccess:()=>notify('Marked resolved',{tone:'success'}),onError:()=>notify('Couldn’t save. Try again.',{tone:'danger'})})
    }}>Resolved</button></div>)}</section>}
   {!!session.cards.length&&<section aria-label="Session cards" className="flex flex-col gap-2"><h2 className="text-title-s font-semibold italic" style={{fontFamily:'var(--font-display)'}}>Cards</h2>
    <Link to={`/s/${slug}/${number}?cards=1`} className="flex min-h-14 items-center justify-between gap-3 rounded-ctl border border-edge bg-raised px-4 text-body text-ink-2">
     <span>{sessionCardSummary(session.cards.length,session.cards.filter(card=>card.state==='pending').length)}</span><ArrowRight size={18} className="shrink-0"/>
    </Link></section>}
   {proposalCount>0&&<p className="text-label text-ink-2" aria-label="Pending session proposals">
    {session.pendingProposals.cards} {session.pendingProposals.cards===1?'card':'cards'} ·
    {' '}{session.pendingProposals.planChanges} {session.pendingProposals.planChanges===1?'plan change':'plan changes'} waiting
   </p>}
   <div role="group" aria-label="Session actions" className="flex flex-col gap-2">
    <Button className="w-full" icon={MessageCircle} onClick={()=>launch(summary.display==='ended'?studyPrompt(project.data?.project.title||slug,summary.checkpointCode||undefined):resumePrompt(project.data?.project.title||slug))}>
     {summary.display==='ended'?'Start studying':'Resume session'}
    </Button>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
     <button type="button" aria-label="Copy session summary" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-label font-semibold text-ink-2" onClick={()=>void copy(session.summaryText||summary.goal)}>
      <Copy size={16} aria-hidden="true"/>Copy
     </button>
     {proposalCount>0&&<Link to="/proposals" className="inline-flex min-h-11 min-w-11 items-center justify-center text-label font-semibold text-ink-2">Review</Link>}
     {session.pages&&<button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-label font-semibold text-ink-2" onClick={()=>setPagesOpen(true)}>
      Pages
     </button>}
    </div>
   </div>
  </>}
  <Sheet title="Session pages" open={pagesOpen} onClose={()=>setPagesOpen(false)}><p className="text-ink-2">Source pages: {session?.pages||'Not recorded'}. Your tutor can read the source using Lemma’s PDF tools. The session record stores the citation rather than a copy of the page text.</p><Button className="mt-5 w-full" onClick={()=>setPagesOpen(false)}>Close</Button></Sheet>
 </section>;
}
