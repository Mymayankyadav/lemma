import {SectionHeading} from '../../ui/SectionHeading';
import {scheduleForVisibleProject} from './scheduleCache';
import {Tex} from '../../ui/Tex';
import {useEffect,useId,useState} from 'react';
import {Link} from 'react-router';
import {ChevronRight} from 'lucide-react';
import {useInsightData,useProjects} from '../../data/hooks';
import type {CheckpointUi,CheckpointView,ProjectDetail} from '../../data/types';
import {Route} from '../../ui/timeline/Route';
import {Slab} from '../../ui/Slab';
import {Glyph} from '../../ui/Glyph';
import {Skeleton} from '../../ui/Skeleton';
import {scheduleHeadline,scheduleDate,scheduleColor,type ScheduledCheckpoint} from '../../lib/schedule';
import {currentCheckpointIndex,groupCheckpointStages,type ProgressStage} from '../../ui/timeline/progress';

type Stage=ProgressStage;

/** Keep tutor-defined stages; otherwise group consecutive checkpoints eight at a time. */
export const groupStages=groupCheckpointStages;

export function ProjectChips({detail,mode='project'}:{detail:ProjectDetail;mode?:'project'|'tab'}){
 const projects=useProjects();
 const options=projects.data?.length?projects.data:
  [{id:detail.project.id,slug:detail.project.slug,title:detail.project.title,subject:detail.subject}];
 return <nav aria-label="Choose a path" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
  {options.map(p=><Link key={p.id} to={mode==='tab'?'/projects?project='+encodeURIComponent(p.slug):'/p/'+p.slug} aria-current={p.slug===detail.project.slug?'page':undefined}
   className={'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip border px-3 text-label font-medium focus-visible:outline-2 focus-visible:outline-amber '+
    (p.slug===detail.project.slug?'border-amber bg-amber-tint text-amber':'border-edge bg-fill-1 text-ink-2')}>
   <span className="font-math text-headline italic" aria-hidden="true">{p.subject.glyph}</span>{p.title}
  </Link>)}
 </nav>;
}

