import {useEffect,useRef,useState} from 'react'
import type {ProjectSummary,ProjectStageProgress} from '../../data/types'

/** Rendering needs only the bounded project_summaries() payload, never useProject. */
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
 const segments:ProjectStageProgress[]=project.stageProgress?.length?project.stageProgress:
  Array.from({length:Math.ceil(total/8)},(_,i)=>{
   const count=Math.min(8,total-i*8)
   return {label:'CP'+(i*8+1)+'–CP'+(i*8+count),firstCode:'CP'+(i*8+1),
    lastCode:'CP'+(i*8+count),total:count,done:Math.max(0,Math.min(count,project.done-i*8)),
    overdue:0,schedule:'unscheduled' as const}
  })
 const pct=total?Math.round(project.done/total*100):0
 const currentNo=Number(project.current?.code.match(/\d+$/)?.[0])
 const marker=Number.isFinite(currentNo)?Math.max(0,Math.min(100,((currentNo-.5)/Math.max(1,total))*100)):
  Math.max(0,Math.min(100,((project.done+.5)/Math.max(1,total))*100))
 const stateColor:Record<ProjectStageProgress['schedule'],string>={
  complete:'var(--good)',behind:'var(--bad, var(--again))',
  dated:'var(--accent)',unscheduled:'var(--ink-3)'
 }
 return <div ref={bar} role="img" aria-label={pct+' percent complete'+(project.scheduleHeadline?', '+project.scheduleHeadline:'')}
  className="relative h-6 min-w-12 flex-1" data-mini-metro="">
  <div className="absolute inset-x-0 top-[9px] flex h-2 overflow-hidden rounded-sm bg-fill-2" data-stage-bar="">
   {segments.map((segment,index)=><span key={index} data-stage-segment={segment.label} data-track-state={segment.schedule}
    title={segment.label+': '+segment.done+'/'+segment.total}
    className="relative h-full min-w-0 border-r border-[var(--card)] last:border-r-0"
    style={{flex:Math.max(1,segment.total),background:'var(--line)'}}>
    <span className="block h-full" style={{width:segment.total?segment.done/segment.total*100+'%':'0%',
     background:stateColor[segment.schedule]}}/>
   </span>)}
  </div>
  {total>0&&<span aria-hidden="true" className="absolute top-[5px] h-4 w-[2px] bg-[var(--ink)]"
   style={{left:'calc('+marker+'% - 1px)'}}/>}
  {total>0&&total<=16&&total<=Math.floor(width/8)&&Array.from({length:total},(_,i)=>
   <span key={i} data-mini-tick="" aria-hidden="true" className="absolute top-[8px] h-[10px] w-[1px] bg-[var(--ink-2)]"
    style={{left:((i+.5)/total*100)+'%'}}/>)}
 </div>
}
