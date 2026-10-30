import {useEffect, useState} from 'react';
import {Link} from 'react-router';
import {getMode} from '../../data/mode';
import {ChevronRight, Inbox, Plus, SlidersHorizontal, Waypoints} from 'lucide-react';
import {useHome, useSettings} from '../../data/hooks';
import {resumePrompt} from '../../lib/chat';
import {relativeTime} from '../../lib/text';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {IconButton} from '../../ui/IconButton';
import {Glyph} from '../../ui/Glyph';
import {Rail} from '../../ui/Rail';
import {Chip} from '../../ui/Chip';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import type {HomeSummary, ProjectSummary} from '../../data/types';
import {GoalDistance} from './GoalDistance';
import {ReviewOutlook} from './ReviewOutlook';

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

function ProjectLink({project}:{project:ProjectSummary}){
 return <div>
  <Link to={'/p/'+project.slug} aria-label={project.title+', '+project.done+' of '+project.total+' checkpoints'}
   className="group grid min-h-[var(--row)] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-ctl px-0.5 text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <span className="flex min-w-0 flex-col gap-1">
    <span className="truncate text-headline font-medium">{project.title}</span>
    <Rail label={project.title+' progress'} value={project.total?project.done/project.total:0}/>
   </span>
   <span className="flex items-center gap-1 text-body tabular-nums text-ink-2">
    {project.total===0?'Needs a plan':project.done+'/'+project.total}<ChevronRight size={15} aria-hidden="true" className="text-ink-3"/>
   </span>
  </Link>
 </div>;
}

/** A passive 56px handoff, not an in-app tutor launcher. */
function ResumeCard({home,onCopy}:{home:HomeSummary;onCopy:(projectTitle:string)=>void}){
 const resume=home.resume;
 if(!resume)return <Slab className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
  <span className="min-w-0 truncate text-label text-ink-2">No chat yet. Start a path to begin.</span>
  <Link to="/projects/new" className="flex min-h-11 shrink-0 items-center text-label font-semibold text-amber">New path</Link>
 </Slab>;
 const status=resume.pausedAt?relativeTime(resume.pausedAt):null;
 const description=resume.checkpointTitle??'Ready to study';
 const step=resume.stepsTotal>0?', step '+Math.min(Math.max(1,resume.step),resume.stepsTotal)+' of '+resume.stepsTotal:'';
 return <Slab as="section" aria-label="Resume where you stopped" className="flex h-14 min-w-0 items-center gap-3 px-3">
  <span aria-hidden="true" className="w-5 shrink-0 text-center font-math text-headline text-amber">{resume.glyph}</span>
  <div className="min-w-0 flex-1">
   <p className="truncate text-body font-medium text-ink">{description}{step}</p>
   <p className="truncate text-caption text-ink-3">{resume.projectTitle}{status?' · paused '+status:''}</p>
  </div>
  <button type="button" onClick={()=>onCopy(resume.projectTitle)} aria-label="Copy resume prompt"
   className="flex min-h-11 shrink-0 items-center rounded-ctl px-3 text-label font-medium text-amber hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber">
   Copy
  </button>
 </Slab>;
}

function SummaryTiles({due,pending}:{due:number;pending:number}){
 return <div className="grid grid-cols-2 gap-3">
  <Link to="/review" aria-label={due+' cards due. Start reviewing'} className="focus-visible:outline-2 focus-visible:outline-amber">
   <Tile className="relative flex h-[var(--summary-tile)] flex-col justify-between overflow-hidden p-[var(--pad-tile)]">
    <span className="text-num-l font-semibold leading-none tracking-tight tabular-nums">{due}</span>
    <span className="text-label text-ink-2">{due===0?'all clear':'cards due'}</span>
   </Tile>
  </Link>
  <Link to="/proposals" aria-label={pending+' proposals to approve'} className="focus-visible:outline-2 focus-visible:outline-amber">
   <Tile className="relative flex h-[var(--summary-tile)] flex-col justify-between overflow-hidden p-[var(--pad-tile)]">
    <span className="text-num-l font-semibold leading-none tracking-tight tabular-nums">{pending}</span>
    <span className="text-label text-ink-2">{pending===0?'inbox clear':'to approve'}</span>
   </Tile>
  </Link>
 </div>;
}

export default function Page(){
 const home=useHome(),settings=useSettings(),notify=useToast();
 const [offline,setOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine);
 useEffect(()=>{
  const check=()=>setOffline(!navigator.onLine);
  window.addEventListener('online',check);window.addEventListener('offline',check);
  return ()=>{window.removeEventListener('online',check);window.removeEventListener('offline',check)};
 },[]);
 useEffect(()=>{
  if(home.error)notify("Couldn't load your desk.",{tone:'danger',action:{label:'Try again',onClick:()=>{void home.refetch()}}});
 },[home.error,home.refetch,notify]);
 async function copyPrompt(prompt:string){
  try{await navigator.clipboard.writeText(prompt);notify('Prompt copied',{tone:'success'})}
  catch{notify('Copy unavailable. Choose your chat app to continue.',{tone:'danger'})}
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
  <GoalDistance projects={projects} variant="metro"/>
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
    {projects.slice(0,4).map(p=><ProjectLink key={p.id} project={p}/>)}
   </div>
   <Link to="/projects" className="min-h-11 self-start pt-3 text-label font-medium text-amber">All paths</Link>
   {projects.length===0&&<Chip tone="quiet">Create your first project to begin</Chip>}
  </section>
  <section aria-label="Last chat" className="flex flex-col gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">Last chat</h2>
   <ResumeCard home={home.data} onCopy={title=>{void copyPrompt(resumePrompt(title))}}/>
  </section>
 </Screen>;
}
