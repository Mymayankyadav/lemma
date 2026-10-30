import {Link} from 'react-router'
import {useProject} from '../../data/hooks'
import type {ProjectSummary} from '../../data/types'
import {ProjectTimeline} from '../../ui/timeline/ProjectTimeline'
import {Slab} from '../../ui/Slab'
import {Glyph} from '../../ui/Glyph'
import {Skeleton} from '../../ui/Skeleton'

function GoalCard({project,variant}:{project:ProjectSummary;variant:'ascent'|'metro'}){
 const detail=useProject(project.slug)
 const pct=project.total?Math.round(100*project.done/project.total):0
 const target=project.targetDate
 const targetDisplay=target?new Date(target+'T12:00:00').toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):null
 return <Slab as="article" aria-label={'Goal progress for '+project.title} className="flex min-w-0 flex-col gap-3 p-4">
  <div className="flex min-w-0 items-start gap-3">
   <Glyph subject={project.subject.glyph} hue={project.subject.hue} size={28}/>
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
  {targetDisplay&&<p className="flex flex-wrap gap-1 text-label leading-snug text-ink-2">
   <span className="font-semibold text-amber">{project.targetLabel??'Target'}:</span>
   <time dateTime={target!}>{targetDisplay}</time>
   <span className="text-ink-3">· Finish estimate available after checkpoint evidence</span>
  </p>}
 </Slab>
}

export function GoalDistance({projects,variant='ascent'}:{projects:ProjectSummary[];variant?:'ascent'|'metro'}){
 const active=projects.filter(project=>project.status==='active')
 return <section aria-label="Distance to your goals" className="flex min-w-0 flex-col gap-3">
  <div className="flex min-h-11 items-center justify-between gap-3">
   <h2 className="font-[var(--font-display)] text-title-s italic text-ink">Distance to your goals</h2>
   <Link to="/projects" className="flex min-h-11 items-center text-label text-amber">All paths</Link>
  </div>
  {active.length===0?<p className="text-label text-ink-2">Create a project and plan to begin tracking your goals.</p>:
   active.map(project=><GoalCard key={project.id} project={project} variant={variant}/>)}
 </section>
}
