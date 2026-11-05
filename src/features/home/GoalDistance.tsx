import {lazy,Suspense,useState} from 'react'
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
/** Today keeps the same goal information on either side of the 14-checkpoint
 * boundary. Large paths use bounded stage aggregates from home_summary rather
 * than fetching every checkpoint or showing the old percentage-only summary. */
export function SummaryGoalCard({project,events}:{project:ProjectSummary;events:Events|undefined}){
 const pct=project.total?Math.round(100*project.done/project.total):0
 const remaining=Math.max(0,project.total-project.done)
 const estimate=estimateFinish({
  projectId:project.id,total:project.total,done:project.done,
  targetDate:project.targetDate,events,
 })
 const status=project.scheduleHeadline??'Not started'
 const tone=/behind/i.test(status)?'var(--late)':/ahead/i.test(status)?'var(--early)':'var(--ink-2)'
 const finishDisplay=estimate.finish?.toLocaleDateString('en',{day:'numeric',month:'short'})??null
 const targetDisplay=project.targetDate?new Date(project.targetDate+'T12:00:00').toLocaleDateString('en',{month:'short',day:'numeric'}):null
 return <Slab as="article" aria-label={'Goal progress for '+project.title}
  data-goal-card="" data-summary-goal="" className="flex min-w-0 flex-col gap-1 p-3"
  style={{scrollMarginBottom:'calc(var(--tab) + env(safe-area-inset-bottom) + 24px)'}}>
  <div className="flex min-w-0 items-start gap-2">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <div className="min-w-0 flex-1">
    <Link to={'/p/'+project.slug}
     className="flex min-h-11 items-center break-words text-[16px] font-semibold leading-5 text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
     <FastHomeTex source={project.title}/>
    </Link>
   </div>
   <div className="flex shrink-0 flex-col items-end gap-1">
    <strong className="font-[var(--font-display)] text-title-s tabular-nums text-ink-2">{pct}%</strong>
    <span data-schedule-chip="" className="max-w-[110px] rounded-full bg-[var(--paper-2)] px-2 py-1 text-center text-[12px] font-medium leading-4"
     style={{color:tone}}>{status}</span>
   </div>
  </div>
  <div className="flex min-h-11 items-center gap-3" aria-label={'Stage Metro for '+project.title}>
   <MiniStageBar project={project}/>
  </div>
  {project.current?<div data-goal-now="" className="flex min-w-0 items-center gap-2 text-[12px] leading-[18px] text-ink-2">
   <span className="sr-only">Next checkpoint: </span>
   <span data-code="" className="shrink-0 font-[var(--font-num)] text-[12px] text-[var(--accent)]">{project.current.code}</span>
   <span className="min-w-0 flex-1 break-words text-[16px] leading-5 text-ink-2"><FastHomeTex source={project.current.title}/></span>
   <span data-goal-distance="" aria-label={'Distance to goal: '+remaining+' checkpoints remaining'}
    className="shrink-0 tabular-nums">{project.done} of {project.total}</span>
  </div>:<p className="text-label text-ink-3">
   {project.total===0?'No checkpoints yet. Ask your tutor to create a plan.':'No active checkpoint.'}
   <span data-goal-distance="" aria-label={'Distance to goal: '+remaining+' checkpoints remaining'} className="ml-2 tabular-nums">{project.done} of {project.total}</span>
  </p>}
  {(finishDisplay||targetDisplay)&&<p data-goal-footnote="" className="min-w-0 border-t border-[var(--hair)] pt-1 text-[12px] leading-[16px] text-ink-3">
   {finishDisplay&&<>Finish ≈ <span className="text-ink">{finishDisplay}</span></>}
   {targetDisplay&&<> · target <time dateTime={project.targetDate!}>{targetDisplay}</time></>}
   {estimate.spare!==null&&<span style={{color:estimate.spare<=0?'var(--late)':'var(--ink-3)'}}>
    {' · '+(estimate.spare>=0?estimate.spare+' days spare':Math.abs(estimate.spare)+' days late')}
   </span>}
  </p>}
 </Slab>
}

export function GoalDistance({projects}:{projects:ProjectSummary[];variant?:'ascent'|'metro'}){
 const active=projects.filter(project=>project.status==='active').sort(urgency)
 const [showRest,setShowRest]=useState(false)
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
    {featured.map(project=>project.total>14?
     <SummaryGoalCard key={project.id} project={project} events={insight.data?.checkpointEvents}/>:
     <Suspense key={project.id} fallback={<Skeleton h={200}/>}> 
      <GoalCard project={project} events={insight.data?.checkpointEvents}/>
     </Suspense>)}
    {rest.length>0&&<div className="min-w-0 rounded-slab border border-edge bg-[var(--card)] p-2" data-compact-goals="">
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
