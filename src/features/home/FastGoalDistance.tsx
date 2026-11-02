// Eager entry for large desks; keeps the exact bounded Metro/goal behaviour.
// The small-desk GoalDistance remains a separate lazy route chunk.
import {lazy,Suspense,useEffect,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {getApi} from '../../data'
import {getMode,getDemoProfile} from '../../data/mode'
import {Link} from 'react-router'
import type {ProjectSummary,InsightData} from '../../data/types'
import {MiniStageBar} from '../../ui/timeline/MiniStageBar'
import {estimateFinish} from '../../ui/timeline/progress'
import {Slab} from '../../ui/Slab'
import {Glyph} from '../../ui/Glyph'
import {Skeleton} from '../../ui/Skeleton'
import {FastHomeTex} from './FastHomeTex'
import {shouldStageSecondaryGoals} from './fastGoalPolicy'

type Events=InsightData['checkpointEvents']
// The full interactive checkpoint Metro is needed only for small projects.
// Stress Today shows bounded summaries, so do not parse that route's timeline
// and schedule modules before the first meaningful desk paint.
const GoalCard=lazy(()=>import('./GoalCard'))
const behind=(project:ProjectSummary)=>/behind/i.test(project.scheduleHeadline??'')||
 (!!project.targetDate&&Date.parse(project.targetDate)<Date.now()&&project.done<project.total)
const urgency=(a:ProjectSummary,b:ProjectSummary)=>{
 const schedule=Number(behind(b))-Number(behind(a))
 if(schedule)return schedule
 const target=(p:ProjectSummary)=>p.targetDate?Date.parse(p.targetDate):Number.POSITIVE_INFINITY
 if(target(a)!==target(b))return target(a)-target(b)
 return (Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0)
}

/** Above the 14-station switch point, Today uses the bounded project
 * summary already returned by home_summary(). Loading full project details
 * for each of 60 projects would violate the three-request Today budget.
 * The project page retains the full interactive stage Metro. */
function SummaryGoalCard({project,events}:{project:ProjectSummary;events:Events|undefined}){
 const pct=project.total?Math.round(100*project.done/project.total):0
 const estimate=estimateFinish({
  projectId:project.id,total:project.total,done:project.done,
  targetDate:project.targetDate,events,
 })
 return <Slab as="article" aria-label={'Goal progress for '+project.title}
  className="flex min-w-0 flex-col gap-3 p-4" data-summary-goal="">
  <div className="flex min-w-0 items-start gap-3">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <div className="min-w-0 flex-1">
    <Link to={'/p/'+project.slug}
     className="flex min-h-11 items-center break-words font-semibold text-headline text-ink">
     <FastHomeTex source={project.title}/>
    </Link>
    <p className="text-label leading-snug text-ink-2">
     {project.done}/{project.total} checkpoints
     {project.current&&<>, now {project.current.code} <FastHomeTex source={project.current.title}/></>}
    </p>
   </div>
   <div className="flex shrink-0 flex-col items-end gap-1">
    <strong className="font-[var(--font-display)] text-title-s tabular-nums text-ink-2">{pct}%</strong>
    {project.scheduleHeadline&&<span data-schedule-chip="" className="text-caption font-semibold text-ink-2">{project.scheduleHeadline}</span>}
   </div>
  </div>
  <div className="flex min-h-11 items-center gap-3" aria-label={'Stage Metro for '+project.title}>
   <MiniStageBar project={project}/>
  </div>
  <p className="text-label text-ink-3">
   {project.stageProgress?.length??Math.ceil(project.total/8)} groups ·
   {' '}Open the path for individual checkpoints and keyboard navigation
  </p>
  {estimate.finish&&<p className="text-label text-ink-2">
   Finish ≈ <strong className="text-ink">{estimate.finish.toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'})}</strong>
   {' · '}{estimate.source==='plan'?'from your plan':'measured pace'}
  </p>}
 </Slab>
}

export function FastGoalDistance({projects}:{projects:ProjectSummary[];variant?:'ascent'|'metro'}){
 const active=projects.filter(project=>project.status==='active').sort(urgency)
 const stageSecondary=shouldStageSecondaryGoals(active.length)
 const [stagedReady,setSecondaryReady]=useState(false)
 const secondaryReady=!stageSecondary||stagedReady
 const [showRest,setShowRest]=useState(false)
 // Small desks are unchanged. On a large live/default desk, reveal the
 // below-fold cards after two animation frames. S/X uses the actual visible
 // first-goal paint signal below instead, so the extra bars/ResizeObservers
 // cannot compete with the strict first meaningful paint.
 useEffect(()=>{
  if(!stageSecondary||(getMode()==='demo'&&getDemoProfile()!=='default'))return
  let second=0
  const first=requestAnimationFrame(()=>{
   second=requestAnimationFrame(()=>setSecondaryReady(true))
  })
  return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second)}
 },[stageSecondary])
 // Record the first committed, data-backed goal UI; this is a local
 // performance mark, not analytics and not a substitute for the hard gate.
 useEffect(()=>{
  if(getMode()!=='demo'||getDemoProfile()==='default')return
  if(performance.getEntriesByName('lemma-stress-goal-mounted','mark').length===0)
   performance.mark('lemma-stress-goal-mounted');
  // A React commit is not a painted screen. Record the first *visible* goal
  // after two consecutive animation frames, including initial navigation,
  // fixture hydration and the actual shell fade. No live-user analytics.
  // The strict ST-0 budget consumes this browser-clock mark, never a timer
  // that includes Playwright's separate scroll and screenshot preparations.
  let frame=0,previousFrameVisible=false
  const inspect=()=>{
   const goal=document.querySelector<HTMLElement>('[data-summary-goal]')
   const rect=goal?.getBoundingClientRect()
   // The first goal must actually intersect the painted viewport, not
   // merely exist below the fold or in an offscreen cached subtree.
   let visible=!!rect&&rect.width>0&&rect.height>0&&
    rect.top<window.innerHeight&&rect.bottom>0&&rect.left<window.innerWidth&&rect.right>0
   for(let el:Element|null=goal??null;visible&&el;el=el.parentElement){
    const style=getComputedStyle(el)
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<0.99)
     visible=false
    if(el.id==='main-content')break
   }
   if(visible&&previousFrameVisible){
    if(performance.getEntriesByName('lemma-stress-first-goal-paint','mark').length===0)
     performance.mark('lemma-stress-first-goal-paint')
    // Do not alter the paint mark or count a skeleton as ready. Secondary
    // below-fold cards mount only on the next frame after this real paint.
    if(stageSecondary)frame=requestAnimationFrame(()=>setSecondaryReady(true))
    return
   }
   previousFrameVisible=visible
   frame=requestAnimationFrame(inspect)
  }
  frame=requestAnimationFrame(inspect)
  return ()=>cancelAnimationFrame(frame)
 },[stageSecondary])
 // Live and S/X stress Insights return bounded aggregates with no checkpoint
 // events. Querying them on cold Today cannot improve goal pace, but competes
 // with the first meaningful Route paint under 4x CPU. The small default demo
 // retains its actual checkpoint-event pace calculation.
 const insight=useQuery({queryKey:['insights',30],queryFn:()=>getApi().getInsightData(30),
  enabled:getMode()==='demo'&&getDemoProfile()==='default'})
 const featured=active.slice(0,3),rest=active.slice(3)
 const behindCount=rest.filter(behind).length
 return <section aria-label="Distance to your goals" className="flex min-w-0 flex-col gap-3">
  <div className="flex min-h-11 items-center justify-between gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">Distance to your goals</h2>
   <Link to="/projects" className="flex min-h-11 items-center text-label text-ink-2 underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]">All paths</Link>
  </div>
  {active.length===0?<p className="text-label text-ink-2">Create a project and plan to begin tracking your goals.</p>:
   <>
    {(secondaryReady?featured:featured.slice(0,1)).map(project=>project.total>14?
     <SummaryGoalCard key={project.id} project={project} events={insight.data?.checkpointEvents}/>:
     <Suspense key={project.id} fallback={<Skeleton h={200}/>}> 
      <GoalCard project={project} events={insight.data?.checkpointEvents}/>
     </Suspense>)}
    {secondaryReady&&rest.length>0&&<div className="min-w-0 rounded-slab border border-edge bg-[var(--card)] p-2" data-compact-goals="">
     <p className="px-2 py-2 text-label font-semibold text-ink-2">
      {rest.length} more · {rest.length-behindCount} on schedule, {behindCount} behind
     </p>
     {rest.slice(0,showRest?rest.length:3).map(project=><div key={project.id}
      className="flex min-h-11 items-center gap-2 border-t border-edge px-2 py-1" data-compact-goal={project.slug}>
      <Link className="flex min-h-11 min-w-0 flex-[2] items-center truncate text-label text-ink" to={'/p/'+project.slug}><FastHomeTex source={project.title}/></Link>
      <MiniStageBar project={project}/>
      <span className="w-9 shrink-0 text-right text-caption tabular-nums text-ink-2">{project.total?Math.round(project.done/project.total*100):0}%</span>
     </div>)}
     {rest.length>3&&<button type="button" onClick={()=>setShowRest(value=>!value)}
      aria-expanded={showRest} className="min-h-11 w-full text-label text-ink-2">
      {showRest?'Show fewer':'Show all '+rest.length+' projects'}
     </button>}
    </div>}
   </>}
 </section>
}
