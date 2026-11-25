import {useEffect,useRef,useState} from 'react'
import type {TutorAnswerMeta} from '../../data/tutor/turn-model'

export function timedAnswer(elapsedMs:number,limit:number):TutorAnswerMeta {
 const seconds=Math.min(36000,Math.floor(Math.max(0,elapsedMs)/1000))
 return {seconds,overtime:elapsedMs>=limit*1000}
}

function savedTime(id:string|undefined){
 if(!id)return 0
 try{
  const value=Number(sessionStorage.getItem('lemma.exam-timer:'+id))
  return Number.isFinite(value)?Math.max(0,Math.min(value,36000000)):0
 }catch{return 0}
}

export function useTimedAnswer(id:string|undefined,limit:number|undefined,enabled:boolean){
 const clock=useRef({id,elapsed:savedTime(id),anchor:null as number|null})
 const [,tick]=useState(0)
 if(clock.current.id!==id)clock.current={id,elapsed:savedTime(id),anchor:null}
 const elapsed=()=>clock.current.elapsed+(clock.current.anchor===null?0:performance.now()-clock.current.anchor)
 useEffect(()=>{
  if(!id||!limit||!enabled)return
  const state=clock.current
  function remember(){
   try{sessionStorage.setItem('lemma.exam-timer:'+id,String(state.elapsed))}catch{/* The visible timer remains available in memory. */}
  }
  function update(){
   const now=performance.now()
   if(state.anchor!==null)state.elapsed+=now-state.anchor
   state.anchor=document.visibilityState==='visible'?now:null
   if(document.visibilityState!=='visible')remember()
   tick(state.elapsed)
  }
  update()
  const timer=window.setInterval(update,250)
  document.addEventListener('visibilitychange',update)
  const recordExit=()=>{
   if(state.anchor!==null)state.elapsed+=performance.now()-state.anchor
   state.anchor=null
   remember()
  }
  window.addEventListener('pagehide',recordExit)
  return()=>{
   if(state.anchor!==null)state.elapsed+=performance.now()-state.anchor
   state.anchor=null
   remember()
   window.clearInterval(timer)
   document.removeEventListener('visibilitychange',update)
   window.removeEventListener('pagehide',recordExit)
  }
 },[enabled,id,limit])
 if(!id||!limit)return undefined
 const answer=()=>timedAnswer(elapsed(),limit)
 const left=Math.max(0,limit-answer().seconds)
 return {answer,label:left?'Timed · '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'):'Time up · you can still answer'}
}
