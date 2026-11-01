import {useMemo} from 'react';
import {Link} from 'react-router';
import type {InsightData,ProjectSummary} from '../../data/types';
import {estimateFinish} from '../../ui/timeline/progress';
import {Route} from '../../ui/timeline/Route';
import {Slab} from '../../ui/Slab';
import {Glyph} from '../../ui/Glyph';
import {Tex} from '../../ui/Tex';
import {summaryRouteCheckpoints,summaryScheduleStatus} from './summaryRoute';

type Events=InsightData['checkpointEvents'];
const clip={overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'} as const;

/** The same v4 goal card at 36/40/100 checkpoints, using home_summary only.
 * No useProject N+1 query; the Route's passive marks come from stageProgress.
 */
export function SummaryGoalCard({project,events}:{project:ProjectSummary;events:Events|undefined}){
 const {checkpoints,scheduleRows,foldedLabel}=useMemo(()=>summaryRouteCheckpoints(project),[project]);
 const status=summaryScheduleStatus(project);
 const tone=/behind/i.test(status)?'var(--late)':/ahead/i.test(status)?'var(--early)':'var(--ink-2)';
 const estimate=estimateFinish({projectId:project.id,total:project.total,done:project.done,
  targetDate:project.targetDate,events});
 const target=project.targetDate;
 const targetDisplay=target?new Date(target+'T12:00:00').toLocaleDateString('en',{month:'short',day:'numeric'}):null;
 const finishDisplay=estimate.finish?.toLocaleDateString('en',{month:'short',day:'numeric'})??null;
 const footnote=finishDisplay||targetDisplay;
 return <Slab as="article" aria-label={'Goal progress for '+project.title}
  data-goal-card="" data-summary-goal=""
  className="flex min-w-0 flex-col gap-1 p-3"
  style={{scrollMarginBottom:'calc(var(--tab) + env(safe-area-inset-bottom) + 24px)'}}>
  <div className="flex min-w-0 items-start gap-2">
   <Glyph subject={project.subject?.glyph??'∫'} hue={project.subject?.hue??'slate'} size={32}/>
   <div className="min-w-0 flex-1">
    <Link to={'/p/'+project.slug} className="flex min-h-11 min-w-0 items-center text-[16px] font-semibold leading-5 text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
     <span style={clip} className="block min-w-0"><Tex source={project.title}/></span>
    </Link>
    {project.current&&<p className="min-w-0 text-[14px] leading-[18px] text-ink-2"
      style={clip} title={project.current.title}><Tex source={project.current.title}/></p>}
   </div>
   <span data-schedule-chip="" className="max-w-[108px] shrink-0 rounded-full bg-[var(--paper-2)] px-2 py-1 text-center text-[12px] font-medium leading-4"
    style={{color:tone}}>{status}</span>
  </div>
  {checkpoints.length>0?
   <Route project={project} checkpoints={checkpoints} scheduleRows={scheduleRows}
    foldedLabel={foldedLabel} mode="today" todayHasCurrent={!!project.current}
    todayLinkTo={!project.current?'/p/'+project.slug:undefined}
    todayLinkLabel={project.current?
     project.title+': Open the path for individual checkpoints and keyboard navigation. Current '+project.current.code:
     project.title+': Open the project to choose a checkpoint'}/>:
   <p className="text-label text-ink-3">No checkpoints yet. Ask your tutor to create a plan.</p>}
  {project.current&&<div data-goal-now="" className="flex min-h-5 min-w-0 items-center gap-2 text-[12px] leading-[18px] text-ink-2">
   <span data-code="" className="shrink-0 font-[var(--font-num)] text-[12px] text-[var(--accent)]">{project.current.code}</span>
   <span className="min-w-0 flex-1 text-[16px] leading-5 text-ink-2" style={clip}
    title={project.current.title}><Tex source={project.current.title}/></span>
   <span className="shrink-0 tabular-nums">{project.done} of {project.total}</span>
  </div>}
  <p data-goal-footnote="" className="min-w-0 border-t border-[var(--hair)] pt-1 text-[12px] leading-[16px] text-ink-3"
   style={clip} title={footnote?'Projected finish and target':'No target date yet'}>
   {footnote?<>
    {finishDisplay&&<>Finish ≈ <span className="text-ink">{finishDisplay}</span></>}
    {targetDisplay&&<> · target <time dateTime={target!}>{targetDisplay}</time></>}
    {estimate.spare!==null&&<span style={{color:estimate.spare<=0?'var(--late)':'var(--ink-3)'}}>
     {' · '+(estimate.spare>=0?estimate.spare+' days spare':Math.abs(estimate.spare)+' days late')}
    </span>}
   </>:<>{project.total} checkpoints planned · no target date yet</>}
  </p>
 </Slab>;
}
