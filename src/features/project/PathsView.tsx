import {useId,useState} from 'react';
import {Link} from 'react-router';
import {ChevronRight} from 'lucide-react';
import {useInsightData,useProjects} from '../../data/hooks';
import type {CheckpointUi,CheckpointView,ProjectDetail} from '../../data/types';
import {ProjectTimeline} from '../../ui/timeline/ProjectTimeline';
import {Slab} from '../../ui/Slab';
import {Glyph} from '../../ui/Glyph';
import {Skeleton} from '../../ui/Skeleton';

const DAY=86_400_000;
type Stage={key:string;name:string;checkpoints:CheckpointView[]};

/** Preserve plan order. An absent stage is not an invented chapter. */
export function groupStages(checkpoints:readonly CheckpointView[]):Stage[]{
 const stages:Stage[]=[];
 for(const cp of checkpoints){
  const name=cp.stage?.trim()||'Unassigned checkpoints';
  const last=stages.at(-1);
  if(last?.name===name)last.checkpoints.push(cp);
  else stages.push({key:name+':'+stages.length,name,checkpoints:[cp]});
 }
 return stages;
}

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

function goalEstimate(detail:ProjectDetail,events:ReturnType<typeof useInsightData>['data']){
 const now=Date.now(),since=now-28*DAY;
 const ids=new Set((events?.checkpointEvents??[]).filter(e=>e.projectId===detail.project.id
  &&e.kind==='demonstrated'&&Date.parse(e.at)>=since&&Date.parse(e.at)<=now).map(e=>e.checkpointCode));
 const pace=Math.max(1,ids.size)/4;
 const remaining=Math.max(0,detail.total-detail.done);
 const finish=new Date(now+remaining/pace*7*DAY);
 const target=detail.project.targetDate;
 const spare=target?Math.floor((Date.parse(target+'T23:59:59Z')-finish.getTime())/DAY):null;
 return {pace,finish,spare,baseline:ids.size===0};
}

export function GoalOverview({detail,variant}:{detail:ProjectDetail;variant:'ascent'|'metro'}){
 const insight=useInsightData(30);
 const {project,subject,checkpoints,done,total}=detail;
 const estimate=goalEstimate(detail,insight.data);
 const current=checkpoints.findIndex(cp=>cp.ui==='now');
 const pct=total?Math.round(done/total*100):0;
 const displayDate=(date:Date)=>date.toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'});
 const target=project.targetDate?new Date(project.targetDate+'T12:00:00'):null;
 return <section aria-label="Goal and distance" className="min-w-0">
  <Slab as="article" className="flex min-w-0 flex-col gap-3 p-4" data-card="">
   <div className="flex min-w-0 items-start gap-3">
    <Glyph subject={subject.glyph} hue={subject.hue} size={32}/>
    <div className="min-w-0 flex-1">
     <h2 className="break-words font-[var(--font-display)] text-title-s font-semibold">{project.title}</h2>
     <p className="mt-1 break-words text-label leading-relaxed text-ink-2">{project.goal}</p>
    </div>
    <strong className="shrink-0 font-[var(--font-display)] text-title-s tabular-nums text-amber">{pct}%</strong>
   </div>
   <div role="region" aria-label="Checkpoint progress" className="flex flex-wrap items-baseline gap-1 text-label text-ink-2">
    <strong className="font-[var(--font-display)] text-title-s tabular-nums text-ink">{done}</strong>
    <span>of {total} checkpoints done</span>
    {current>=0&&<span className="ml-auto text-amber">{checkpoints[current].code} now</span>}
   </div>
   <div role="region" aria-label="Project timeline" className="min-w-0">
    <ProjectTimeline project={{title:project.title,slug:project.slug,done,total}} checkpoints={checkpoints}
     variant={variant} height={96}/>
   </div>
   {total>0&&<div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-edge pt-3 text-label leading-relaxed text-ink-2">
    <span>Finish ≈ <time dateTime={estimate.finish.toISOString().slice(0,10)}
     className="font-semibold text-ink">{displayDate(estimate.finish)}</time></span>
    <span>at {estimate.pace.toFixed(2)}/wk{estimate.baseline?' (baseline)':''}</span>
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

function StageCard({stage,slug,initiallyOpen}:{stage:Stage;slug:string;initiallyOpen:boolean}){
 const [open,setOpen]=useState(initiallyOpen),id=useId();
 const done=stage.checkpoints.filter(cp=>cp.ui==='done'||cp.ui==='revisit').length;
 const total=stage.checkpoints.filter(cp=>cp.ui!=='proposed').length;
 const progress=total?Math.round(done/total*100):0;
 return <Slab as="article" aria-label={stage.name+' stage'} className="min-w-0 p-0" data-card="">
  <button type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}
   className="flex min-h-12 w-full items-center gap-2 px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-amber">
   <ChevronRight size={16} aria-hidden="true" className={'shrink-0 text-ink-3 transition-transform '+(open?'rotate-90':'')}/>
   <strong className="min-w-0 flex-1 break-words font-[var(--font-display)] text-headline font-semibold">{stage.name}</strong>
   <span role="img" aria-label={progress+' percent complete'} className="h-1 w-16 shrink-0 overflow-hidden rounded-[1px] bg-fill-2">
    <span className="block h-full bg-amber" style={{width:progress+'%'}}/>
   </span>
   <span className="w-9 shrink-0 text-right text-label tabular-nums text-ink-2">{done}/{total}</span>
  </button>
  <div id={id} hidden={!open} className="px-2 pb-2">
   {stage.checkpoints.map((cp,index)=><Link key={cp.id} to={'/p/'+slug+'/cp/'+encodeURIComponent(cp.code)}
    data-cp-row="" aria-label={cp.code+' '+cp.title+', '+labels[cp.ui]}
    className={'flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 py-2 text-left hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber '+
     (index?'border-t border-edge':'')}>
    <span aria-hidden="true" className={'size-[14px] shrink-0 rounded-full border-[1.5px] '+marks[cp.ui]}/>
    <span className="w-[46px] shrink-0 rounded-code text-label tabular-nums text-ink-3">{cp.code}</span>
    <span className={'min-w-0 flex-1 break-words text-body '+(cp.ui==='locked'?'text-ink-3':'text-ink')}>{cp.title}</span>
    <span className={'max-w-[84px] shrink-0 text-right text-caption '+(cp.ui==='revisit'?'text-hard':cp.ui==='proposed'||cp.ui==='now'?'text-amber':'text-ink-3')}>
     {cp.ui==='now'&&cp.stepsTotal>0?cp.currentStep+'/'+cp.stepsTotal:labels[cp.ui]}
    </span>
   </Link>)}
  </div>
 </Slab>;
}

export function Stages({detail}:{detail:ProjectDetail}){
 const stages=groupStages(detail.checkpoints),hasCurrent=stages.some(s=>s.checkpoints.some(cp=>cp.ui==='now'));
 return <section aria-label="Stages" className="flex min-w-0 flex-col gap-2">
  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
   <h2 className="font-[var(--font-display)] text-title-s italic">Stages</h2>
   <span className="text-label text-ink-3">{stages.length} {stages.length===1?'stage':'stages'}, {detail.total} checkpoints</span>
  </div>
  {stages.map((stage,i)=><StageCard key={detail.project.slug+'/'+stage.key} slug={detail.project.slug}
   stage={stage} initiallyOpen={stage.checkpoints.some(cp=>cp.ui==='now')||(!hasCurrent&&i===0)}/>)}
 </section>;
}
