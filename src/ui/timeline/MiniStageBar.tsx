import {useEffect,useRef,useState} from 'react'
import type {ProjectSummary,ProjectStageProgress} from '../../data/types'
import {layoutMiniRoute} from './miniRoute'

/** Locate the actual current checkpoint, not the number completed. */
export function currentMiniRouteOrdinal(code:string|null|undefined,
 stages:readonly ProjectStageProgress[],done:number):number{
 const total=stages.reduce((sum,stage)=>sum+Math.max(0,stage.total),0)
 const current=code?.trim()
 if(current){
  let before=0
  const parts=(s:string)=>/^(.*?)(\\d+)$/.exec(s)
  for(const stage of stages){
   const count=Math.max(0,stage.total)
   if(count>0){
    if(current===stage.firstCode)return before+.5
    if(current===stage.lastCode)return before+count-.5
    const first=parts(stage.firstCode),last=parts(stage.lastCode),now=parts(current)
    if(first&&last&&now&&first[1]===last[1]&&now[1]===first[1]){
     const a=Number(first[2]),b=Number(last[2]),n=Number(now[2])
     if(a!==b&&n>=Math.min(a,b)&&n<=Math.max(a,b))
      return before+.5+(n-a)/(b-a)*(count-1)
    }
   }
   before+=count
  }
  // Older summaries may not carry stage codes; CPn still gives a safe index.
  const cp=/^CP(\\d+)$/i.exec(current)
  if(cp&&Number(cp[1])>=1&&Number(cp[1])<=total)return Number(cp[1])-.5
 }
 return Math.max(0,Math.min(total,done>=total?total:done+.5))
}

/** A single 2x12px now-notch; inner marks keep 8px clearance from both ends.
 * Map through the actual grouped segment widths, not total-completion ratio.
 */
export function miniRouteNotch(position:number,total:number,width:number,
 segments?:readonly ReturnType<typeof layoutMiniRoute>[number][]){
 if(total<=0||width<=0)return null
 const ordinal=Math.max(0,Math.min(total,position))
 let ratio=ordinal/total
 if(segments?.length){
  let remaining=ordinal,percent=0
  for(const [i,segment] of segments.entries()){
   if(remaining<=segment.total||i===segments.length-1){
    percent+=segment.widthPercent*(segment.total?Math.max(0,Math.min(1,remaining/segment.total)):0)
    break
   }
   percent+=segment.widthPercent
   remaining-=segment.total
  }
  ratio=Math.max(0,Math.min(1,percent/100))
 }
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
 const stageTotal=stages.reduce((sum,stage)=>sum+Math.max(0,stage.total),0)
 const currentOrdinal=currentMiniRouteOrdinal(project.current?.code,stages,project.done)
 const notch=miniRouteNotch(currentOrdinal,stageTotal,width,segments)
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
