import {useMemo,useState} from 'react';
import {CircleX,Plus,Trash2} from 'lucide-react';
import {getStudyApi} from '../../../data/study';
import {useProjects} from '../../../data/hooks';
import type {StudyCorrectionPatch,StudyEntryRecord} from '../../../data/study/contract';
import {ratingText,studyRatings} from '../../../lib/labels';
import {Button,DatePicker,Field,IconButton,Picker,Segmented,Sheet} from '../../../ui/v7/components';
import {intervalRows,intervalsFromRows,type LocalIntervalRow} from '../interval-editor';
import {localClockInstant,localWallParts} from '../local-time';
import {changeStudyProject} from '../relations';

const CLOCK=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const nextDay=(day:string)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
/** One edited interval row as day + start + end; an end before the start ends on the next day. */
export function rowFromParts(kind:LocalIntervalRow['kind'],day:string,start:string,end:string):LocalIntervalRow{
 return {kind,startDay:day,startTime:start,endDay:CLOCK.test(start)&&CLOCK.test(end)&&end<=start?nextDay(day):day,endTime:end};
}
/** Typing help for 24-hour times: "930" → "09:30", "1745" → "17:45". */
export function normaliseClock(value:string):string{
 const digits=value.replace(/[^\d]/g,'').slice(0,4);
 if(/^\d{3}$/.test(digits))return '0'+digits[0]+':'+digits.slice(1);
 if(/^\d{4}$/.test(digits))return digits.slice(0,2)+':'+digits.slice(2);
 return value;
}

/**
 * Release plan R0 · F02: the time-log entry editor in the standard Form sheet: what you studied, focus, reflection,
 * the path, the intervals as day + 24-hour start and end, and Split. The app's own date picker; no native select,
 * date or time control; ghost Cancel left and indigo Save right. Corrections use the existing study API unchanged.
 */
