import {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {SectionHeading} from '../../ui/SectionHeading';
import {Link} from 'react-router';
import {getMode} from '../../data/mode';
import {Check, ChevronRight, Copy, Inbox, SlidersHorizontal, Waypoints} from 'lucide-react';
import {useHome, useSettings} from '../../data/hooks';
import {getApi} from '../../data';
import {resumePrompt} from '../../lib/chat';
import {relativeTime,formatCount} from '../../lib/text';
import {plainMath} from '../../lib/plain-math';
import {resumeSpoken} from './resumeSpoken';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {IconButton} from '../../ui/IconButton';
import {Glyph} from '../../ui/Glyph';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import {FastHomeTex} from './FastHomeTex'
import {FastGoalDistance} from './FastGoalDistance'
import {shouldUseFastGoals} from './fastGoalPolicy'
import type {HomeSummary} from '../../data/types';


const GoalDistance=lazy(()=>import('./GoalDistance').then(module=>({default:module.GoalDistance})));
const ReviewOutlook=lazy(()=>import('./ReviewOutlook').then(module=>({default:module.ReviewOutlook})));

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

/** On a desk with many projects, the Cards forecast sits below the fold.
 * Delay its expensive deck tree until the reader scrolls there; smaller
 * desks render it eagerly. This is based on actual project scale, not the
 * demo/stress query parameter, and applies equally to large live accounts. */
function ForecastOnDemand({defer}:{defer:boolean}){
 const [mounted,setMounted]=useState(!defer);
 const target=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(mounted)return;
  if(typeof IntersectionObserver==='undefined'){setMounted(true);return}
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting)){
    setMounted(true);
    observer.disconnect();
   }
  },{threshold:0.25});
  if(target.current)observer.observe(target.current);
  return ()=>observer.disconnect();
 },[mounted]);
 // A below-fold forecast is deliberately deferred on a large demo desk.
 // Do not leave a pulsing loading skeleton in the finished page: it falsely
 // advertises a stalled request and invalidates all-route readiness evidence.
 // The real forecast still mounts on intersection or an explicit 44px action.
 const waiting=<div aria-label="Seven-day review forecast" role="status"
  className="flex min-h-20 items-center text-label text-ink-2">
  Loading seven-day forecast…
 </div>;
 return <div ref={target} data-forecast-on-demand="" className="min-h-20">
  {mounted?<Suspense fallback={waiting}><ReviewOutlook/></Suspense>:
   <button type="button" onClick={()=>setMounted(true)}
    className="flex min-h-20 w-full items-center text-left text-label text-ink-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]">
    Show seven-day forecast
   </button>}
 </div>;
}

