import {Button} from '../../ui/v7/components'
import type {SittingRecord} from '../../data/exam/contract'
import {remainingTime} from './model'

export function ModeControl({sitting,studyNext,examNext,disabled,onChange,now}:{
 sitting:SittingRecord;studyNext:string;examNext?:string;disabled:boolean;onChange:(active:boolean)=>void;now:number
}){
 if(sitting.status==='finished'||sitting.status==='cancelled')return null
 const active=sitting.status==='active', planned=sitting.status==='planned'
 const date=sitting.starts_at?new Intl.DateTimeFormat(undefined,{
  dateStyle:'medium',timeStyle:'short',timeZone:sitting.time_zone,
 }).format(new Date(sitting.starts_at)):null
 return <section className="v7-exam-mode" aria-label="Path mode">
  <div className="v7-exam-actions">
   {planned
    ?<><p><strong>{sitting.title}</strong>{date&&<small>{date} · {sitting.time_zone}</small>}</p>
      <Button onClick={()=>onChange(true)} disabled={disabled}>Start prep</Button></>
    :<><div className="v7-exam-switch" role="group" aria-label="Path mode">
      <button type="button" disabled={disabled} aria-pressed={!active} onClick={()=>{if(active)onChange(false)}}>Study</button>
      <button type="button" disabled={disabled} aria-pressed={active} onClick={()=>{if(!active)onChange(true)}}>Exam prep</button>
     </div><small>{active?remainingTime(sitting.starts_at,now):'Exam prep paused'}</small></>}
  </div>
  <p><strong>Study next</strong> · {studyNext}</p>
  <p><strong>Exam next</strong> · {examNext??(sitting.blueprint.length?'No task scheduled':'Build the blueprint')}</p>
 </section>
}
