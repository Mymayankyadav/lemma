import {useId,useState,type FormEvent} from 'react'
import type {BlueprintRow,CardMode,ExamSetup} from '../../data/exam/contract'
import {cardModes} from '../../data/exam/contract'
import type {ProjectDetail} from '../../data/types'
import {Button,Field,Sheet} from '../../ui/v7/components'
import BlockSheet,{instantInZone,zonedInput} from '../calendar/block-sheet/BlockSheet'
import {BlueprintRowSheet} from './BlueprintRowSheet'

const WEEK=7*86400000
export function ExamSetupSheet({data,zone,mode,disabled,allowActivate,onSave,onClose}:{
 data:ProjectDetail;zone:string;mode:CardMode;disabled:boolean;allowActivate:boolean
 onSave:(setup:ExamSetup,draft:boolean)=>Promise<void>;onClose:()=>void
}){
 const formId=useId()
 const [starts,setStarts]=useState('')
 const [pass,setPass]=useState(false),[activate,setActivate]=useState<boolean>()
 const [rows,setRows]=useState<BlueprintRow[]>([])
 const [editing,setEditing]=useState<number|null>(null),[block,setBlock]=useState(false)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const start=instantInZone(starts,zone)
 const withinWeek=start!==null&&Date.parse(start)>Date.now()&&Date.parse(start)-Date.now()<=WEEK
 const selectSources=data.sources.filter(source=>source.status==='ready')
 function reorder(index:number,delta:number){
  const next=[...rows]
  const target=index+delta
  ;[next[index],next[target]]=[next[target],next[index]]
  setRows(next)
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(busy||disabled)return
  const fields=new FormData(event.currentTarget)
  const draft=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft'
  try{
   const title=String(fields.get('title')).trim()
   if(!title||!start)throw new Error('Enter an exam title and a valid start in '+zone+'.')
   const total=Number(fields.get('marks'))
   const passMarks=pass?Number(fields.get('pass')):undefined
   if(passMarks!==undefined&&passMarks>total)throw new Error('The pass mark cannot exceed the total marks.')
   const wall=String(fields.get('last'))
   const last=wall?instantInZone(wall,zone):null
   if(wall&&(!last||Date.parse(last)>Date.parse(start)))throw new Error('The last study block must end by the exam start.')
   const sourceIds=fields.getAll('source')
   if(sourceIds.length>20)throw new Error('Choose up to 20 sources.')
   const sourceRows=selectSources.filter(source=>sourceIds.includes(source.id)).map(source=>({
    source:(source.short||source.id).slice(0,200),note:source.title.slice(0,200),
   }))
   const format=String(fields.get('format')).trim()
   setError('');setBusy(true)
   await onSave({
    project_id:data.project.id,title,starts_at:start,time_zone:zone,duration_minutes:Number(fields.get('duration')),
    study_minutes:Math.round(Number(fields.get('hours'))*60),total_marks:total,
    objective:pass?'pass_threshold':'expected_marks',...(passMarks!==undefined?{pass_marks:passMarks}:{}),
    ...(last?{last_study_at:last}:{}),...(format?{format}:{}),sources:sourceRows,
    blueprint:rows,card_mode:fields.get('cardMode') as CardMode,activate:allowActivate&&(activate??withinWeek),
   },draft)
   onClose()
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not save the exam.')}
  finally{setBusy(false)}
 }
 return <>
  <Sheet open title="Prepare for an exam" eyebrow={data.project.title} onClose={()=>{if(!busy)onClose()}}
   footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button>
    <Button type="submit" form={formId} variant="primary" disabled={busy||disabled}>Save exam</Button></>}>
   <form id={formId} className="v7-exam-form" onSubmit={event=>{void submit(event)}}>
    <fieldset disabled={busy||disabled}>
     <legend>The exam</legend>
     <div className="v7-exam-form">
      <Field name="title" label="Exam title" maxLength={120} defaultValue={data.project.title+' exam'} required/>
      <Field name="starts" label="Exam date and start time" type="datetime-local" hint={zone} value={starts} onChange={event=>setStarts(event.target.value)} required/>
      <div className="v7-exam-form-pair">
       <Field name="duration" label="Duration (minutes)" type="number" min="5" max="600" defaultValue={120} required/>
       <Field name="marks" label="Total marks" type="number" min="0.01" max="10000" step="any" defaultValue={100} required/>
      </div>
      <label className="v7-field-group">Goal
       <select className="v7-field" value={pass?'pass':'marks'} onChange={event=>setPass(event.target.value==='pass')}>
        <option value="marks">Most marks</option><option value="pass">Reach a pass mark</option>
       </select>
      </label>
      {pass&&<Field name="pass" label="Pass mark" type="number" min="0" max="10000" step="any" required/>}
      <label className="v7-field-group">Format notes <textarea className="v7-field" name="format" placeholder="Sections, choice rules or allowed aids" maxLength={1000}/></label>
      {selectSources.length>0&&<details><summary>Exam sources</summary>
       <div className="v7-exam-options">{selectSources.map(source=><label key={source.id} className="v7-exam-check">
        <input type="checkbox" name="source" value={source.id}/> {source.title}
       </label>)}</div></details>}
     </div>
    </fieldset>
    <fieldset disabled={busy||disabled}>
     <legend>Time to prepare</legend>
     <div className="v7-exam-form">
      <Field name="hours" label="Hours you can really study before it" type="number" min="0" max="333.33" step="any" defaultValue={6} required/>
      <Field name="last" label="Last study block ends" type="datetime-local" optional/>
      <div className="v7-exam-actions"><Button onClick={()=>setBlock(true)}>Block time in Calendar</Button></div>
     </div>
    </fieldset>
    <fieldset disabled={busy||disabled}>
     <legend>Blueprint</legend>
     <div className="v7-exam-form">
      <div className="v7-exam-actions">
       <Button type="submit" value="draft">Ask the tutor to draft it</Button>
       <Button onClick={()=>setEditing(rows.length)} disabled={rows.length>=60}>Add row</Button>
      </div>
      {rows.length>0&&<ol className="v7-exam-setup-rows">{rows.map((row,index)=><li key={row.key}>
       <Button onClick={()=>setEditing(index)}>{row.title}</Button>
       <div className="v7-exam-actions">
        <Button aria-label={'Move '+row.title+' up'} disabled={index===0} onClick={()=>reorder(index,-1)}>↑</Button>
        <Button aria-label={'Move '+row.title+' down'} disabled={index===rows.length-1} onClick={()=>reorder(index,1)}>↓</Button>
       </div>
      </li>)}</ol>}
     </div>
    </fieldset>
    <fieldset disabled={busy||disabled}>
     <legend>Cards during prep</legend>
     <div className="v7-exam-form">
      <label className="v7-field-group">Card creation
       <select className="v7-field" name="cardMode" defaultValue={mode}>
        {cardModes.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
       </select>
      </label>
      <label className="v7-exam-check"><input type="checkbox" disabled={!allowActivate} checked={allowActivate&&(activate??withinWeek)} onChange={event=>setActivate(event.target.checked)}/> Start prep now</label>
     </div>
    </fieldset>
    {error&&<p role="alert">{error}</p>}
   </form>
  </Sheet>
  {editing!==null&&<BlueprintRowSheet row={rows[editing]} checkpoints={data.checkpoints} disabled={disabled}
   onClose={()=>setEditing(null)} onSave={row=>setRows(list=>editing===list.length?[...list,row]:list.map((old,index)=>index===editing?row:old))}/>}
  {block&&<BlockSheet v7 block={null} initialTitle={'Exam prep: '+data.project.title}
   date={zonedInput(new Date().toISOString(),zone).slice(0,10)} zone={zone} onClose={()=>setBlock(false)} onRefresh={()=>{}}/>}
 </>
}