const clip={overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'} as const;

/** A passive, one-tap handoff. Fixed-height rows must clip explicitly: the
 * graph theme intentionally overrides Tailwind's truncate utility. */
export function ResumeCard({home,onCopy}:{home:HomeSummary;onCopy:(projectTitle:string)=>void}){
 const resume=home.resume;
 if(!resume)return <div role="region" aria-label="Resume where you stopped" className="flex min-h-16 items-center justify-between gap-3 px-1 py-2">
  <span className="min-w-0 text-label text-ink-2" style={clip}>No chat yet. Start a path to begin.</span>
  <Link to="/projects/new" className="flex min-h-11 shrink-0 items-center text-label font-semibold text-amber">New path</Link>
 </div>;
 const status=resume.pausedAt?relativeTime(resume.pausedAt):null;
 const description=resume.checkpointTitle??'Ready to study';
 const step=resume.stepsTotal>0?' · step '+Math.min(Math.max(1,resume.step),resume.stepsTotal)+' of '+resume.stepsTotal:'';
 const spoken=resumeSpoken(resume.projectTitle,description,step,status);
 return <div role="region" aria-label="Resume where you stopped" className="flex min-h-16 min-w-0 items-center gap-2 py-1">
  <span className="sr-only">{spoken}</span>
  <Glyph subject={resume.glyph} hue="slate" size={32}/>
  <div aria-hidden="true" className="min-w-0 flex-1">
   <p data-resume-title="" title={plainMath(resume.projectTitle)+step} style={clip} className="text-body font-medium text-ink"><FastHomeTex source={resume.projectTitle}/>{step}</p>
   <p data-resume-meta="" title={(status?'Paused '+status+' · ':'')+plainMath(description)}
    style={{...clip,fontSize:'13.5px',height:'24px',lineHeight:'24px'}} className="mt-1 text-caption text-ink-3">
    {/* KaTeX uses 1.21em; 13.5px metadata yields >=16px actual mathematics.
        Styling .katex at 16px via a nested utility loses to KaTeX's own rule. */}
    <span>{status?'Paused '+status+' · ':''}</span><FastHomeTex source={description}/>
   </p>
  </div>
  <button type="button" onClick={()=>onCopy(resume.projectTitle)} aria-label="Copy resume prompt"
   className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-ctl px-2 text-label font-medium text-ink-2 hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber">
   <Copy size={16} aria-hidden="true"/>Copy
  </button>
 </div>;
}

/** Keep the quiet Today estimate consistent with the Review hub's
 * 4.5-second-per-card fallback (used when no timed review history exists).
 * Only the configured daily share is estimated, never the whole backlog. */
export function estimatedReviewTime(due:number,roundLimit=200):string{
 const round=Math.min(Math.max(0,Number.isFinite(due)?due:0),Math.max(1,roundLimit));
 const minutes=Math.max(1,Math.ceil(round*4.5/60));
 if(minutes<90)return 'about '+minutes+' min';
 const hours=Math.floor(minutes/60),remaining=minutes%60;
 return 'about '+hours+' h'+(remaining?' '+remaining+' min':'');
}

/** One paper row replaces oversized summary tiles and the stacked deck bar. */
export function ReviewDesk({due,roundLimit=200}:{due:number;roundLimit?:number}){
 const hasDue=due>0;
 return <section aria-label="Review" className="flex min-w-0 flex-col gap-3">
  <SectionHeading className="text-ink">Review</SectionHeading>
  <Slab className="flex min-w-0 items-center gap-3 p-3">
   {hasDue?<div className="min-w-0 shrink-0">
    <p className="text-body font-semibold tabular-nums text-ink">{formatCount(due)} <span className="text-label font-normal text-ink-2">due</span></p>
    <p className="text-caption text-ink-3">{estimatedReviewTime(due,roundLimit)}</p>
   </div>:<div className="flex min-w-0 flex-1 items-start gap-2">
    <Check size={20} aria-hidden="true" className="mt-1 shrink-0" style={{color:'var(--early)'}}/>
    <div className="min-w-0">
     <p className="text-body font-semibold text-ink">All clear</p>
     <p className="text-caption text-ink-3">Nothing due right now. New reviews appear here when scheduled.</p>
     <div className="mt-2 max-w-[180px]"><Suspense fallback={null}><ReviewOutlook quiet/></Suspense></div>
    </div>
   </div>}
   {hasDue&&<div className="min-w-0 flex-1"><ForecastOnDemand defer={false}/></div>}
   <Link to="/review" aria-label={hasDue?'Start review of '+due+' cards':'Open review'}
    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-ctl px-3 text-label font-semibold focus-visible:outline-2 focus-visible:outline-amber" style={{background:'var(--accent)',color:'var(--on-accent)'}}>
    {hasDue?'Start':'Review'}
   </Link>
  </Slab>
 </section>;
}

/** Tutor inbox and last-chat handoff are one paper surface. An empty
 * inbox disappears rather than repeating the navigation dot's status. */
export function TutorHandoff({home,onCopy}:{home:HomeSummary;onCopy:(projectTitle:string)=>void}){
 return <Slab as="section" aria-label="Study handoff" className="flex min-w-0 flex-col gap-0 p-3">
   {home.pendingProposals>0&&<section aria-label="From your tutor" className="flex min-w-0 flex-col gap-2">
    <SectionHeading className="text-ink">From your tutor</SectionHeading>
    <Link to="/proposals" aria-label={'Review '+home.pendingProposals+' tutor proposals'}
     className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-ctl px-1 py-2 text-label text-ink-2 focus-visible:outline-2 focus-visible:outline-amber">
     <span className="min-w-0 break-words">{home.pendingProposals} tutor proposals awaiting your decision</span>
     <ChevronRight size={16} className="shrink-0 text-ink-2" aria-hidden="true"/>
    </Link>
   </section>}
   <section aria-label="Continue" className={'flex min-w-0 flex-col gap-2'+(home.pendingProposals>0?' mt-3 border-t border-edge pt-3':'')}>
    <SectionHeading className="text-ink">Continue</SectionHeading>
    <ResumeCard home={home} onCopy={onCopy}/>
   </section>
  </Slab>;
}

export default function Page(){
 const home=useHome(),settings=useSettings(),notify=useToast();
 // Live Today must not expose navigation while a deferred owner-scoped outlook
 // RPC can still leak into Insights' one-request budget. Prefetch both views
 // through the same React Query keys consumed by ReviewOutlook, then reveal
 // the desk once the bounded live RPC has settled. Local demo remains lazy.
 const live=getMode()==='live';
 const liveDecks=useQuery({queryKey:['decks'],queryFn:()=>getApi().getDeckTree(),enabled:live,staleTime:30_000});
 const liveForecast=useQuery({queryKey:['review-forecast'],queryFn:()=>getApi().getReviewForecast(),enabled:live,staleTime:30_000});
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
 if((home.isPending && !home.data)||(live&&(liveDecks.isPending||liveForecast.isPending)))return <LoadingDesk/>;
 if(home.error || !home.data)return <Screen tabBar><TodayHeader pending={0}/>
  <EmptyState art={offline?'plug':'compass'} title={offline?'You are offline':"Couldn't load your desk"}
   body={offline?'Reconnect to resume studying.':'Your study data is safe. Try loading again.'}
   action={{label:'Try again',onClick:()=>{void home.refetch()}}}/>
 </Screen>;
 const projects=home.data.projects.filter(p=>!p.system&&p.status!=='archived')
  .sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||
   (Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0));
 return <Screen tabBar className="gap-6 pb-6">
  <TodayHeader pending={home.data.pendingProposals}/>
  {offline&&<div role="status" className="rounded-ctl border border-edge-2 bg-fill-1 p-3 text-label text-ink-2">
   You're offline. Changes cannot be saved until you're connected.
  </div>}
  {getMode()==='live'&&settings.data&&!settings.data.connectorLastSeenAt&&<Link to="/settings" aria-label="Connect your tutor"
   className="flex min-h-12 items-center justify-between gap-3 rounded-ctl border border-amber-line bg-amber-tint px-4 py-3 text-label text-ink-soft">
   <span><strong className="text-amber">Tutor not connected.</strong> Set up the connector in Settings to record study progress.</span>
   <ChevronRight size={18} className="shrink-0 text-amber"/>
  </Link>}
  {shouldUseFastGoals(projects)
   ? <FastGoalDistance projects={projects}/>
   : <Suspense fallback={<section aria-label="Distance to your goals" className="min-h-[160px]"><Skeleton h={160}/></section>}>
      <GoalDistance projects={projects} variant="metro"/>
     </Suspense>}
  <ReviewDesk due={home.data.due} roundLimit={settings.data?.reviewsPerDay??200}/>
  <TutorHandoff home={home.data} onCopy={title=>{void copyPrompt(resumePrompt(title))}}/>
 </Screen>;
}
