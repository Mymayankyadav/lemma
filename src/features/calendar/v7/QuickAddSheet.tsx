import {useEffect,useState} from 'react';
import {getStudyApi} from '../../../data/study';
import {getTaskApi} from '../../../data/tasks';
import type {ProjectSummary} from '../../../data/types';
import {Button,Chip,Field,Segmented,Sheet,Picker} from '../../../ui/v7/components';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import {kitSubject} from '../../atlas/v7/model';
import {formatClock,formatShortDate} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {DEFAULT_LENGTH,QUICK_LENGTHS,quickInput,quickStart,startLabel} from './quickAddModel';
import {isFlagOn} from '../../../flags';
import {RulerSlider} from '../../../ui/v7/RulerSlider';

/** Tap an empty slot, type a title, pick a length. Everything else lives under More options. */
export default function QuickAddSheet({open,date,zone,start,taskId,length,projects,onClose,onSaved,onMore}:{
 open:boolean;date:string;zone:string;start:string|null;taskId:string|null;length:number|null;projects:readonly ProjectSummary[];
 onClose:()=>void;onSaved:()=>void;onMore:(startsAt:string,carry:{title:string;taskId:string|null;minutes:number})=>void;
}){
 const notify=useToast();
 const [title,setTitle]=useState(''),[minutes,setMinutes]=useState<number>(length??DEFAULT_LENGTH),[study,setStudy]=useState(true);
 const [projectId,setProjectId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const startsAt=quickStart(date,zone,start);
 useEffect(()=>{
  if(!open)return;
  setTitle('');setError('');setStudy(true);setProjectId('');setMinutes(length??DEFAULT_LENGTH);
  if(!taskId)return;
  let live=true;
  void getTaskApi().getTask(taskId).then(task=>{if(live&&task)setTitle(task.title);}).catch(()=>{});
  return()=>{live=false;};
 },[open,taskId,length]);
 async function save(){
  if(busy)return;
  let input;
  try{input=quickInput({title,kind:study?'study':'busy',startsAt,minutes,zone,projectId:study?projectId:'',taskId});}
  catch(problem){setError((problem as Error).message);return;}
  setBusy(true);setError('');
  try{
   const api=getStudyApi(),receipt=await api.createCalendarBlock(input);
   onSaved();onClose();
   notify('Added '+input.title+' at '+startLabel(startsAt,zone),{tone:'success',action:{label:'Undo',onClick:()=>{
    void api.deleteCalendarBlock(receipt.record.id,receipt.record.version).then(onSaved).catch(()=>notify('Could not undo the block',{tone:'danger'}));
   }}});
  }catch(problem){setError((problem as Error).message||'Could not save the block. Try again.');}
  finally{setBusy(false);}
 }
 return <Sheet open={open} onClose={onClose} title="New block" eyebrow={formatShortDate(startsAt,{zone})+' · '+formatClock(startsAt,{zone})+'–'+formatClock(new Date(Date.parse(startsAt)+minutes*60_000),{zone})} footer={<>
   <Button variant="ghost" onClick={()=>onMore(startsAt,{title:title.trim(),taskId,minutes})}>More options</Button>
   <Button variant="primary" loading={busy} onClick={()=>{void save();}}>Add block</Button></>}>
  <form className="v7-qa" onSubmit={event=>{event.preventDefault();void save();}}>
   <Field label="Title" value={title} autoFocus maxLength={200} error={error||undefined} onChange={event=>setTitle(event.target.value)}/>
   {isFlagOn('v7Ruler')?<RulerSlider label="Length" min={5} max={600} value={minutes} onChange={setMinutes} format={value=>value+' min'} tickFormat={value=>value/60+'h'}/>:<div className="v7-qa-row" role="group" aria-label="Length">
    {QUICK_LENGTHS.map(length=><Chip key={length} selected={minutes===length} onClick={()=>setMinutes(length)}>{length} min</Chip>)}
    {!(QUICK_LENGTHS as readonly number[]).includes(minutes)&&<Chip selected onClick={()=>{}}>{minutes} min</Chip>}
   </div>}
   {/* QA2: a form that is submitted later uses a segmented control, not a switch. */}
   <Segmented label="Block type" options={['Study','Busy']} value={study?'Study':'Busy'} onChange={value=>setStudy(value==='Study')}/>
   {/* QA1/KC2: the path chips carry their subject glyph in the subject colour. */}
   {study&&projects.length>0&&<div className="v7-qa-row" role="group" aria-label="Path">
    {/* R2 · F76: four chips (plus the chosen one) and, beyond that, a searchable picker of every path. */}
    {projects.filter((project,index)=>index<4||project.id===projectId).map(project=>{const subject=kitSubject(project.subject.name);
     return <button key={project.id} type="button" className={'v7-filter-chip '+subjectClass(subject)} aria-pressed={projectId===project.id}
      onClick={()=>setProjectId(projectId===project.id?'':project.id)}><SubjectMark subject={subject}/>{project.title}</button>;})}
   </div>}
   {study&&projects.length>4&&<Picker label="Another path" optional value={projects.find(project=>project.id===projectId)?.title??'None'}
    options={['None',...projects.map(project=>project.title)]} onChange={title=>setProjectId(projects.find(project=>project.title===title)?.id??'')}/>}
  </form>
 </Sheet>;
}
