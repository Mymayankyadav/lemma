import {useId,useState,type FormEvent} from 'react'
import {Button,Field,Sheet} from '../../ui/v7/components'
import type {SittingChange,SittingRecord} from '../../data/exam/contract'
import {instantInZone} from '../calendar/block-sheet/BlockSheet'

const SIX_HOURS=6*3600000
function readUntil(key:string){
 try{return Number(localStorage.getItem(key))||0}catch{return 0}
}

export function PassedExamBanner({sitting,owner,now,disabled,onChange}:{
 sitting:SittingRecord;owner:string;now:number;disabled:boolean;onChange:(change:SittingChange)=>Promise<void>
}){
 const formId=useId()
 const key='lemma.exam-not-yet:'+owner+':'+sitting.id+':'+sitting.starts_at
 const [until,setUntil]=useState(()=>readUntil(key)),[postpone,setPostpone]=useState(false)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 if(!sitting.starts_at||Date.parse(sitting.starts_at)>now||now<until||sitting.status==='finished'||sitting.status==='cancelled')return null
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const start=instantInZone(String(new FormData(event.currentTarget).get('start')),sitting.time_zone)
  if(!start||Date.parse(start)<=Date.now()){
   setError('Choose a future time in '+sitting.time_zone+'.')
   return
  }
  if(await apply({operation:'update',patch:{starts_at:start,time_zone:sitting.time_zone}}))setPostpone(false)
 }
 async function apply(change:SittingChange){
  if(disabled||busy)return false
  try{setBusy(true);setError('');await onChange(change);return true}
  catch(reason){setError(reason instanceof Error?reason.message:'Could not update the exam.');return false}
  finally{setBusy(false)}
 }
 function dismiss(){
  if(disabled||busy)return
  const later=Date.now()+SIX_HOURS
  try{localStorage.setItem(key,String(later))}catch{/* This view still respects the dismissal. */}
  setUntil(later)
 }
 return <section className="v7-exam-panel v7-exam-callout" aria-label="Exam date passed">
  <h2 className="v7-subhead">Did {sitting.title} take place?</h2>
  <div className="v7-exam-actions">
   <Button disabled={disabled||busy} onClick={()=>{void apply({operation:'finish',patch:{happened:true}})}}>Yes</Button>
   <Button disabled={disabled||busy} onClick={()=>{setError('');setPostpone(true)}}>Postponed</Button>
   <Button disabled={disabled||busy} onClick={dismiss}>Not yet</Button>
  </div>
  {error&&!postpone&&<p role="alert">{error}</p>}
  {postpone&&<Sheet open title="New exam date" onClose={()=>{if(!busy)setPostpone(false)}}
   footer={<Button form={formId} type="submit" variant="primary" disabled={busy||disabled}>Save new date</Button>}>
   <form id={formId} className="v7-exam-form" onSubmit={event=>{void submit(event)}}>
    <Field name="start" label="New date and time" hint={sitting.time_zone} type="datetime-local" required/>
    {error&&<p role="alert">{error}</p>}
   </form>
  </Sheet>}
 </section>
}
