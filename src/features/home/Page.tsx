import {useEffect, useState} from 'react';
import {Link} from 'react-router';
import {getMode} from '../../data/mode';
import {motion, useReducedMotion} from 'motion/react';
import {Bot, ChevronDown, ChevronRight, CircleCheck, History, Inbox, MessageCircle, Plus, SlidersHorizontal, Sparkles, Waypoints} from 'lucide-react';
import {useHome, useSettings, useUpdateSettings} from '../../data/hooks';
import {chatLink, resumePrompt, studyPrompt} from '../../lib/chat';
import {relativeTime} from '../../lib/text';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {Button} from '../../ui/Button';
import {IconButton} from '../../ui/IconButton';
import {Glyph} from '../../ui/Glyph';
import {Rail} from '../../ui/Rail';
import {StepRing} from '../../ui/StepRing';
import {Chip} from '../../ui/Chip';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import {CardFanArt} from '../../ui/art/CardFanArt';
import type {HomeSummary, ProjectSummary} from '../../data/types';
import {GoalDistance} from './GoalDistance';
import {ReviewOutlook} from './ReviewOutlook';

type ChatClient = 'claude' | 'chatgpt';

function TodayHeader({pending}: {pending:number}) {
 const today=new Date();
 return <header className="flex items-center justify-between gap-3">
  <div className="min-w-0">
   <p className="text-label text-ink-2">{new Intl.DateTimeFormat('en',{weekday:'long'}).format(today)}</p>
   <h1 aria-label="Home" className="text-title-s font-semibold leading-tight tracking-tight">
    <time dateTime={today.toISOString().slice(0,10)}>{new Intl.DateTimeFormat('en',{day:'numeric',month:'long'}).format(today)}</time>
   </h1>
  </div>
  <nav aria-label="Desk actions" className="flex gap-2">
   <IconButton icon={Waypoints} label="Open the Atlas" to="/atlas"/>
   <IconButton icon={Inbox} label="Open proposals" badge={pending>0?'dot':undefined} to="/proposals"/>
   <IconButton icon={SlidersHorizontal} label="Settings" to="/settings"/>
  </nav>
 </header>;
}

function LoadingDesk(){
 return <Screen tabBar><TodayHeader pending={0}/>
  <Slab className="flex min-h-[200px] flex-col gap-3 p-[var(--pad)]">
   <div className="flex items-center gap-4"><Skeleton w={40} h={40}/><div className="flex flex-1 flex-col gap-2"><Skeleton w="45%" h={15}/><Skeleton w="72%" h={22}/></div><Skeleton w={76} h={76} radius={40}/></div>
   <Skeleton h={55}/><Skeleton h={52} radius={17}/>
  </Slab>
  <div className="grid grid-cols-2 gap-3"><Skeleton h={100} radius={22}/><Skeleton h={100} radius={22}/></div>
  <Skeleton w="38%" h={22}/><Skeleton h={56}/><Skeleton h={56}/>
 </Screen>;
}

function ProjectLink({project,index}:{project:ProjectSummary;index:number}){
 const reduce=!!useReducedMotion();
 return <motion.div initial={reduce?false:{opacity:0,y:12}} animate={{opacity:1,y:0}}
  transition={{duration:reduce?0.15:0.6,delay:reduce?0:index*0.1}}>
  <Link to={'/p/'+project.slug} aria-label={project.title+', '+project.done+' of '+project.total+' checkpoints'}
   className="group grid min-h-[var(--row)] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-ctl px-0.5 text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <span className="flex min-w-0 flex-col gap-1">
    <span className="truncate text-headline font-medium">{project.title}</span>
    <Rail label={project.title+' progress'} value={project.total?project.done/project.total:0} sheen={index===0} delay={index*0.1}/>
   </span>
   <span className="flex items-center gap-1 text-body tabular-nums text-ink-2">
    {project.total===0?'Needs a plan':project.done+'/'+project.total}<ChevronRight size={15} aria-hidden="true" className="text-ink-3"/>
   </span>
  </Link>
 </motion.div>;
}

