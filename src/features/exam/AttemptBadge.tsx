import {useState} from 'react'
import type {ExamAttempt,SittingRecord} from '../../data/exam/contract'
import {Button,Field,Sheet} from '../../ui/v7/components'

export function AttemptBadge({attempt,sitting,onChallenge,showUnknown=false}:{
 attempt?:ExamAttempt;sitting:SittingRecord;onChallenge?:(text:string)=>void;showUnknown?:boolean
}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState('')
 if(!attempt)return showUnknown?<span className="v7-exam-chip">Not scored yet</span>:null
 const label=attempt.outcome==='exposure'?'Reading only':
  ['unscorable','skipped','timeout'].includes(attempt.outcome)?'Not scored':
  attempt.independence==='independent'&&attempt.hint_level===0&&attempt.novelty!=='seen_solution'?'Independent':'Assisted'
 const score=attempt.marks_awarded!=null&&attempt.marks_possible!=null?attempt.marks_awarded+'/'+attempt.marks_possible:null
 const title=sitting.blueprint.find(row=>row.key===attempt.row_key)?.title??'Exam item'
 return <>
  <Button className="v7-exam-chip" aria-haspopup="dialog" onClick={()=>setOpen(true)}>{label}{score?' · '+score:attempt.hint_level?' · hint '+attempt.hint_level:''}</Button>
  {open&&<Sheet open title="Exam evidence" onClose={()=>setOpen(false)}>
   <div className="v7-exam-form">
    <p>{title}</p><p>{label}{score?' · '+score+' marks':''}{attempt.seconds!=null?' · '+attempt.seconds+' s':''}</p>
    <p>{attempt.learner_confirmed?'Score agreed':'Score awaiting your agreement'}</p>
    {onChallenge&&<>
     <Field label="Why should the score change?" value={reason} onChange={event=>setReason(event.target.value)} maxLength={500}/>
     <Button disabled={!reason.trim()} onClick={()=>{onChallenge('Challenge score for '+(attempt.delivery_ref??title)+': '+reason.trim());setOpen(false)}}>Challenge score</Button>
    </>}
   </div>
  </Sheet>}
 </>
}