export function GoalOverview({detail}:{detail:ProjectDetail;variant?:'ascent'|'metro'}){
 const insight=useInsightData(30);
 const {project,subject,checkpoints,done,total}=detail;
 const {estimate,rows:schedule}=scheduleForVisibleProject(detail,insight.data?.checkpointEvents);
 const headline=scheduleHeadline(schedule);
 const current=checkpoints.findIndex(cp=>cp.ui==='now');
 const pct=total?Math.round(done/total*100):0;
 const displayDate=(date:Date)=>date.toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'});
 const target=project.targetDate?new Date(project.targetDate+'T12:00:00'):null;
 return <section aria-label="Goal and distance" className="min-w-0">
  <Slab as="article" className="flex min-w-0 flex-col gap-3 p-4" data-card="">
   <div className="flex min-w-0 items-start gap-3">
    <Glyph subject={subject.glyph} hue={subject.hue} size={32}/>
    <div className="min-w-0 flex-1">
     <h2 className="break-words font-[var(--font-display)] text-title-s font-semibold"><Tex source={project.title}/></h2>
     <p className="mt-1 break-words text-label leading-relaxed text-ink-2"><Tex source={project.goal?.trim()||'Your tutor fills this in'}/></p>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1"><strong data-count-role="" className="font-[var(--font-ui)] text-title-s tabular-nums text-amber">{pct}%</strong>
     {headline&&<span data-schedule-chip="" className="text-caption font-semibold text-ink-2">{headline}</span>}</div>
   </div>
   <section aria-label="Checkpoint progress" className="flex flex-wrap items-baseline gap-1 text-label text-ink-2">
    <strong data-count-role="" className="font-[var(--font-ui)] text-title-s tabular-nums text-ink">{done}</strong>
    <span>of {total} checkpoints done</span>
    {current>=0&&<span className="ml-auto text-amber">{checkpoints[current].code} now</span>}
   </section>
   <div role="region" aria-label="Project timeline" className="min-w-0">
    <Route project={{title:project.title,slug:project.slug,done,total,targetDate:project.targetDate}} checkpoints={checkpoints}
     mode="project" pacePerWeek={estimate.pace??undefined} scheduleRows={schedule}/>
    {schedule.some(row=>row.dueOn)&&<div aria-label="Schedule legend" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
     {(['early','on_time','late'] as const).map(state=><span key={state} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-[3px] w-5" style={{background:scheduleColor[state]}}/>{state==='on_time'?'On time':state==='early'?'Early':'Late'}</span>)}
    </div>}
   </div>
   {total>0&&<div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-edge pt-3 text-label leading-relaxed text-ink-2">
    {estimate.finish&&<span>Finish ≈ <time dateTime={estimate.finish.toISOString().slice(0,10)}
     className="font-semibold text-ink">{displayDate(estimate.finish)}</time></span>}
    {estimate.finish&&<span>{estimate.source==='plan'?'from your plan':'measured pace'}{estimate.pace!==null?' · '+estimate.pace.toFixed(2)+'/wk':''}</span>}
    {target&&<span className="basis-full">
     <span className="font-semibold text-amber">{project.targetLabel??'Target'}:</span>{' '}
     <time dateTime={project.targetDate!}>{displayDate(target)}</time>
     {estimate.spare!==null&&<span className={estimate.spare>=0?'text-easy':'text-hard'}>
      {' · '+(estimate.spare>=0?estimate.spare+' days spare':Math.abs(estimate.spare)+' days late')}
     </span>}
    </span>}
   </div>}
   {insight.isPending&&<Skeleton h={4}/>}
  </Slab>
 </section>;
}

const labels:Record<CheckpointUi,string>={
 done:'done',revisit:'re-check',now:'in progress',next:'up next',locked:'locked',proposed:'proposed'
};
const marks:Record<CheckpointUi,string>={
 done:'border-amber bg-amber',revisit:'border-hard bg-amber-tint',
 now:'border-[3px] border-amber bg-raised',next:'border-ink-2 bg-raised',
 locked:'border-dotted border-edge-3 opacity-70',proposed:'border-dashed border-amber'
};

function StageCard({stage,slug,open,onToggle,schedule}:{stage:Stage;slug:string;open:boolean;onToggle:()=>void;schedule:Map<string,ScheduledCheckpoint>}){
 const id=useId(),[showFinished,setShowFinished]=useState(false);
 const finished=stage.checkpoints.filter(cp=>cp.ui==='done');
 const pending=stage.checkpoints.filter(cp=>cp.ui!=='done');
 const done=stage.checkpoints.filter(cp=>cp.ui==='done'||cp.ui==='revisit').length;
 const total=stage.checkpoints.filter(cp=>cp.ui!=='proposed').length;
 const progress=total?Math.round(done/total*100):0;
 // Collapsed stages keep their accessible headers and counts, but never mount
 // hidden checkpoint links or their potentially expensive KaTeX trees.
 const rows=open?(showFinished?stage.checkpoints:pending):[];
 return <Slab as="article" aria-label={stage.name+' stage'} className="min-w-0 p-0" data-card="" data-stage-card={stage.key}>
  <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
   className="flex min-h-12 w-full items-center gap-2 px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-amber">
   <ChevronRight size={16} aria-hidden="true" className={'shrink-0 text-ink-3 transition-transform '+(open?'rotate-90':'')}/>
   <strong className="min-w-0 flex-1 break-words font-[var(--font-display)] text-headline font-semibold"><Tex source={stage.name}/></strong>
   <span role="img" aria-label={progress+' percent complete'} className="h-1 w-16 shrink-0 overflow-hidden rounded-[1px] bg-fill-2">
    <span className="block h-full bg-ink-2" style={{width:progress+'%'}}/>
   </span>
   <span className="w-9 shrink-0 text-right text-label tabular-nums text-ink-2">{done}/{total}</span>
  </button>
  <div id={id} hidden={!open} className="px-2 pb-2">
   {open&&finished.length>0&&<button type="button" data-done-summary=""
    aria-expanded={showFinished} onClick={()=>setShowFinished(value=>!value)}
    className="flex min-h-11 w-full items-center justify-between rounded-ctl border-t border-edge px-2 text-left text-label text-ink-2">
    <span>{finished.length} done ✓</span><span className="text-ink-2">{showFinished?'Hide':'Show'}</span>
   </button>}
   {rows.map((cp,index)=><Link key={cp.id} to={'/p/'+slug+'/cp/'+encodeURIComponent(cp.code)}
    data-cp-row="" aria-label={cp.code+' '+cp.title+', '+labels[cp.ui]}
    className={'flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 py-2 text-left hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber '+
     (index?'border-t border-edge':'')}>
    <span aria-hidden="true" className={'size-[14px] shrink-0 rounded-full border-[1.5px] '+marks[cp.ui]}/>
    <span className="w-[46px] shrink-0 rounded-code text-label tabular-nums text-ink-3">{cp.code}</span>
    <span className={'min-w-0 flex-1 break-words text-body '+(cp.ui==='locked'?'text-ink-3':'text-ink')}><Tex source={cp.title}/>
     {schedule.get(cp.id)?.dueOn&&<span className="block text-caption text-ink-3">Planned {scheduleDate(schedule.get(cp.id)!.dueOn!)}</span>}</span>
    <span className={'max-w-[84px] shrink-0 text-right text-caption '+(cp.ui==='revisit'?'text-hard':cp.ui==='proposed'||cp.ui==='now'?'text-amber':'text-ink-3')}>
     {cp.ui==='now'&&cp.stepsTotal>0?cp.currentStep+'/'+cp.stepsTotal:labels[cp.ui]}
    </span>
   </Link>)}
  </div>
 </Slab>;
}

export function Stages({detail}:{detail:ProjectDetail}){
 const stages=groupStages(detail.checkpoints);
 const currentIndex=currentCheckpointIndex(detail.checkpoints);
 const initial=Math.max(0,stages.findIndex(stage=>stage.start<=currentIndex&&stage.end>=currentIndex));
 const [openStage,setOpenStage]=useState(initial);
 useEffect(()=>{setOpenStage(initial)},[detail.project.slug,initial]);
 const insight=useInsightData(30);
 const {rows}=scheduleForVisibleProject(detail,insight.data?.checkpointEvents);
 const schedule=new Map(rows.map(row=>[row.checkpoint.id,row]));
 return <section aria-label="Stages" className="flex min-w-0 flex-col gap-2">
  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
   <SectionHeading>Stages</SectionHeading>
   <span className="text-label text-ink-3">{stages.length} {stages.length===1?'stage':'stages'}, {detail.total} checkpoints</span>
  </div>
  {stages.length>5&&<nav aria-label="Jump to stage" className="flex min-w-0 gap-2 overflow-x-auto pb-1" data-stage-jumps="">
   {stages.map((stage,i)=><button key={stage.key} type="button" data-stage-chip={i}
    aria-pressed={openStage===i} onClick={()=>setOpenStage(i)}
    className={'flex min-h-11 min-w-11 max-w-44 shrink-0 items-center gap-1 overflow-hidden rounded-chip border px-3 text-label '+
     (openStage===i?'border-amber bg-amber-tint text-amber':'border-edge bg-fill-1 text-ink-2')}>
    <span className="shrink-0">{i+1}.</span>
    <span data-stage-chip-label className="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap"
     style={{overflowX:'auto',whiteSpace:'nowrap',maskImage:'linear-gradient(to right, black 85%, transparent)',
      fontSize:stage.name.includes('$')||stage.name.includes('\\')?'16px':undefined}}>
     <Tex source={stage.name}/>
    </span>
   </button>)}
  </nav>}
  {stages.map((stage,i)=><StageCard key={detail.project.slug+'/'+stage.key} slug={detail.project.slug}
   stage={stage} schedule={schedule} open={openStage===i} onToggle={()=>setOpenStage(value=>value===i?-1:i)}/>)}
 </section>;
}
