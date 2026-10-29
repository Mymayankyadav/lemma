import {useCallback,useState} from 'react';
import {Link,useParams} from 'react-router';
import {BookOpen,Calendar,CheckCircle,Clock,Copy,History,Inbox,MessageCircle,MoreHorizontal,Target,TriangleAlert,XCircle,Lightbulb,BookMarked,Sparkles,Bot,Check,ArrowRight} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {useProject,useSession,useSettings,useResolveMisconception} from '../../data/hooks';
import {chatLink,resumePrompt,studyPrompt} from '../../lib/chat';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {Chip} from '../../ui/Chip';
import {Button} from '../../ui/Button';
import {IconButton} from '../../ui/IconButton';
import {Sheet} from '../../ui/Sheet';
import {MathText} from '../../ui/MathText';
import {useToast} from '../../ui/Toast';
import type {EventKind,GoalMet,SessionEvent} from '../../data/types';
const icons:Record<EventKind,typeof Lightbulb>={pretest:BookMarked,attempt:Target,hint:Lightbulb,explanation:BookOpen,misconception:TriangleAlert,evidence:CheckCircle,recheck:History,note:MessageCircle};
const name:Record<EventKind,string>={pretest:'Warm-up',attempt:'Attempt',hint:'Hint',explanation:'Explanation',misconception:'Misconception',evidence:'Evidence',recheck:'Recheck',note:'Note'};
const goalText:Record<Exclude<GoalMet,null>,string>={yes:'Goal met',partial:'Partly met',no:'Not yet met'};
const date=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
const short=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{weekday:'long'});
function ReasoningEvent({event,index}:{event:SessionEvent;index:number}){
 const Icon=icons[event.kind],reduce=!!useReducedMotion(),demonstrated=event.kind==='evidence'&&event.outcome==='demonstrated';
 return <motion.li initial={reduce?{opacity:0}:{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:reduce?0.15:0.4,delay:Math.min(index,6)*0.07}} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-6 last:pb-0">
  <span aria-hidden="true" className={`relative z-10 flex size-10 items-center justify-center rounded-ctl border ${demonstrated?'border-amber bg-amber text-amber-ink':event.kind==='misconception'?'border-amber-line bg-amber-tint text-amber':'border-edge-2 bg-tile text-ink-2'}`}><Icon size={19}/></span>
  <div className="min-w-0 pt-1">
   <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">{name[event.kind]}</h3>
   {event.checkpointCode&&<span className="text-[11px] text-ink-3">{event.checkpointCode}</span>}
   {event.hintLevel!==null&&event.kind==='hint'&&<span aria-label={`Hint level ${event.hintLevel}`} className="flex gap-1">{[1,2,3,4].map(n=><i key={n} className={`h-1 w-3 rounded-full ${n<=event.hintLevel!?'bg-amber':'bg-fill-2'}`}/>)}</span>}
   </div>
   <MathText source={event.body} className="mt-1.5 text-[14px] text-ink-2"/>
   {event.outcome&&<Chip size={28} tone={event.outcome==='demonstrated'?'success':event.outcome==='failed'?'danger':'amber'}>{event.outcome}</Chip>}
  </div></motion.li>;
}
export default function Page(){
 const {slug='',n=''}=useParams(),number=Number(n),query=useSession(slug,number),project=useProject(slug),settings=useSettings();
 const resolve=useResolveMisconception(),notify=useToast(),[menu,setMenu]=useState(false),[pagesOpen,setPagesOpen]=useState(false);
 const session=query.data,summary=session?.summary;
 const copy=useCallback(async(text:string)=>{try{await navigator.clipboard.writeText(text);notify('Copied to clipboard',{tone:'success'})}catch{notify('Copy unavailable. Select the text to copy.',{tone:'danger'})}},[notify]);
 const launch=(prompt:string)=>{void navigator.clipboard.writeText(prompt).catch(()=>{});notify('Prompt copied');window.open(chatLink(settings.data?.preferredChat??'claude',prompt),'_blank','noopener,noreferrer')};
 const proposalCount=(session?.pendingProposals.cards??0)+(session?.pendingProposals.planChanges??0);
 const title=`Session ${Number.isInteger(number)?number:''}`;
 return <section className="flex flex-col gap-5">
  <header className="flex items-center gap-2"><Link aria-label="Back to project" to={`/p/${slug}?tab=sessions`} className="flex size-11 items-center justify-center rounded-ctl text-ink-2"><ArrowRight className="rotate-180" size={22}/></Link><div className="min-w-0 flex-1"><h1 className="sr-only">Session record</h1><h2 className="text-[26px] font-semibold">{title}</h2></div><IconButton icon={MoreHorizontal} label="More actions" onClick={()=>setMenu(!menu)}/></header>
  {menu&&<div className="glass flex flex-wrap gap-2 rounded-slab p-3"><button className="min-h-11 rounded-ctl px-4 text-amber" onClick={()=>{void copy(session?.summaryText||summary?.goal||'');setMenu(false)}}>Copy summary</button><Link className="inline-flex min-h-11 items-center rounded-ctl px-4" to={`/p/${slug}`}>Open project</Link></div>}
  {query.isPending?<p role="status" className="p-4 text-ink-2">Loading session…</p>:query.isError||!session||!summary?<div role="alert" className="p-4">Session unavailable. <Link className="text-amber" to={`/p/${slug}`}>Open project</Link></div>:<>
   <div className="flex items-center gap-4 text-[12px] text-ink-2"><span className="flex items-center gap-1.5"><Clock size={14}/>{summary.minutes===null?'In progress':`${summary.minutes} min`}</span><span className="flex items-center gap-1.5">{summary.client==='claude'?<Sparkles size={14}/>:<Bot size={14}/>} {summary.client==='claude'?'Claude':summary.client==='chatgpt'?'ChatGPT':'Tutor'}</span><span className="flex items-center gap-1.5"><Calendar size={14}/>{short(summary.startedAt)}</span></div>
   <Slab lamp className="flex flex-col gap-4"><div className="flex items-center gap-3"><span className="flex size-[42px] items-center justify-center rounded-ctl bg-amber-tint text-amber"><Target size={22}/></span><div className="min-w-0 flex-1"><p className="text-[12px] text-ink-3">Session goal</p><MathText source={summary.goal} className="mt-1 text-[16px]"/></div></div>
    <div className="flex flex-wrap gap-2">{summary.goalMet?<Chip tone={summary.goalMet==='yes'?'success':summary.goalMet==='no'?'danger':'amber'} icon={summary.goalMet==='yes'?Check:undefined}>{goalText[summary.goalMet]}</Chip>:<Chip tone="amber">{summary.display==='live'?'Live':summary.display==='paused'?'Paused':'Ended'}</Chip>}
    {summary.checkpointCode&&<Chip>{summary.checkpointCode}</Chip>}</div>
   </Slab>
   {session.summaryText&&<Slab className="flex flex-col gap-2"><h2 className="text-[17px] font-semibold">Summary</h2><MathText source={session.summaryText} className="text-[15px]"/></Slab>}
   <section aria-label="Reasoning" className="flex flex-col gap-4"><h2 className="text-[19px] font-semibold">Reasoning</h2>
    {session.events.length?<ol className="relative before:absolute before:bottom-5 before:left-5 before:top-4 before:w-px before:bg-linear-to-b before:from-edge-2 before:to-amber/60">{session.events.map((event,i)=><ReasoningEvent key={event.id} event={event} index={i}/>)}</ol>:<p className="text-[14px] text-ink-3">No reasoning events recorded for this session.</p>}
   </section>
   {!!session.misconceptions.filter(m=>!m.resolvedAt).length&&<section className="flex flex-col gap-3"><h2 className="text-[18px] font-semibold">Things to revisit</h2>{session.misconceptions.filter(m=>!m.resolvedAt).map(m=><Tile key={m.id} className="flex flex-wrap items-center gap-3 border-amber-line bg-amber-tint"><TriangleAlert className="text-amber" size={20}/><span className="min-w-0 flex-1 text-[15px]">{m.label}</span><Chip tone="amber">{m.times}×</Chip><button disabled={resolve.isPending} className="min-h-11 rounded-ctl px-2 text-[13px] font-semibold text-amber" onClick={()=>resolve.mutate(m.id,{onSuccess:()=>notify('Marked resolved',{tone:'success'}),onError:()=>notify('Couldn’t save. Try again.',{tone:'danger'})})}>Resolved</button></Tile>)}</section>}
   {!!session.cards.length&&<section className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="text-[18px] font-semibold">Cards</h2><span className="text-[12px] text-ink-3">{session.cards.length}</span></div><div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2">{session.cards.map((card,i)=><Link key={i} to={card.state==='active'?`/cards/${card.noteNo}`:'/proposals'} className="tile flex min-h-28 min-w-[160px] max-w-[175px] flex-col justify-between gap-2 text-left"><MathText source={card.front} className="line-clamp-3 font-math text-[16px]"/><span className="flex items-center gap-1 text-[11px] text-ink-3">{card.state==='pending'?<span className="size-2 rounded-full bg-amber"/>:<Check size={13} className="text-easy"/>}{card.state==='pending'?'Awaiting approval':`N${card.noteNo}`}</span></Link>)}</div></section>}
   {proposalCount>0&&<Slab className="flex flex-wrap items-center gap-3"><Inbox className="text-amber" size={23}/><div className="min-w-0 flex-1"><h2 className="font-semibold">{session.pendingProposals.cards} cards, {session.pendingProposals.planChanges} plan changes</h2><p className="text-[12px] text-ink-2">Waiting for you</p></div><Link className="lit inline-flex min-h-11 items-center rounded-ctl px-4 text-sm font-semibold" to="/proposals">Review</Link></Slab>}
   {session.pages&&<button className="tile flex min-h-14 items-center gap-3 text-left" onClick={()=>setPagesOpen(true)}><BookOpen size={20} className="text-amber"/><span className="min-w-0 flex-1">Pages {session.pages}</span><ArrowRight size={16}/></button>}
   <div className="flex gap-3"><IconButton icon={Copy} label="Copy session summary" onClick={()=>void copy(session.summaryText||summary.goal)}/><Button className="flex-1" icon={MessageCircle} onClick={()=>launch(summary.display==='ended'?studyPrompt(project.data?.project.title||slug,summary.checkpointCode||undefined):resumePrompt(project.data?.project.title||slug))}>{summary.display==='ended'? 'Start studying':'Resume session'}</Button></div>
  </>}
  <Sheet title="Session pages" open={pagesOpen} onClose={()=>setPagesOpen(false)}><p className="text-ink-2">Source pages: {session?.pages||'Not recorded'}. Your tutor can read the source using Lemma’s PDF tools. The session record stores the citation rather than a copy of the page text.</p><Button className="mt-5 w-full" onClick={()=>setPagesOpen(false)}>Close</Button></Sheet>
 </section>;
}
