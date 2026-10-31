import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type MouseEvent} from 'react';
import {Link,useNavigate} from 'react-router';
import type {CheckpointView} from '../../data/types';
import {buildSchedule,type ScheduledCheckpoint} from '../../lib/schedule';
import {plainMath} from '../../lib/plain-math';
import {Tex} from '../Tex';
import {currentCheckpointIndex,groupCheckpointStages,worstStageSchedule} from './progress';
import {layoutRoute,type RouteMark} from './route-layout';

export interface RouteProps{
 project:{title:string;slug:string;done:number;total:number;targetDate?:string|null};
 checkpoints:readonly CheckpointView[];
 mode:'today'|'project';
 scheduleRows?:readonly ScheduledCheckpoint[];
 pacePerWeek?:number;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** One 64/80px Route, not a scrollable rail of stage or station buttons. */
export function Route({project,checkpoints,mode,scheduleRows,pacePerWeek}:RouteProps){
 const navigate=useNavigate();
 const ref=useRef<HTMLDivElement>(null);
 const [width,setWidth]=useState(360);
 const [selected,setSelected]=useState<number|null>(null);
 const n=checkpoints.length,current=currentCheckpointIndex(checkpoints);
 const focused=clamp(selected??current,0,Math.max(0,n-1));
 const stages=useMemo(()=>groupCheckpointStages(checkpoints),[checkpoints]);
 const rows=useMemo(()=>scheduleRows??buildSchedule(checkpoints,{
  targetDate:project.targetDate,pacePerWeek,
 }),[scheduleRows,checkpoints,project.targetDate,pacePerWeek]);
 const layout=useMemo(()=>layoutRoute(stages,n,focused,width),[stages,n,focused,width]);
 const height=mode==='today'?64:80;
 useEffect(()=>{
  const node=ref.current;
  if(!node)return;
  const observer=new ResizeObserver(entries=>setWidth(entries[0]?.contentRect.width??node.clientWidth));
  observer.observe(node);setWidth(node.clientWidth);
  return ()=>observer.disconnect();
 },[]);
 const checkpoint=checkpoints[focused];
 const open=(index=focused)=>{
  const cp=checkpoints[index];
  if(cp)navigate('/p/'+project.slug+'/cp/'+encodeURIComponent(cp.code));
 };
 const move=(delta:number)=>setSelected(clamp(focused+delta,0,n-1));
 const onKey=(event:KeyboardEvent<HTMLButtonElement>)=>{
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
   event.preventDefault();move(event.key==='ArrowRight'?1:-1);
  }else if(event.key==='Enter'||event.key===' '){
   event.preventDefault();open();
  }
 };
 const onTap=(event:MouseEvent<HTMLButtonElement>)=>{
  const rect=event.currentTarget.getBoundingClientRect();
  const x=(event.clientX-rect.left)*width/Math.max(1,rect.width);
  const nearest=layout.marks.reduce<RouteMark|null>((best,mark)=>
   !best||Math.abs(mark.x-x)<Math.abs(best.x-x)?mark:best,null);
  if(nearest)setSelected(nearest.index);
 };
 if(!n)return <p className="text-label text-ink-3">A plan is needed before the Route can appear.</p>;
 const active=stages[layout.activeStage];
 const stateAt=(index:number)=>rows[index]?.state??'unscheduled';
 const stageStatus=(mark:RouteMark)=>{
  const span=stages.slice(mark.stageIndex,mark.stageEnd+1);
  const start=span[0]?.start??0,end=span.at(-1)?.end??start;
  const allDone=checkpoints.slice(start,end+1).every(cp=>cp.ui==='done'||cp.ui==='revisit');
  const schedule=worstStageSchedule(rows.slice(start,end+1));
  return {allDone,schedule};
 };
 const marks=layout.marks;
 const geometry=<svg data-route-track="" viewBox={`0 0 ${width} ${height}`}
  preserveAspectRatio="none" width="100%" height={height} aria-hidden="true"
  className="block w-full overflow-hidden">
  {marks.slice(1).map((mark,i)=>{
   const previous=marks[i],state=stateAt(mark.index);
   const from=previous.x+previous.width/2,to=mark.x-mark.width/2;
   const late=state==='late',early=state==='early',future=state==='future';
   return <g key={'track-'+i} data-track-state={state}>
    <path d={`M${from} 24 L${to} 24`} fill="none"
     stroke={late?'var(--late)':future?'var(--ink-4)':'var(--ink-2)'}
     strokeWidth={future?1.5:2.5} strokeDasharray={late?'5 4':future?'1 4':undefined}/>
    {early&&<path d={`M${from} 30 L${to} 30`} fill="none"
     stroke="var(--early)" strokeWidth="1.2"/>}
   </g>;
  })}
  {marks.map(mark=>{
   const cp=checkpoints[mark.index],state=stateAt(mark.index);
   if(mark.kind==='stage'){
    const status=stageStatus(mark);
    const y=24-mark.height/2;
    return <rect key={'stage-'+mark.stageIndex} data-route-mark="stage"
     data-stage-range={mark.stageIndex+'-'+mark.stageEnd}
     data-hidden-stages={mark.stages>1?mark.stages:undefined}
     x={mark.x-mark.width/2} y={y} width={mark.width} height={mark.height}
     rx={mark.height/2} fill={status.allDone?'var(--ink-2)':'var(--paper)'}
     stroke={status.schedule==='late'?'var(--late)':'var(--ink-4)'}
     strokeWidth={status.allDone?0:1.3}
     strokeDasharray={status.schedule==='late'?'3 2':undefined}/>;
   }
   const isCurrent=mark.index===current,done=cp.ui==='done',revisit=cp.ui==='revisit';
   const radius=isCurrent?5.5:done?3.6:3.4;
   return <g key={cp.id} data-station-index={mark.index} data-station-state={state}>
    {/* One SVG mark: the translucent 11px halo is its stroke, not a
        second overlapping circle that would corrupt ST-0 mark spacing. */}
    <circle data-route-mark="station" cx={mark.x} cy="24" r={radius}
     fill={isCurrent?'var(--accent)':done?'var(--ink-2)':'var(--paper)'}
     stroke={isCurrent?'var(--accent)':mark.index===focused?'var(--ink)':
      revisit?'var(--late)':done?'var(--ink-2)':'var(--ink-3)'}
     strokeWidth={isCurrent?11:done?0:mark.index===focused?2.5:1.5}
     strokeOpacity={isCurrent?.16:1} paintOrder="stroke fill"
     strokeDasharray={revisit?'3 2':undefined}/>
   </g>;
  })}
  {layout.mode==='plain'&&stages.map((stage,i)=>{
   const first=marks.find(mark=>mark.kind==='station'&&mark.index===stage.start);
   const next=marks.find(mark=>mark.kind==='station'&&mark.index===stage.end+1);
   const available=(next?.x??width-12)-(first?.x??0);
   const name=plainMath(stage.name);
   if(!first||name.length*7+12>available)return null;
   return <text key={stage.key} x={first.x} y={height-12} fill={i===layout.activeStage?'var(--ink)':'var(--ink-3)'}
    fontSize="12" fontWeight={i===layout.activeStage?600:400}>{name}</text>;
  })}
  {layout.mode==='folded'&&active&&<text x="12" y={height-12}
   fill="var(--ink)" fontSize="12" fontWeight="600">
   {plainMath(active.name)}
  </text>}
  {layout.mode==='folded'&&<text x={width-12} y={height-12}
   textAnchor="end" fill="var(--ink-3)" fontSize="12">
   {stages.length} stages · {Math.max(0,n-project.done)} to go
  </text>}
 </svg>;
 const label=plainMath(project.title)+': '+project.done+' of '+n+
  ' checkpoints, '+(checkpoint?.code??'')+'. Arrow keys select; Enter opens.';
 return <div ref={ref} data-route="" data-route-mode={mode}
  data-route-layout={layout.mode} className="min-w-0 w-full">
  {mode==='today'?<Link to={'/p/'+project.slug+'/cp/'+encodeURIComponent(checkpoints[current].code)}
   aria-label={plainMath(project.title)+': open current checkpoint '+checkpoints[current].code}
   className="block min-h-[64px] w-full rounded-ctl focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
   {geometry}
  </Link>:<>
   <button type="button" aria-label={label} onClick={onTap} onKeyDown={onKey}
    className="block min-h-[80px] w-full rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
    {geometry}
   </button>
   <div data-route-now="" className="flex min-w-0 items-center gap-2 border-t border-[var(--hair)] pt-2">
    <span data-code="" className="shrink-0 font-[var(--font-num)] text-[12px] font-medium tabular-nums text-[var(--accent)]">
     {checkpoint.code}
    </span>
    <span className="min-w-0 flex-1 break-words text-[16px] text-ink"><Tex source={checkpoint.title}/></span>
    <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{focused+1} of {n}</span>
   </div>
   <div data-route-controls="" className="mt-2 flex items-center justify-end gap-2">
    <button type="button" aria-label="Previous checkpoint" disabled={focused===0}
     onClick={()=>move(-1)} className="flex size-11 shrink-0 items-center justify-center rounded-ctl border border-[var(--edge)] text-ink disabled:opacity-30">‹</button>
    <button type="button" aria-label="Next checkpoint" disabled={focused===n-1}
     onClick={()=>move(1)} className="flex size-11 shrink-0 items-center justify-center rounded-ctl border border-[var(--edge)] text-ink disabled:opacity-30">›</button>
    <button type="button" aria-label="Open checkpoint" onClick={()=>open()}
     className="min-h-11 min-w-11 shrink-0 rounded-ctl border border-[var(--edge)] px-2 text-[12px] text-ink">Open</button>
   </div>
  </>}
 </div>;
}
export default Route;