function ResumeCard({home,client,onChoose}:{home:HomeSummary;client:ChatClient;onChoose:(client:ChatClient| 'copy')=>void}){
 const [menuOpen,setMenuOpen]=useState(false);
 const resume=home.resume;
 if(!resume)return <Slab lamp className="p-5">
  <EmptyState art="compass" title="Start with a book and a goal"
   body="Your tutor turns them into a plan." action={{label:'New project',to:'/projects/new'}}/>
 </Slab>;
 const hasSession=resume.sessionNumber!==null;
 const status=resume.pausedAt?relativeTime(resume.pausedAt):null;
 return <Slab as="section" lamp aria-label="Resume where you stopped" className="p-[var(--pad)]">
  <div className="relative flex items-center justify-between gap-3">
   <div className="flex min-w-0 items-center gap-3">
    <Glyph subject={resume.glyph} active/>
    <div className="min-w-0">
     <p className="truncate text-label text-ink-2">{resume.projectTitle}</p>
     <h2 className="truncate text-headline font-semibold tracking-tight">{resume.checkpointTitle??'Start studying'}</h2>
     {status&&<p className="mt-1 flex items-center gap-1 text-label text-ink-3"><History size={14} aria-hidden="true"/>
      {hasSession?'Paused '+status:'Last session '+status}</p>}
    </div>
   </div>
   {resume.stepsTotal>0?<StepRing steps={resume.stepsTotal} current={Math.max(1,resume.step)} spark/>:<span className="text-label text-ink-3">Needs a plan</span>}
  </div>
  <div className="mt-3 min-h-0 line-clamp-3 font-math text-question italic leading-[1.32] text-ink-soft">
   {resume.question??resume.objective??'Pick up where you left off.'}
  </div>
  <div className="relative mt-3 flex flex-wrap items-stretch gap-2">
   <Button icon={MessageCircle} className="min-w-[138px] flex-1" onClick={()=>onChoose(client)}>Resume</Button>
   <div className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={menuOpen}
     onClick={()=>setMenuOpen(v=>!v)}
     className="glass flex h-[52px] items-center gap-2 rounded-ctl px-3 text-label text-ink-2"
     aria-label="Choose chat app or copy prompt">
     {client==='claude'?<Sparkles size={17} aria-hidden="true"/>:<Bot size={17} aria-hidden="true"/>}
     {client==='claude'?'Claude':'ChatGPT'}<ChevronDown size={15} aria-hidden="true"/>
    </button>
    {menuOpen&&<div role="menu" aria-label="Resume options"
      className="glass absolute bottom-[calc(100%+8px)] right-0 z-20 min-w-[175px] overflow-hidden rounded-ctl border border-edge-2 p-1 shadow-xl">
      {(['claude','chatgpt','copy'] as const).map(value=><button type="button" role="menuitem" key={value}
       className="flex min-h-11 w-full items-center gap-2 rounded-s px-3 text-left text-label hover:bg-fill-2"
       onClick={()=>{setMenuOpen(false);onChoose(value)}}>
       {value==='copy'?<CircleCheck size={16}/>:value==='claude'?<Sparkles size={16}/>:<Bot size={16}/>}
       {value==='copy'?'Copy prompt':value==='claude'?'Claude':'ChatGPT'}
      </button>)}
    </div>}
   </div>
  </div>
 </Slab>;
}

function SummaryTiles({due,pending}:{due:number;pending:number}){
 const reduce=!!useReducedMotion();
 return <motion.div className="grid grid-cols-2 gap-3" initial={reduce?false:{opacity:0,y:12}}
  animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.7,delay:reduce?0:0.12}}>
  <Link to="/review" aria-label={due+' cards due. Start reviewing'} className="focus-visible:outline-2 focus-visible:outline-amber">
   <Tile className="relative flex h-[var(--summary-tile)] flex-col justify-between overflow-hidden p-[var(--pad-tile)]">
    <span className="text-num-l font-semibold leading-none tracking-tight tabular-nums">{due}</span>
    <span className="text-label text-ink-2">{due===0?'all clear':'cards due'}</span>
    <CardFanArt size={62} className="pointer-events-none absolute right-0 top-0 opacity-70"/>
   </Tile>
  </Link>
  <Link to="/proposals" aria-label={pending+' proposals to approve'} className="focus-visible:outline-2 focus-visible:outline-amber">
   <Tile className="relative flex h-[var(--summary-tile)] flex-col justify-between overflow-hidden p-[var(--pad-tile)]">
    <span className="text-num-l font-semibold leading-none tracking-tight tabular-nums">{pending}</span>
    <span className="text-label text-ink-2">{pending===0?'inbox clear':'to approve'}</span>
    <span aria-hidden="true" className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-s bg-amber-tint text-amber"><Inbox size={22}/></span>
   </Tile>
  </Link>
 </motion.div>;
}

