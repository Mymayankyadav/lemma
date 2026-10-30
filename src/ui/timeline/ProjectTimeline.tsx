import {useMemo,useState,type KeyboardEvent,type MouseEvent} from 'react'
import {useNavigate} from 'react-router'
import type {CheckpointView} from '../../data/types'
import {buildSchedule,scheduleColor,scheduleDetail,scheduleHeadline} from '../../lib/schedule'
import {Tex} from '../Tex'

export type TimelineVariant='ascent'|'metro'
export interface ProjectTimelineProps {
 project:{title:string;slug:string;done:number;total:number;targetDate?:string|null}
 checkpoints:readonly CheckpointView[]
 variant?:TimelineVariant
 height?:number
 mini?:boolean
 pacePerWeek?:number
}

/** The same scheduled checkpoints power Today and the project Metro.
 * SVG paths are per-station so early/on-time/late remain distinct; keyboard
 * navigation and the whole-width tap target are preserved from the old timeline.
 */
export function ProjectTimeline({project,checkpoints,variant='metro',height=96,mini=false,pacePerWeek}:ProjectTimelineProps){
 const navigate=useNavigate()
 const n=checkpoints.length
 const current=checkpoints.findIndex(cp=>cp.ui==='now')
 const revisit=checkpoints.findIndex(cp=>cp.ui==='revisit')
 const next=checkpoints.findIndex(cp=>cp.ui==='next')
 const currentIndex=current>=0?current:revisit>=0?revisit:Math.max(0,next)
 const [selected,setSelected]=useState<number|null>(null)
 const focusedIndex=selected===null?currentIndex:Math.min(selected,Math.max(0,n-1))
 const rows=useMemo(()=>buildSchedule(checkpoints,{targetDate:project.targetDate,pacePerWeek}),
  [checkpoints,project.targetDate,pacePerWeek])
 const selectedCheckpoint=checkpoints[focusedIndex]
 const headline=scheduleHeadline(rows)
 const geometry=useMemo(()=>{
  if(!n)return [] as {x:number;y:number;cp:CheckpointView;index:number;stage:string|null}[]
  const difficulty=checkpoints.map(cp=>Math.max(1,Math.min(4,cp.stepsTotal||1)))
  const total=difficulty.reduce((a,b)=>a+b,0)
  let done=0
  return checkpoints.map((cp,index)=>{
   done+=difficulty[index]
   return {cp,index,x:18+(n===1?.5:index/(n-1))*324,
    y:variant==='ascent'?75-48*done/total:53,
    stage:cp.stage?.trim()||null}
  })
 },[checkpoints,n,variant])
 const groups=useMemo(()=>{
  const result:{name:string;start:number;end:number}[]=[]
  geometry.forEach((point,index)=>{
   const name=point.stage
   if(!name)return
   const last=result.at(-1)
   if(last?.name===name&&last.end===index-1)last.end=index
   else result.push({name,start:index,end:index})
  })
  return result
 },[geometry])
 const line=(points:typeof geometry)=>points.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ')
 const visit=(index:number)=>{const cp=checkpoints[index];if(cp)navigate('/p/'+project.slug+'/cp/'+encodeURIComponent(cp.code))}
 const click=(event:MouseEvent<HTMLButtonElement>)=>{
  if(!n)return
  const bounds=event.currentTarget.getBoundingClientRect()
  const x=(event.clientX-bounds.left)/Math.max(1,bounds.width)
  visit(Math.max(0,Math.min(n-1,Math.round(x*(n-1)))))
 }
 const key=(event:KeyboardEvent<HTMLButtonElement>)=>{
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
   event.preventDefault()
   setSelected(Math.max(0,Math.min(n-1,focusedIndex+(event.key==='ArrowRight'?1:-1))))
  }else if(event.key==='Enter'||event.key===' '){
   event.preventDefault()
   visit(focusedIndex)
  }
 }
 if(!n)return <p className="text-label text-ink-3">A plan is needed before the timeline can appear.</p>
 const selectedPoint=geometry[focusedIndex]??geometry[0]
 const selectedSchedule=rows[focusedIndex]
 const detail=selectedSchedule?scheduleDetail(selectedSchedule):null
 return <div data-timeline={variant} className="min-w-0" data-schedule={headline??'none'}>
  <button type="button" onClick={click} onKeyDown={key}
   aria-label={project.title+': '+project.done+' of '+project.total+' checkpoints, now '+(selectedCheckpoint?.code??'')+' '+(selectedCheckpoint?.title??'')+
    (headline?', '+headline:'')+'. Arrow keys to browse; Enter to open.'}
   className="relative block w-full cursor-pointer rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-amber"
   style={{minHeight:height}}>
   <svg viewBox="0 0 360 96" preserveAspectRatio="none" width="100%" height={height} aria-hidden="true" className="overflow-visible">
    {variant==='ascent'&&<path d={line(geometry)+' L342 83 L18 83 Z'} fill="var(--card-2)"/>}
    <path d={line(geometry)} stroke="var(--line)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {geometry.slice(1).map((point,i)=>{
     const previous=geometry[i],row=rows[i+1],state=row.state
     const gap=point.stage!==previous.stage&&point.stage!==null?4:0
     const x1=previous.x+gap,x2=point.x-gap
     const path='M'+x1+' '+previous.y+' L'+x2+' '+point.y
     return <g key={row.checkpoint.id+'-track'} data-track-state={state}>
      <path d={path} fill="none" stroke={scheduleColor[state]}
       strokeWidth={state==='future'?1:2.5} strokeDasharray={state==='late'?'5 4':undefined}
       strokeOpacity={state==='future'?.4:1}/>
      {state==='early'&&<path d={'M'+x1+' '+(previous.y+4)+' L'+x2+' '+(point.y+4)}
       stroke={scheduleColor[state]} strokeWidth="1" fill="none"/>}
     </g>
    })}
    {geometry.map(({cp,x,y,index},i)=>{
     const isCurrent=i===currentIndex,isDone=cp.ui==='done',isRevisit=cp.ui==='revisit'
     const isProposed=cp.ui==='proposed'
     const stageEnd=i===n-1||geometry[i+1]?.stage!==cp.stage
     const row=rows[index]
     return <g key={cp.id} data-station-state={row.state}>
      {isCurrent&&<circle cx={x} cy={y} r="9" fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth="2"/>}
      <circle cx={x} cy={y} r={isCurrent?4.4:stageEnd?4:2.7}
       fill={isDone?scheduleColor[row.state==='unscheduled'?'on_time':row.state]:isProposed?'var(--card)':isRevisit?'var(--warn)':isCurrent?'var(--accent)':'var(--card)'}
       stroke={scheduleColor[row.state==='unscheduled'?'future':row.state]} strokeWidth={isDone?0:1.5}/>
      {i===focusedIndex&&selected!==null&&<circle cx={x} cy={y} r="7" fill="none" stroke="var(--accent)" strokeWidth="1.4"/>}
     </g>
    })}
    {!mini&&<text x={Math.max(35,Math.min(315,selectedPoint.x))} y={Math.max(12,selectedPoint.y-15)}
     fontSize="11" textAnchor="middle" fill="var(--accent)">{selectedCheckpoint?.code}</text>}
   </svg>
   {!mini&&variant==='metro'&&groups.map((group,i)=>{
    const start=geometry[group.start].x,end=geometry[group.end].x
    // Stage labels must fit their segment: never clip or overlap mathematical text.
    const available=(end-start)*.9
    const needed=group.name.length*7.2+12
    if(available<needed)return null
    return <span key={group.start} aria-hidden="true"
     className="pointer-events-none absolute truncate text-center text-caption text-ink-3"
     style={{left:(start/360*100)+'%',width:((end-start)/360*100)+'%',
      top:i%2===0?0:height-16,transform:'translateX(-1px)'}}>
     <Tex source={group.name}/>
    </span>
   })}
  </button>
  {!mini&&<p className="mt-1 min-w-0 text-label text-ink-2">
   <span className="font-semibold text-amber">{selectedCheckpoint?.code}</span>{' '}
   <span className="break-words"><Tex source={selectedCheckpoint?.title??''}/></span>
   {detail&&<span className="block text-caption text-ink-2">{detail}</span>}
  </p>}
 </div>
}
