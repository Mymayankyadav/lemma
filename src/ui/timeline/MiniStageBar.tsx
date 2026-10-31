import {useEffect,useRef,useState} from 'react'
import type {ProjectSummary,ProjectStageProgress} from '../../data/types'
import {layoutMiniRoute} from './miniRoute'

/** A single 2x12px now-notch; inner marks keep 8px clearance from both ends. */
export function miniRouteNotch(done:number,total:number,width:number){
 if(total<=0||width<=0)return null
 const ratio=Math.max(0,Math.min(1,done/total))
 const x=ratio===0?0:ratio===1?width:Math.max(9,Math.min(width-9,width*ratio))
 return {x,percent:x/width*100,edge:ratio===0?'start':ratio===1?'end':'middle'} as const
}

/** A bounded summary renders one bar; no checkpoint-level ticks or tiny targets. */
export function MiniStageBar({project}:{project:ProjectSummary}){
 const bar=useRef<HTMLDivElement>(null),[width,setWidth]=useState(200)
 useEffect(()=>{
  if(!bar.current)return
  const node=bar.current
  const observer=new ResizeObserver(entries=>setWidth(entries[0]?.contentRect.width??node.clientWidth))
  observer.observe(node);setWidth(node.clientWidth)
  return ()=>observer.disconnect()
 },[])
 const total=Math.max(0,project.total)
 const stages:ProjectStageProgress[]=project.stageProgress?.length?project.stageProgress:
  Array.from({length:Math.ceil(total/8)},(_,i)=>{
   const count=Math.min(8,total-i*8)
   return {label:'CP'+(i*8+1)+'–CP'+(i*8+count),firstCode:'CP'+(i*8+1),
    lastCode:'CP'+(i*8+count),total:count,done:Math.max(0,Math.min(count,project.done-i*8)),
    overdue:0,schedule:'unscheduled' as const}
  })
 const segments=layoutMiniRoute(stages,width)
 const notch=miniRouteNotch(project.done,total,width)
 const color:Record<ProjectStageProgress['schedule'],string>={
  complete:'var(--ink-2)',behind:'var(--late)',
  dated:'var(--ink-2)',unscheduled:'var(--ink-3)',
 }
 return <div ref={bar} role="img"
  aria-label={project.done+' of '+total+' checkpoints complete'+(project.scheduleHeadline?', '+project.scheduleHeadline:'')}
  className="relative h-6 min-w-12 flex-1" data-mini-route="" data-mini-metro="">
  <div className="absolute inset-x-0 top-[9px] flex h-[6px] overflow-hidden rounded-[3px] bg-[var(--paper-2)]"
   data-stage-bar="">
   {segments.map((segment,index)=><span key={index}
    data-stage-segment={segment.label} data-route-grouped={segment.groupedCount}
    data-track-state={segment.schedule}
    title={segment.label+': '+segment.done+'/'+segment.total}
    className="relative h-full min-w-0 shrink-0 border-r-2 border-[var(--card)] last:border-r-0"
    style={{width:segment.widthPercent+'%',background:'var(--paper-2)'}}>
    <span className="block h-full" style={{
     width:segment.total?segment.done/segment.total*100+'%':'0%',
     background:color[segment.schedule],
    }}/>
   </span>)}
  </div>
  {notch&&<span data-route-notch="" data-notch-x={notch.x} aria-hidden="true"
   className="pointer-events-none absolute top-[6px] h-[12px] w-[2px] bg-[var(--accent)]"
   style={{left:notch.percent+'%',transform:notch.edge==='start'?'none':
    notch.edge==='end'?'translateX(-100%)':'translateX(-50%)'}}/>}
 </div>
}
