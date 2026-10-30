import {Link} from 'react-router'
import {useProject,useInsightData} from '../../data/hooks'
import type {ProjectSummary,InsightData} from '../../data/types'
import {ProjectTimeline} from '../../ui/timeline/ProjectTimeline'
import {Slab} from '../../ui/Slab'
import {Glyph} from '../../ui/Glyph'
import {Skeleton} from '../../ui/Skeleton'

const DAY=86_400_000
function goalEstimate(project:ProjectSummary,events:InsightData['checkpointEvents'],now=Date.now()){
 const since=now-28*DAY
 const distinct=new Set(events.filter(e=>e.projectId===project.id&&e.kind==='demonstrated'
  &&Date.parse(e.at)>=since&&Date.parse(e.at)<=now).map(e=>e.checkpointCode))
 // A single checkpoint per four weeks is the agreed conservative floor.
 const pace=Math.max(1,distinct.size)/4
 const finish=new Date(now+Math.max(0,project.total-project.done)/pace*7*DAY)
 const day=finish.toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'})
 const target=project.targetDate
 const spare=target?Math.floor((Date.parse(target+'T23:59:59Z')-finish.getTime())/DAY):null
 return {pace,day,spare,baseline:distinct.size===0}
}
function GoalCard({project,variant,events}:{project:ProjectSummary;variant:'ascent'|'metro';events:InsightData['checkpointEvents']|undefined}){
 const detail=useProject(project.slug)
 const pct=project.total?Math.round(100*project.done/project.total):0
 const estimate=events&&project.total>0?goalEstimate(project,events):null
 const target=project.targetDate
 const targetDisplay=target?new Date(target+'T12:00:00').toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):null
 return <Slab as="article" aria-label={'Goal progress for '+project.title} className="flex min-w-0 flex-col gap-3 p-4">
  <div className="flex min-w-0 items-start gap-3">
   <Glyph subject={project.subject.glyph} hue={project.subject.hue} size={32}/>
   <div className="min-w-0 flex-1">
    <Link to={'/p/'+project.slug} className="block break-words font-semibold text-headline text-ink focus-visible:outline-2 focus-visible:outline-amber">{project.title}</Link>
    <p className="mt-1 text-label leading-snug text-ink-2">
     {project.done}/{project.total} checkpoints{project.current?', now '+project.current.code+' '+project.current.title:''}
    </p>
   </div>
   <strong className="shrink-0 font-[var(--font-display)] text-title-s tabular-nums text-amber">{pct}%</strong>
  </div>
  {detail.isPending?<Skeleton h={85}/>:detail.data?.checkpoints.length?
   <ProjectTimeline project={project} checkpoints={detail.data.checkpoints} variant={variant} height={80}/>:
   <p className="text-label text-ink-3">No checkpoints yet. Ask your tutor to create a plan.</p>}
  {estimate&&<p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-label leading-snug text-ink-2">
   <span>Finish ≈ <strong className="text-ink">{estimate.day}</strong></span>
   <span className="text-ink-3">at {estimate.pace.toFixed(2)}/wk{estimate.baseline?' (baseline)':''}</span>
   {targetDisplay&&<span className="basis-full">
    <strong className="text-amber">{project.targetLabel??'Target'}:</strong>{' '}
    <time dateTime={target!}>{targetDisplay}</time>
    {estimate.spare!==null&&<span className={estimate.spare>=0?'text-easy':'text-hard'}>
     {' · '+(estimate.spare>=0?estimate.spare+' days spare':Math.abs(estimate.spare)+' days late')}
    </span>}
   </span>}
  </p>}
 </Slab>
}

export function GoalDistance({projects,variant='ascent'}:{projects:ProjectSummary[];variant?:'ascent'|'metro'}){
 const active=projects.filter(project=>project.status==='active')
 const insight=useInsightData(30)
 return <section aria-label="Distance to your goals" className="flex min-w-0 flex-col gap-3">
  <div className="flex min-h-11 items-center justify-between gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">Distance to your goals</h2>
   <Link to="/projects" className="flex min-h-11 items-center text-label text-amber">All paths</Link>
  </div>
  {active.length===0?<p className="text-label text-ink-2">Create a project and plan to begin tracking your goals.</p>:
   active.map(project=><GoalCard key={project.id} project={project} variant={variant} events={insight.data?.checkpointEvents}/>)}
 </section>
}
