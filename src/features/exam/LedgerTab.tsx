import {useId,useState,type FormEvent} from 'react'
import {Link} from 'react-router'
import type {ExamPlan,ExamRow} from '../../../supabase/functions/_shared/exam/plan'
import type {BlueprintRow,SittingChange,SittingRecord} from '../../data/exam/contract'
import type {ProjectDetail} from '../../data/types'
import {Button,Field,Sheet} from '../../ui/v7/components'
import {BlueprintRowSheet} from './BlueprintRowSheet'
import {TopicReview} from './TopicReview'
import {NextCard} from './NextCard'
import {examTutorHref,marks,remainingTime,titleCase} from './model'
import {formatDuration} from '../../lib/format'

type Editor = {kind:'row';base:SittingRecord;row?:BlueprintRow} | {kind:'skip'|'defer';row:BlueprintRow} | {kind:'time'} | {kind:'review';row:BlueprintRow;exposure:number}

export function LedgerTab({sitting,plan,project,now,disabled,onChange}:{
 sitting:SittingRecord;plan:ExamPlan;project:ProjectDetail;now:number;disabled:boolean
 onChange:(change:SittingChange,base?:SittingRecord)=>Promise<void>
}){
 const formId=useId()
 const [editor,setEditor]=useState<Editor|null>(null),[reason,setReason]=useState('')
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [expanded,setExpanded]=useState<string>()
 const closed=sitting.status==='finished'||sitting.status==='cancelled'
 const readOnly=closed||disabled
 const changeDisabled=readOnly||busy
 const time=remainingTime(sitting.starts_at,now)
 const rows=plan.rows
 function open(edit:Editor){
  setError('')
  setReason(edit.kind==='defer'||edit.kind==='skip'?sitting.ledger[edit.row.key]?.reason??'':'')
  setEditor(edit)
 }
 async function apply(change:SittingChange){
  if(changeDisabled)return false
  try{setBusy(true);setError('');await onChange(change);return true}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not update the exam ledger.');return false}
  finally{setBusy(false)}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const data=new FormData(event.currentTarget)
  if(editor?.kind==='time'){
   if(await apply({operation:'update',patch:{study_minutes:Number(data.get('minutes'))}}))setEditor(null)
  }else if(editor?.kind==='skip'||editor?.kind==='defer'){
   const reopen=String(data.get('reopen')??'').trim()
   if(!reason.trim()||(editor.kind==='defer'&&!reopen)){
    setError('Enter a reason'+(editor.kind==='defer'?' and a reopen condition.':'.'))
    return
   }
   if(await apply({operation:'set_disposition',patch:{rows:[{key:editor.row.key,disposition:editor.kind,reason:reason.trim(),...(reopen?{reopen}:{})}]}}))
    setEditor(null)
  }
 }
 function rowActions({row,disposition}:ExamRow){
  const pin=disposition?.disposition==='pin'
  return <div className="v7-exam-actions">
   {!closed&&<><Button disabled={changeDisabled} onClick={()=>{void apply({operation:'set_disposition',patch:{rows:[{key:row.key,disposition:pin?'none':'pin'}]}})}}>{pin?'Unpin':'Pin'}</Button>
    <Button disabled={changeDisabled} onClick={()=>open({kind:'defer',row})}>Defer…</Button>
    <Button disabled={changeDisabled} onClick={()=>open({kind:'skip',row})}>Skip…</Button>
    <Button disabled={changeDisabled} onClick={()=>open({kind:'row',base:sitting,row})}>Edit row</Button>
    {disposition&&disposition.disposition!=='pin'&&<Button disabled={changeDisabled} onClick={()=>{void apply({operation:'set_disposition',patch:{rows:[{key:row.key,disposition:'none'}]}})}}>Clear disposition</Button>}
   </>}
   <Button disabled={disabled||closed} onClick={()=>open({kind:'review',row,exposure:plan.rows.find(item=>item.row.key===row.key)?.exposure??0})}>Review this topic</Button>
  </div>
 }
 return <div className="v7-exam-ledger">
  <section className="v7-exam-summary" aria-label="Exam coverage summary">
   <h2 className="v7-subhead">{sitting.title}</h2>
   {closed&&<p>Exam finished</p>}
   <ul className="v7-exam-metrics">
    {sitting.total_marks!=null&&<li><strong>{marks(sitting.total_marks)}</strong> total marks</li>}
    <li><strong>{marks(plan.coverage.accounted)}{sitting.total_marks!=null?'/'+marks(sitting.total_marks):''}</strong> accounted</li>
    <li><strong>{marks(plan.coverage.secure)}</strong> independently covered</li>
    <li><strong>{marks(plan.coverage.deferred)}</strong> deferred</li>
   </ul>
   <p>{plan.minutes===null?'Study time unplanned':(formatDuration(plan.minutes)||'0 min')+' left'}{time?' · '+time:''}</p>
  </section>
  {plan.conflicts.length>0&&<section className="v7-exam-panel v7-exam-callout" aria-label="Coverage conflict">
   <h2 className="v7-subhead">Coverage conflict</h2>
   <ul>{plan.conflicts.map(conflict=><li key={conflict}>{conflict}</li>)}</ul>
   <div className="v7-exam-actions">
    {!closed&&<Button onClick={()=>open({kind:'time'})} disabled={changeDisabled}>Add time</Button>}
    <Button onClick={()=>document.getElementById('exam-ledger-rows')?.scrollIntoView({block:'start'})}>See plan</Button>
   </div>
  </section>}
  {!closed&&rows.length>0&&<NextCard plan={plan} project={project} sittingId={sitting.id} disabled={disabled}/>}
  {error&&!editor&&<p role="alert">{error}</p>}
  <section id="exam-ledger-rows" aria-label="Blueprint rows">
   <div className="v7-exam-ledger-heading"><h2 className="v7-subhead">Coverage ledger</h2>
    {!closed&&rows.length>0&&<Button onClick={()=>open({kind:'row',base:sitting})} disabled={changeDisabled||rows.length>=60}>Add row</Button>}
   </div>
   {rows.length===0?<div className="v7-exam-panel"><p>No blueprint yet.</p>
    {!closed&&<div className="v7-exam-actions">
     {!disabled&&<Link className="v7-button v7-secondary" to={examTutorHref(project,sitting.id,'draft')}><span>Ask the tutor to draft it</span></Link>}
     <Button onClick={()=>open({kind:'row',base:sitting})} disabled={disabled}>Add rows</Button>
    </div>}
   </div>:<ul className="v7-exam-rows" aria-label="Scored task families">{rows.map(item=>{
    const {row,disposition,status}=item,openRow=expanded===row.key
    return <li key={row.key} className="v7-exam-row">
     <button type="button" className="v7-exam-row-toggle" aria-expanded={openRow} onClick={()=>setExpanded(openRow?undefined:row.key)}>
      <strong>{row.title}</strong><span>{marks(row.marks)} marks</span>
      <span className="v7-exam-row-chips"><span className="v7-exam-chip" data-status={status}>{titleCase(status)}</span>
       {disposition&&<span className="v7-exam-chip">{titleCase(disposition.disposition)}</span>}</span>
      <small>{marks(item.exposure)} exposed</small>
     </button>
     {openRow&&<div className="v7-exam-row-detail">
      <p>{titleCase(item.fact)}</p>
      {disposition?.reason&&<p><strong>Reason</strong> · {disposition.reason}</p>}
      {disposition?.reopen&&<p><strong>Reopen when</strong> · {disposition.reopen}</p>}
      <p>{row.marks_low!==undefined||row.marks_high!==undefined?marks(row.marks_low??row.marks)+'–'+marks(row.marks_high??row.marks)+' marks · ':''}
       {marks((row.chance??1)*100)}% chance{row.compulsory?' · Compulsory':''}{row.provisional?' · Provisional weight':''}</p>
      {row.concepts?.length? <p><strong>Concepts</strong> · {row.concepts.join(', ')}</p>:null}
      {row.checkpoints?.length? <p><strong>Checkpoints</strong> · {row.checkpoints.join(', ')}</p>:null}
      {row.source&&<p><strong>Source</strong> · {row.source}</p>}
      {rowActions(item)}
     </div>}
    </li>
   })}</ul>}
  </section>
  {editor?.kind==='row'&&<BlueprintRowSheet row={editor.row} checkpoints={project.checkpoints} disabled={readOnly} onClose={()=>setEditor(null)}
   onSave={row=>onChange({operation:'update',patch:{blueprint:editor.row?editor.base.blueprint.map(old=>old.key===row.key?row:old):[...editor.base.blueprint,row]}},editor.base)}/>}
  {editor?.kind==='review'&&<Sheet open title="Review this topic" onClose={()=>setEditor(null)}>
   <TopicReview slug={project.project.slug} sittingId={sitting.id} row={editor.row} exposure={editor.exposure}/>
  </Sheet>}
  {editor&&editor.kind!=='row'&&editor.kind!=='review'&&<Sheet open title={editor.kind==='time'?'Study time left':titleCase(editor.kind)+' row'} onClose={()=>{if(!busy)setEditor(null)}}
   footer={<><Button onClick={()=>setEditor(null)} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form={formId} disabled={changeDisabled}>Save</Button></>}>
   <form id={formId} className="v7-exam-form" onSubmit={event=>{void submit(event)}}>
    {editor.kind==='time'?<Field label="Study minutes left" type="number" name="minutes" min="0" max="20000" required defaultValue={sitting.study_minutes??0}/>
     :<><p>{editor.row.title}</p>
      <Field label="Reason" value={reason} onChange={event=>setReason(event.target.value)} maxLength={300} required/>
      {editor.kind==='defer'&&<>
       <div className="v7-exam-actions">{['Low marks','Covered elsewhere','No time'].map(text=><Button key={text} onClick={()=>setReason(text)}>{text}</Button>)}</div>
       <Field label="Reopen when" name="reopen" maxLength={200} defaultValue={sitting.ledger[editor.row.key]?.reopen} required/>
      </>}
     </>}
    {error&&<p role="alert">{error}</p>}
   </form>
  </Sheet>}
 </div>
}
