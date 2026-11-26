import {useId,useState,type FormEvent} from 'react'
import {Button,Field,Sheet} from '../../ui/v7/components'
import {getApi} from '../../data'
import type {Project} from '../../data/types'
import {instantInZone} from '../calendar/block-sheet/BlockSheet'
import {localDate,modeOf,projectTime,studyDay} from '../../../supabase/functions/_shared/adaptive/time'

export function coursePastDeadline(project:Project,zone:string,rollover:number,now:number){
 const horizon=projectTime({target_date:project.targetDate,deadline_at:project.deadlineAt,last_study_on:project.lastStudyOn},zone)
 return modeOf(studyDay({time_zone:zone,rollover_hour:rollover},now),horizon)==='post_deadline'
}

export function CourseContinuation({project,zone,online,onChanged,onArchive}:{
 project:Project;zone:string;online:boolean;onChanged:()=>Promise<void>;onArchive:()=>Promise<void>
}){
 const [panel,setPanel]=useState<'date'|'archive'>()
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const formId=useId(),minDate=localDate(zone,Date.now())
 async function apply(work:()=>Promise<void>){
  if(busy||!online)return
  try{setBusy(true);setError('');await work();setPanel(undefined)}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not update the course.')}
  finally{setBusy(false)}
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const date=String(new FormData(event.currentTarget).get('next'))
  const deadline=instantInZone(date+'T23:59',zone)
  if(!deadline||date<minDate){setError('Enter today or a future date.');return}
  void apply(async()=>{
   await getApi().updateProject(project.id,{deadlineAt:deadline,lastStudyOn:date,timeConfirmed:true})
   await onChanged()
  })
 }
 return <section aria-label="Course continuation" className="v7-exam-panel">
  <p>The course’s study deadline has passed.</p>
  <div className="v7-exam-actions">
   <Button onClick={()=>{setPanel('date');setError('')}} disabled={!online}>Set next course date</Button>
   <Button onClick={()=>{setPanel('archive');setError('')}} disabled={!online}>Archive path</Button>
  </div>
  {panel&&<Sheet open title={panel==='date'?'Next course date':'Archive this path?'} onClose={()=>{if(!busy)setPanel(undefined)}}
   footer={panel==='date'?<Button variant="primary" type="submit" form={formId} disabled={busy||!online}>Save date</Button>
    :<Button destructive disabled={busy||!online} onClick={()=>{void apply(onArchive)}}>Archive path</Button>}>
   {panel==='date'?<form id={formId} className="v7-exam-form" onSubmit={submit}>
    <Field label="New course date" name="next" type="date" min={minDate} required/>
   </form>:<p>You can restore {project.title} from Paths.</p>}
   {error&&<p role="alert">{error}</p>}
  </Sheet>}
 </section>
}
