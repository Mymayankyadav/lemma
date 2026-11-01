import {Link} from 'react-router'
import {useProject} from '../../data/hooks'
import type {ProjectSummary,InsightData} from '../../data/types'
import {Route} from '../../ui/timeline/Route'
import {estimateFinish} from '../../ui/timeline/progress'
import {Slab} from '../../ui/Slab'
import {Glyph} from '../../ui/Glyph'
import {Skeleton} from '../../ui/Skeleton'
import {Tex} from '../../ui/Tex'
import {buildSchedule,scheduleHeadline} from '../../lib/schedule'

type Events=InsightData['checkpointEvents']

export default function GoalCard({project,events}:{project:ProjectSummary;events:Events|undefined}){
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

