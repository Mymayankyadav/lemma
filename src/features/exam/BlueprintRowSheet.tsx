import {useId,useState,type FormEvent} from 'react'
import type {BlueprintRow} from '../../data/exam/contract'
import type {CheckpointView} from '../../data/types'
import {useAtlas} from '../../data/hooks'
import {Button,Field,Sheet} from '../../ui/v7/components'

function checkedNumber(value:FormDataEntryValue|null,label:string,min:number,max:number,required=false){
 if(value===null||String(value).trim()===''){
  if(required)throw new Error('Enter '+label.toLowerCase()+'.')
  return undefined
 }
 const number=Number(value)
 if(!Number.isFinite(number)||number<min||number>max)throw new Error(label+' must be between '+min+' and '+max+'.')
 return number
}

export function BlueprintRowSheet({row,checkpoints,disabled,onSave,onClose}:{
 row?:BlueprintRow;checkpoints:CheckpointView[];disabled?:boolean;onSave:(row:BlueprintRow)=>Promise<void>|void;onClose:()=>void
}){
 const formId=useId(), atlas=useAtlas()
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [concepts,setConcepts]=useState(row?.concepts??[])
 const [query,setQuery]=useState('')
 const [checkpointCodes,setCheckpointCodes]=useState(row?.checkpoints??[])
 const [chance,setChance]=useState(row?.chance===undefined||[1,0.8,0.5].includes(row.chance)?String(row?.chance??1):'custom')
 const options=(atlas.data?.concepts??[]).filter(concept=>!concepts.includes(concept.slug)&&
  (concept.name+' '+concept.slug).toLowerCase().includes(query.trim().toLowerCase())).slice(0,8)
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(busy||disabled)return
  try{
   const form=new FormData(event.currentTarget)
   const title=String(form.get('title')).trim()
   if(!title)throw new Error('Enter a scored task family.')
   const scored=checkedNumber(form.get('marks'),'Marks',0.01,1000,true)!
   const low=checkedNumber(form.get('low'),'Lower marks',0,scored)
   const high=checkedNumber(form.get('high'),'Upper marks',scored,1000)
   const probability=chance==='custom'?checkedNumber(form.get('custom'),'Chance',0.01,1,true)!:Number(chance)
   const minutes=checkedNumber(form.get('minutes'),'Exam minutes',0.01,600)
   const section=String(form.get('section')).trim(), source=String(form.get('source')).trim()
   const patch:BlueprintRow={
    ...row,key:row?.key??crypto.randomUUID(),title,marks:scored,marks_low:low,marks_high:high,chance:probability,
    compulsory:form.has('compulsory'),concepts,checkpoints:checkpointCodes,section:section||undefined,source:source||undefined,minutes,
   }
   setBusy(true);setError('')
   await onSave(patch)
   onClose()
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not save this row.')}
  finally{setBusy(false)}
 }
 return <Sheet open title={row?'Edit blueprint row':'Add blueprint row'} onClose={()=>{if(!busy)onClose()}}
  footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form={formId} disabled={busy||disabled}>{row?'Save row':'Add row'}</Button></>}>
  <form id={formId} className="v7-exam-form" onSubmit={event=>{void submit(event)}}>
   <Field name="title" label="Scored task family" hint="Write what earns marks, such as proving a map is a quotient map using the universal property." defaultValue={row?.title} maxLength={200} required/>
   <Field name="marks" label="Marks" type="number" min="0.01" max="1000" step="any" defaultValue={row?.marks} required/>
   <div className="v7-exam-form-pair">
    <Field name="low" label="Lower marks" type="number" min="0" max="1000" step="any" defaultValue={row?.marks_low} optional/>
    <Field name="high" label="Upper marks" type="number" min="0" max="1000" step="any" defaultValue={row?.marks_high} optional/>
   </div>
   <label className="v7-field-group">How likely is it to appear?
    <select className="v7-field" value={chance} onChange={event=>setChance(event.target.value)}>
     <option value="1">Always (100%)</option><option value="0.8">Likely (80%)</option><option value="0.5">Maybe (50%)</option><option value="custom">Custom</option>
    </select>
   </label>
   {chance==='custom'&&<Field name="custom" label="Chance (0.01–1)" type="number" min="0.01" max="1" step="any" defaultValue={row?.chance} required/>}
   <label className="v7-exam-check"><input type="checkbox" name="compulsory" defaultChecked={row?.compulsory}/> Compulsory</label>
   <Field label="Find an Atlas concept" value={query} onChange={event=>setQuery(event.target.value)}/>
   {concepts.length>0&&<div className="v7-exam-actions">{concepts.map(concept=><Button key={concept} aria-label={'Remove concept '+concept} onClick={()=>setConcepts(list=>list.filter(value=>value!==concept))}>{concept} ×</Button>)}</div>}
   {query.trim()&&<div className="v7-exam-actions">{options.map(concept=><Button key={concept.slug} disabled={concepts.length>=8} onClick={()=>{setConcepts(list=>[...list,concept.slug]);setQuery('')}}>{concept.name}</Button>)}
    {!options.length&&<p>No matching concepts.</p>}</div>}
   {checkpoints.length>0&&<details><summary>Checkpoints{checkpointCodes.length>0?' ('+checkpointCodes.length+')':''}</summary>
    <div className="v7-exam-options">{checkpoints.map(cp=><label className="v7-exam-check" key={cp.id}>
     <input type="checkbox" disabled={checkpointCodes.length>=8&&!checkpointCodes.includes(cp.code)} checked={checkpointCodes.includes(cp.code)} onChange={event=>setCheckpointCodes(list=>event.target.checked?[...list,cp.code]:list.filter(code=>code!==cp.code))}/> {cp.code} · {cp.title}
    </label>)}</div>
   </details>}
   <div className="v7-exam-form-pair">
    <Field name="section" label="Section" defaultValue={row?.section} maxLength={40} optional/>
    <Field name="minutes" label="Exam minutes" defaultValue={row?.minutes} type="number" min="0.01" max="600" step="any" optional/>
   </div>
   <Field name="source" label="Source for marks" defaultValue={row?.source} maxLength={300} optional/>
   {error&&<p role="alert">{error}</p>}
  </form>
 </Sheet>
}
