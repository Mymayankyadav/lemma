import {useMemo,useState,type KeyboardEvent, type MouseEvent} from 'react'
import {useNavigate} from 'react-router'
import type {CheckpointView} from '../../data/types'

export type TimelineVariant='ascent'|'metro'

export interface ProjectTimelineProps {
 project:{title:string;slug:string;done:number;total:number}
 checkpoints:readonly CheckpointView[]
 variant?:TimelineVariant
 height?:number
 mini?:boolean
}

/** Scales the complete plan to the available width, with one keyboard-focusable target.
 * The current checkpoint stays labelled even when a stage contains many steps.
 * Data is never inferred from the number of sessions or from a target date.
 */
export function ProjectTimeline({project,checkpoints,variant='ascent',height=84,mini=false}:ProjectTimelineProps){
 const navigate=useNavigate()
 const n=checkpoints.length
 const currentIndex=Math.max(0,checkpoints.findIndex(cp=>cp.ui==='now'||cp.ui==='revisit'||cp.ui==='next'))
 const [selected,setSelected]=useState<number|null>(null)
 const focusedIndex=selected===null?currentIndex:Math.min(selected,Math.max(0,n-1))
 const selectedCheckpoint=checkpoints[focusedIndex]
 const geometry=useMemo(()=>{
  if(n===0)return [] as {x:number;y:number;cp:CheckpointView}[]
  const difficulty=checkpoints.map(cp=>Math.max(1,Math.min(4,cp.stepsTotal||1)))
  const total=difficulty.reduce((a,b)=>a+b,0)
  let done=0
  return checkpoints.map((cp,i)=>{
   done+=difficulty[i]
   const x=18+(n===1?.5:i/(n-1))*324
   const y=variant==='ascent'?75-48*done/total:56-(i%2)*7
   return {cp,x,y}
  })
 },[checkpoints,n,variant])
 const line=(rows:typeof geometry)=>rows.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ')
 const passed=geometry.filter(p=>p.cp.ui==='done'||p.cp.ui==='revisit')
 const lastPassed=passed.length?geometry.indexOf(passed.at(-1)!):-1
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
 const active=geometry[currentIndex]??geometry[0]
 const selectedPoint=geometry[focusedIndex]??active
 return <div data-timeline={variant} className="min-w-0">
  <button type="button" onClick={click} onKeyDown={key}
   aria-label={project.title+': '+project.done+' of '+project.total+' checkpoints, now '+(selectedCheckpoint?.code??'')+' '+(selectedCheckpoint?.title??'')+'. Arrow keys to browse; Enter to open.'}
   className="relative block w-full cursor-pointer rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-amber"
   style={{minHeight:height}}>
   <svg viewBox="0 0 360 96" preserveAspectRatio="none" width="100%" height={height} aria-hidden="true" className="overflow-visible">
    {variant==='ascent'&&<path d={line(geometry)+' L342 83 L18 83 Z'} fill="var(--card-2)" />}
    <path d={line(geometry)} stroke="var(--line)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    {lastPassed>=1&&<path d={line(geometry.slice(0,lastPassed+1))} stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>}
    {geometry.map(({cp,x,y},i)=>{
      const isCurrent=i===currentIndex,isDone=cp.ui==='done',isRevisit=cp.ui==='revisit',isProposed=cp.ui==='proposed'
      return <g key={cp.id}>
       {isCurrent&&<circle cx={x} cy={y} r="9" fill="none" stroke="var(--accent)" strokeOpacity=".25" strokeWidth="2"/>}
       <circle cx={x} cy={y} r={isCurrent?4.4:2.4} fill={isDone?'var(--accent)':isProposed?'var(--card)':isRevisit?'var(--warn)':isCurrent?'var(--accent)':'var(--ink-3)'} stroke={isProposed?'var(--accent)':'none'} strokeWidth="1"/>
       {i===focusedIndex&&selected!==null&&<circle cx={x} cy={y} r="6.5" fill="none" stroke="var(--accent)" strokeWidth="1.4"/>}
      </g>
    })}
    <path d={'M 342 12 v 23'} stroke="var(--ink-2)" strokeWidth="1.5" />
    <path d={'M 343 12 h -12 l 12 7 Z'} fill="var(--accent)"/>
    {!mini&&<text x={Math.max(35,Math.min(315,selectedPoint.x))} y={Math.max(13,selectedPoint.y-12)} fontSize="11" textAnchor="middle" fill="var(--accent)">{selectedCheckpoint?.code}</text>}
   </svg>
  </button>
  {!mini&&<p className="mt-1 min-w-0 text-label text-ink-2">
   <span className="font-semibold text-amber">{selectedCheckpoint?.code}</span>{' '}
   <span className="break-words">{selectedCheckpoint?.title}</span>
   <span className="text-ink-3"> · {Math.round(100*project.done/Math.max(1,project.total))}% complete</span>
  </p>}
 </div>
}
