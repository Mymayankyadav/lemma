import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {getApi} from '../../data'
import {getMode} from '../../data/mode'
import {Link} from 'react-router'
import {useProject} from '../../data/hooks'
import type {ProjectSummary,InsightData} from '../../data/types'
import {Route} from '../../ui/timeline/Route'
import {MiniStageBar} from '../../ui/timeline/MiniStageBar'
import {estimateFinish} from '../../ui/timeline/progress'
import {Slab} from '../../ui/Slab'
import {Glyph} from '../../ui/Glyph'
import {Skeleton} from '../../ui/Skeleton'
import {Tex} from '../../ui/Tex'
import {buildSchedule,scheduleHeadline} from '../../lib/schedule'

type Events=InsightData['checkpointEvents']
const behind=(project:ProjectSummary)=>/behind/i.test(project.scheduleHeadline??'')||
 (!!project.targetDate&&Date.parse(project.targetDate)<Date.now()&&project.done<project.total)
const urgency=(a:ProjectSummary,b:ProjectSummary)=>{
 const schedule=Number(behind(b))-Number(behind(a))
 if(schedule)return schedule
 const target=(p:ProjectSummary)=>p.targetDate?Date.parse(p.targetDate):Number.POSITIVE_INFINITY
 if(target(a)!==target(b))return target(a)-target(b)
 return (Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0)
}

function GoalCard({project,events}:{project:ProjectSummary;events:Events|undefined}){
 const detail=useProject(project.slug)
 const estimate=estimateFinish({projectId:project.id,total:project.total,done:project.done,
  targetDate:project.targetDate,events,dueDates:detail.data?.checkpoints.filter(cp=>cp.ui!=='done'&&cp.ui!=='revisit').map(cp=>cp.dueOn)})
 const target=project.targetDate
 const schedule=detail.data?buildSchedule(detail.data.checkpoints,{targetDate:target,pacePerWeek:estimate.pace??undefined}):[]
 const status=project.scheduleHeadline??scheduleHeadline(schedule)??'Not started'
 const tone=/behind/i.test(status)?'var(--late)':/ahead/i.test(status)?'var(--early)':'var(--ink-2)'
 const targetDisplay=target?new Date(target+'T12:00:00').toLocaleDateString('en',{month:'short',day:'numeric'}):null
 const finishDisplay=estimate.finish?.toLocaleDateString('en',{day:'numeric',month:'short'})??null
 return <Slab as="article" aria-label={'Goal progress for '+project.title}
  data-goal-card="" className="flex min-w-0 flex-col gap-1 p-3"
  style={{scrollMarginBottom:"calc(var(--tab) + env(safe-area-inset-bottom) + 24px)"}}>
  <div className="flex min-w-0 items-start gap-2">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <div className="min-w-0 flex-1">
    <Link to={'/p/'+project.slug} className="flex min-h-11 items-center break-words text-[16px] font-semibold leading-5 text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Tex source={project.title}/></Link>
   </div>
   <span data-schedule-chip="" className="max-w-[110px] shrink-0 rounded-full bg-[var(--paper-2)] px-2 py-1 text-center text-[12px] font-medium leading-4"
    style={{color:tone}}>{status}</span>
  </div>
  {detail.isPending?<Skeleton h={64}/>:detail.data?.checkpoints.length?
   <Route project={project} checkpoints={detail.data.checkpoints} mode="today" pacePerWeek={estimate.pace??undefined}/>:
   <p className="text-label text-ink-3">No checkpoints yet. Ask your tutor to create a plan.</p>}
  {project.current&&<div data-goal-now="" className="flex min-w-0 items-center gap-2 text-[12px] leading-[18px] text-ink-2">
   <span data-code="" className="shrink-0 font-[var(--font-num)] text-[12px] text-[var(--accent)]">{project.current.code}</span>
   <span className="min-w-0 flex-1 break-words text-[16px] leading-5 text-ink-2"><Tex source={project.current.title}/></span>
   <span className="shrink-0 tabular-nums">{project.done} of {project.total}</span>
  </div>}
  {(finishDisplay||targetDisplay)&&<p data-goal-footnote="" className="min-w-0 border-t border-[var(--hair)] pt-1 text-[12px] leading-[16px] text-ink-3">
   {finishDisplay&&<>Finish ≈ <span className="text-ink">{finishDisplay}</span></>}
   {targetDisplay&&<> · target <time dateTime={target!}>{targetDisplay}</time></>}
   {estimate.spare!==null&&<span style={{color:estimate.spare<=0?'var(--late)':'var(--ink-3)'}}>
    {' · '+(estimate.spare>=0?estimate.spare+' days spare':Math.abs(estimate.spare)+' days late')}
   </span>}
  </p>}
 </Slab>
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
     <Tex source={project.title}/>
    </Link>
    <p className="text-label leading-snug text-ink-2">
     {project.done}/{project.total} checkpoints
     {project.current&&<>, now {project.current.code} <Tex source={project.current.title}/></>}
    </p>
   </div>
   <div className="flex shrink-0 flex-col items-end gap-1">
    <strong className="font-[var(--font-display)] text-title-s tabular-nums text-amber">{pct}%</strong>
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

export function GoalDistance({projects}:{projects:ProjectSummary[];variant?:'ascent'|'metro'}){
 const active=projects.filter(project=>project.status==='active').sort(urgency)
 const [showRest,setShowRest]=useState(false)
 // Live Insights returns aggregate charts, not checkpoint event rows; avoid
 // an unnecessary Today request. Demo keeps the existing measured-pace fixture.
 const insight=useQuery({queryKey:['insights',30],queryFn:()=>getApi().getInsightData(30),
  enabled:getMode()==='demo'})
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
     <GoalCard key={project.id} project={project} events={insight.data?.checkpointEvents}/>)}
    {rest.length>0&&<div className="min-w-0 rounded-slab border border-edge bg-[var(--card)] p-2" data-compact-goals="">
     <p className="px-2 py-2 text-label font-semibold text-ink-2">
      {rest.length} more · {rest.length-behindCount} on schedule, {behindCount} behind
     </p>
     {rest.slice(0,showRest?rest.length:3).map(project=><div key={project.id}
      className="flex min-h-11 items-center gap-2 border-t border-edge px-2 py-1" data-compact-goal={project.slug}>
      <Link className="flex min-h-11 min-w-0 flex-[2] items-center truncate text-label text-ink" to={'/p/'+project.slug}><Tex source={project.title}/></Link>
      <MiniStageBar project={project}/>
      <span className="w-9 shrink-0 text-right text-caption tabular-nums text-ink-2">{project.total?Math.round(project.done/project.total*100):0}%</span>
     </div>)}
     {rest.length>3&&<button type="button" onClick={()=>setShowRest(value=>!value)}
      aria-expanded={showRest} className="min-h-11 w-full text-label text-amber">
      {showRest?'Show fewer':'Show all '+rest.length+' projects'}
     </button>}
    </div>}
   </>}
 </section>
}