export default function Page(){
 const home=useHome(),settings=useSettings(),updateChat=useUpdateSettings(),notify=useToast();
 const [offline,setOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine);
 useEffect(()=>{
  const check=()=>setOffline(!navigator.onLine);
  window.addEventListener('online',check);window.addEventListener('offline',check);
  return ()=>{window.removeEventListener('online',check);window.removeEventListener('offline',check)};
 },[]);
 useEffect(()=>{
  if(home.error)notify("Couldn't load your desk.",{tone:'danger',action:{label:'Try again',onClick:()=>{void home.refetch()}}});
 },[home.error,home.refetch,notify]);
 const client=settings.data?.preferredChat??'claude';
 const resume=home.data?.resume;
 async function copyPrompt(prompt:string){
  try{await navigator.clipboard.writeText(prompt);notify('Prompt copied',{tone:'success'})}
  catch{notify('Copy unavailable. Choose your chat app to continue.',{tone:'danger'})}
 }
 function chooseChat(value:ChatClient|'copy'){
  if(!resume)return;
  const prompt=resume.sessionNumber!==null?resumePrompt(resume.projectTitle):
   studyPrompt(resume.projectTitle,resume.checkpointCode??undefined,resume.checkpointTitle??undefined);
  void copyPrompt(prompt);
  if(value!=='copy'){
   if(value!==client)updateChat.mutate({preferredChat:value});
   window.open(chatLink(value,prompt),'_blank','noopener,noreferrer');
  }
 }
 if(home.isPending && !home.data)return <LoadingDesk/>;
 if(home.error || !home.data)return <Screen tabBar><TodayHeader pending={0}/>
  <EmptyState art={offline?'plug':'compass'} title={offline?'You are offline':"Couldn't load your desk"}
   body={offline?'Reconnect to resume studying.':'Your study data is safe. Try loading again.'}
   action={{label:'Try again',onClick:()=>{void home.refetch()}}}/>
 </Screen>;
 const projects=home.data.projects.filter(p=>!p.system&&p.status!=='archived')
  .sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||
   (Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0));
 return <Screen tabBar className="gap-6">
  <TodayHeader pending={home.data.pendingProposals}/>
  {offline&&<div role="status" className="rounded-ctl border border-edge-2 bg-fill-1 p-3 text-label text-ink-2">
   You're offline. Changes cannot be saved until you're connected.
  </div>}
  {getMode()==='live'&&settings.data&&!settings.data.connectorLastSeenAt&&<Link to="/settings" aria-label="Connect your tutor"
   className="flex min-h-12 items-center justify-between gap-3 rounded-ctl border border-amber-line bg-amber-tint px-4 py-3 text-label text-ink-soft">
   <span><strong className="text-amber">Tutor not connected.</strong> Set up the connector in Settings to record study progress.</span>
   <ChevronRight size={18} className="shrink-0 text-amber"/>
  </Link>}
  <GoalDistance projects={projects} variant={settings.data?.ui?.timeline==='metro'?'metro':'ascent'}/>
  <section aria-label="Cards" className="flex flex-col gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">Cards</h2>
   <SummaryTiles due={home.data.due} pending={home.data.pendingProposals}/>
   <ReviewOutlook/>
  </section>
  <section aria-label="From your tutor" className="flex min-w-0 flex-col gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">From your tutor</h2>
   <Link to="/proposals" aria-label="Review tutor suggestions"
    className="flex min-h-11 items-center justify-between gap-3 rounded-ctl border border-edge bg-raised px-4 py-3 text-label text-ink-2">
    <span className="min-w-0 break-words">
     {home.data.pendingProposals===0?'All tutor proposals reviewed':
      home.data.pendingProposals+' tutor proposals awaiting your decision'}
    </span>
    <ChevronRight size={16} className="shrink-0 text-amber"/>
   </Link>
  </section>
  <section aria-label="Projects" className="flex flex-col gap-2">
   <div className="flex min-h-11 items-center justify-between">
    <h2 className="text-body-l font-semibold text-ink-2">Projects</h2>
    <IconButton tone="plain" icon={Plus} label="New project" to="/projects/new" className="text-amber"/>
   </div>
   <div className="flex flex-col gap-1">
    {projects.slice(0,4).map((p,i)=><ProjectLink key={p.id} project={p} index={i}/>)}
   </div>
   <Link to="/projects" className="min-h-11 self-start pt-3 text-label font-medium text-amber">All paths</Link>
   {projects.length===0&&<Chip tone="quiet">Create your first project to begin</Chip>}
  </section>
  <section aria-label="Last chat" className="flex flex-col gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">Last chat</h2>
   <ResumeCard home={home.data} client={client} onChoose={chooseChat}/>
  </section>
 </Screen>;
}