export function EntrySheetV7({entry,onChange,onClose,busy}:{entry:StudyEntryRecord;onChange:()=>Promise<void>;onClose:()=>void;busy:boolean}){
 const api=getStudyApi(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const projects=useProjects(),projectRows=useMemo(()=>(projects.data??[]).filter(p=>p.status!=='archived'||p.id===entry.projectId),[projects.data,entry.projectId]);
 const [intent,setIntent]=useState(entry.intent),[reflection,setReflection]=useState(entry.reflection??'');
 const [rating,setRating]=useState<number|null>(entry.rating);
 const [relations,setRelations]=useState({subjectId:entry.subjectId??'',projectId:entry.projectId??'',checkpointId:entry.checkpointId??'',sessionId:entry.sessionId??''});
 const [rows,setRows]=useState(()=>intervalRows(entry.intervals.filter(i=>i.end!==null).map(i=>({kind:i.kind,start:i.start,end:i.end as string})),zone));
 const [splitOpen,setSplitOpen]=useState(false),[splitDay,setSplitDay]=useState(()=>rows[0]?.startDay??localWallParts(new Date().toISOString(),zone).day),[splitTime,setSplitTime]=useState('');
 const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
 const validation=intervalsFromRows(rows,zone),disabled=busy||submitting;
 const projectNames=['No path',...projectRows.map(p=>p.title)];
 async function commit(work:()=>Promise<unknown>){
  if(disabled)return;setSubmitting(true);setError('');
  try{await work();await onChange();}
  catch{setError('We couldn’t save this change. Nothing was lost; try again.');}
  finally{setSubmitting(false);}
 }
 function save(){
  const value:StudyCorrectionPatch={intent:intent.trim(),reflection:reflection.trim()||null,rating:rating as StudyEntryRecord['rating'],
   subjectId:relations.subjectId||null,projectId:relations.projectId||null,checkpointId:relations.checkpointId||null,sessionId:relations.sessionId||null};
  if(!value.intent){setError('Say what you studied.');return;}
  if(validation.errors.some(Boolean)){setError(validation.errors.find(Boolean)??'Check the times.');return;}
  value.intervals=validation.intervals;
  void commit(()=>api.correctStudyEntry(entry.id,entry.version,value));
 }
 const update=(index:number,next:Partial<{kind:LocalIntervalRow['kind'];day:string;start:string;end:string}>)=>setRows(rows.map((row,i)=>{
  if(i!==index)return row;
  return rowFromParts(next.kind??row.kind,next.day??row.startDay,next.start??row.startTime,next.end??row.endTime);
 }));
 if(entry.voidedAt)return <Sheet open onClose={onClose} eyebrow="Time log" title="Restore this entry?"
  footer={<><Button variant="ghost" disabled={disabled} onClick={onClose}>Keep voided</Button><Button variant="primary" loading={submitting} onClick={()=>{void commit(()=>api.restoreStudyEntry(entry.id,entry.version));}}>Restore entry</Button></>}>
  <p>“{entry.intent}” is voided and not counted. Restore it to count its time again.</p>
  {error&&<p className="v7-error" role="alert"><CircleX aria-hidden="true"/>{error}</p>}
 </Sheet>;
 return <Sheet open onClose={onClose} eyebrow="Time log" title="Edit entry"
  footer={<><Button variant="ghost" disabled={disabled} onClick={onClose}>Cancel</Button><Button variant="primary" loading={submitting} onClick={save}>Save changes</Button></>}>
  <form className="v7-form-stack" noValidate onSubmit={event=>{event.preventDefault();save();}}>
   <Field label="What you studied" value={intent} onChange={event=>setIntent(event.target.value)} error={error==='Say what you studied.'?error:undefined}/>
   <Picker label="How focused" value={ratingText(rating)} options={['Not rated',...studyRatings.map(n=>ratingText(n))]} onChange={text=>setRating(studyRatings.find(n=>ratingText(n)===text)??null)}/>
   <div className="v7-field-group"><label htmlFor={'reflection-'+entry.id}>Reflection<span className="v7-field-optional"> · Optional</span></label>
    <textarea id={'reflection-'+entry.id} className="v7-field v7-textarea" rows={3} value={reflection} onChange={event=>setReflection(event.target.value)} placeholder="What did you learn?"/></div>
   <Picker label="Path" optional value={projectRows.find(p=>p.id===relations.projectId)?.title??'No path'} options={projectNames}
    onChange={name=>{const project=projectRows.find(p=>p.title===name);setRelations(changeStudyProject(relations,project?{id:project.id,subjectId:project.subject.id}:null));}}/>
   <fieldset className="v7-interval-list"><legend className="v7-subhead">Study intervals</legend>
    {rows.map((row,index)=><div key={index} className="v7-interval-row" role="group" aria-label={'Interval '+(index+1)}>
     <div className="v7-interval-head"><Segmented label={'Interval '+(index+1)+' type'} options={['Focus','Break']} value={row.kind==='focus'?'Focus':'Break'} onChange={value=>update(index,{kind:value==='Focus'?'focus':'break'})}/>
      <IconButton label={'Remove interval '+(index+1)} disabled={rows.length<2} onClick={()=>setRows(rows.filter((_,i)=>i!==index))}><Trash2 aria-hidden="true"/></IconButton></div>
     <DatePicker label="Day" value={row.startDay} onChange={day=>update(index,{day})}/>
     <div className="v7-interval-times">
      <Field label="Start" inputMode="numeric" maxLength={5} placeholder="09:00" value={row.startTime} onChange={event=>update(index,{start:event.target.value})} onBlur={event=>update(index,{start:normaliseClock(event.target.value)})}/>
      <Field label="End" inputMode="numeric" maxLength={5} placeholder="09:50" value={row.endTime} onChange={event=>update(index,{end:event.target.value})} onBlur={event=>update(index,{end:normaliseClock(event.target.value)})}
       hint={row.endDay!==row.startDay?'Ends the next day':undefined}/>
     </div>
     {validation.errors[index]&&<p className="v7-error" role="alert"><CircleX aria-hidden="true"/>{validation.errors[index]}</p>}
    </div>)}
    <Button small onClick={()=>{const day=rows.at(-1)?.startDay??splitDay;setRows([...rows,rowFromParts('focus',day,'','')]);}}><Plus aria-hidden="true"/>Add interval</Button>
   </fieldset>
   {splitOpen?<fieldset className="v7-interval-list"><legend className="v7-subhead">Split this entry in two</legend>
    <DatePicker label="Day" value={splitDay} onChange={setSplitDay}/>
    <Field label="At" inputMode="numeric" maxLength={5} placeholder="10:15" value={splitTime} onChange={event=>setSplitTime(event.target.value)} onBlur={event=>setSplitTime(normaliseClock(event.target.value))} hint="24-hour time inside the entry"/>
    <Button small disabled={disabled||!CLOCK.test(splitTime)} onClick={()=>{
     const at=localClockInstant(splitDay,splitTime,zone);
     if(!at){setError('Choose a time inside this entry to split it.');return;}
     void commit(()=>api.splitStudyEntry(entry.id,entry.version,at));
    }}>Split entry</Button>
   </fieldset>:<Button small variant="ghost" onClick={()=>setSplitOpen(true)}>Split this entry in two</Button>}
   {error&&error!=='Say what you studied.'&&<p className="v7-error" role="alert"><CircleX aria-hidden="true"/>{error}</p>}
   <button type="submit" hidden/>
  </form>
 </Sheet>;
}
