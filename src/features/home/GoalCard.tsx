import {Link} from 'react-router'
import {useProject} from '../../data/hooks'
import type {ProjectSummary,InsightData} from '../../data/types'
import {ProjectTimeline} from '../../ui/timeline/ProjectTimeline'
import {estimateFinish} from '../../ui/timeline/progress'
import {Slab} from '../../ui/Slab'
import {Glyph} from '../../ui/Glyph'
import {Skeleton} from '../../ui/Skeleton'
import {Tex} from '../../ui/Tex'
import {buildSchedule,scheduleHeadline} from '../../lib/schedule'

type Events=InsightData['checkpointEvents']

export default function GoalCard({project,variant,events}:{project:ProjectSummary;variant:'ascent'|'metro';events:Events|undefined}){
 const detail=useProject(project.slug)
 const pct=project.total?Math.round(100*project.done/project.total):0
 const estimate=estimateFinish({projectId:project.id,total:project.total,done:project.done,
  targetDate:project.targetDate,events,dueDates:detail.data?.checkpoints.filter(cp=>cp.ui!=='done'&&cp.ui!=='revisit').map(cp=>cp.dueOn)})
 const target=project.targetDate
 const schedule=detail.data?buildSchedule(detail.data.checkpoints,{targetDate:target,pacePerWeek:estimate.pace??undefined}):[]
 const status=project.scheduleHeadline??scheduleHeadline(schedule)
 const targetDisplay=target?new Date(target+'T12:00:00').toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):null
 return <Slab as="article" aria-label={'Goal progress for '+project.title} className="flex min-w-0 flex-col gap-3 p-4">
  <div className="flex min-w-0 items-start gap-3">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <div className="min-w-0 flex-1">
    <Link to={'/p/'+project.slug} className="flex min-h-11 items-center break-words font-semibold text-headline text-ink focus-visible:outline-2 focus-visible:outline-amber"><Tex source={project.title}/></Link>
    <p className="mt-1 text-label leading-snug text-ink-2">
     {project.done}/{project.total} checkpoints{project.current&&<>, now {project.current.code} <Tex source={project.current.title}/></>}
    </p>
   </div>
   <div className="flex shrink-0 flex-col items-end gap-1"><strong className="font-[var(--font-display)] text-title-s tabular-nums text-amber">{pct}%</strong>
    {status&&<span data-schedule-chip="" className="text-caption font-semibold text-ink-2">{status}</span>}</div>
  </div>
  {detail.isPending?<Skeleton h={85}/>:detail.data?.checkpoints.length?
   <ProjectTimeline project={project} checkpoints={detail.data.checkpoints} variant={variant} pacePerWeek={estimate.pace??undefined} height={80}/>:
   <p className="text-label text-ink-3">No checkpoints yet. Ask your tutor to create a plan.</p>}
  {estimate.finish&&<p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-label leading-snug text-ink-2">
   <span>Finish ≈ <strong className="text-ink">{estimate.finish.toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'})}</strong></span>
   <span className="text-ink-3">{estimate.source==='plan'?'from your plan':'measured pace'}{estimate.pace!==null?' · '+estimate.pace.toFixed(2)+'/wk':''}</span>
   {targetDisplay&&<span className="basis-full">
    <strong className="text-amber"><Tex source={project.targetLabel??'Target'}/>:</strong>{' '}
    <time dateTime={target!}>{targetDisplay}</time>
    {estimate.spare!==null&&<span className={estimate.spare>=0?'text-easy':'text-hard'}>
     {' · '+(estimate.spare>=0?estimate.spare+' days spare':Math.abs(estimate.spare)+' days late')}
    </span>}
   </span>}
  </p>}
 </Slab>
}

