import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Download,Pencil,Scissors,Ban,RotateCcw} from 'lucide-react';
import {getStudyApi} from '../../../data/study';
import type {StudyEntryRecord} from '../../../data/study/contract';
import {useProjects,useSettings} from '../../../data/hooks';
import {HubHeader} from '../../../app/v7/V7Shell';
import {Button,DatePicker,Field,IconButton,Sheet,Skeleton} from '../../../ui/v7/components';
import {TimeRange} from '../../../ui/v7/KitPrimitives';
import {RowMenu} from '../../../ui/v7/RowMenu';
import {EntrySheetV7} from './EntrySheetV7';
import {StatusBadge} from '../../../ui/v7/Status';
import {subjectClass} from '../../../ui/v7/Subject';
import {formatClock,formatDuration,formatLongDate,formatShortDate,ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {weekStartDay} from '../../calendar/model';
import {civilDay,addDays} from '../../progress-v6/model';
import {ProgressTabs} from '../../insights/v7/ProgressV7';
import {csvLog,logDate,visibleLogRange,visibleLogRecords} from '../Page';
import {manualFocusInterval} from '../local-time';
import '../../insights/v7/progress.css';
import './log.css';

const focusMinutes=(entry:StudyEntryRecord)=>entry.intervals.filter(i=>i.kind==='focus'&&i.end).reduce((sum,i)=>sum+(Date.parse(i.end!)-Date.parse(i.start))/60000,0);
const spanOf=(entry:StudyEntryRecord)=>{const closed=entry.intervals.filter(i=>i.end);return closed.length?{start:closed[0].start,end:closed[closed.length-1].end!}:null;};

/** PLAN §6.13 Log: the week strip as navigator, entries grouped by day with a subject bar, the time range, duration and rating
 *  dots; Edit, Split and Void per entry; Add time; Export CSV. */
export default function TimeLogV7(){
 const settings=useSettings(),projects=useProjects(),notify=useToast(),api=getStudyApi();
 const zone=ownerZone(settings.data),today=civilDay(new Date(),zone);
 const [week,setWeek]=useState(()=>weekStartDay(today)),[rows,setRows]=useState<StudyEntryRecord[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[reload,setReload]=useState(0);
 const [editing,setEditing]=useState<StudyEntryRecord|null>(null),[voiding,setVoiding]=useState<StudyEntryRecord|null>(null),[adding,setAdding]=useState(false),[busy,setBusy]=useState(false);
 const [intent,setIntent]=useState(''),[day,setDay]=useState(today),[start,setStart]=useState('09:00'),[end,setEnd]=useState('09:50'),[problem,setProblem]=useState('');
 const range=useMemo(()=>visibleLogRange(week,zone),[week,zone]);
 useEffect(()=>{
  let alive=true;setStatus('loading');
  void api.listStudyEntries(range).then(all=>{if(alive){setRows(visibleLogRecords(all));setStatus('ready');}}).catch(()=>{if(alive)setStatus('error');});
  return()=>{alive=false;};
 },[api,range,reload]);
 const days=Array.from({length:7},(_,index)=>addDays(week,index));
 const byDay=useMemo(()=>{const map=new Map<string,StudyEntryRecord[]>();for(const entry of rows){const key=logDate(entry,zone);map.set(key,[...(map.get(key)??[]),entry]);}return map;},[rows,zone]);
 const look=(entry:StudyEntryRecord)=>{const project=projects.data?.find(row=>row.id===entry.projectId);return {klass:subjectClass(kitSubject(project?.subject.name??'')),path:project?.title??null};};
 function exportCsv(){
  const href=URL.createObjectURL(new Blob([csvLog(rows,zone)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=href;link.download='lemma-time-'+week+'.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(href);
 }
 async function addTime(){
  setBusy(true);setProblem('');
  try{
   if(!intent.trim())throw Error('Write what you studied.');
   await api.createManualStudyEntry({intent:intent.trim(),reflection:null,intervals:[manualFocusInterval(day,start,end,zone)]});
   setAdding(false);setIntent('');setReload(value=>value+1);notify('Time added',{tone:'success'});
  }catch(error){setProblem(error instanceof Error?error.message:'Could not add the time.');}finally{setBusy(false);}
 }
 async function voidEntry(entry:StudyEntryRecord){
  setBusy(true);
  try{
   const result=await api.voidStudyEntry(entry.id,entry.version);
   setVoiding(null);setReload(value=>value+1);
   notify('Entry voided',{tone:'success',action:{label:'Undo',onClick:()=>{void api.restoreStudyEntry(entry.id,result.record.version).then(()=>setReload(value=>value+1)).catch(()=>notify('Could not restore the entry',{tone:'danger'}));}}});
  }catch{notify('Could not void the entry',{tone:'danger'});}finally{setBusy(false);}
 }
 const weekTotal=rows.filter(entry=>!entry.voidedAt).reduce((sum,entry)=>sum+focusMinutes(entry),0);
 return <main id="main-content" className="v7-page v7-log" aria-label="Time log">
  <HubHeader title="Progress"><ProgressTabs current="log"/></HubHeader>
  <div className="v7-log-week">
   <IconButton label="Previous week" onClick={()=>setWeek(addDays(week,-7))}><ChevronLeft aria-hidden="true"/></IconButton>
   <div className="v7-log-strip" role="list" aria-label={'Week of '+formatShortDate(week,{zone})}>{days.map(item=>{const total=(byDay.get(item)??[]).filter(entry=>!entry.voidedAt).reduce((sum,entry)=>sum+focusMinutes(entry),0);
    return <a key={item} role="listitem" href={'#log-'+item} className="v7-log-day" data-today={item===today||undefined} aria-label={formatLongDate(item,{zone})+': '+formatDuration(total)}>
     <small>{formatShortDate(item,{zone}).slice(0,1)}</small><span>{Number(item.slice(8,10))}</span><i style={{opacity:total?Math.min(1,.3+total/180):0}}/></a>;})}</div>
   <IconButton label="Next week" onClick={()=>setWeek(addDays(week,7))}><ChevronRight aria-hidden="true"/></IconButton>
  </div>
  <div className="v7-log-summary"><span>{formatDuration(weekTotal)} this week</span>
   <span className="v7-log-actions"><Button small onClick={()=>setAdding(true)}>Add time</Button>
    <RowMenu label="More time log actions" title="Time log" items={[{label:'Export CSV',icon:<Download aria-hidden="true"/>,onClick:exportCsv}]}/></span></div>
  {status==='loading'&&<Skeleton/>}
  {status==='error'&&<div role="alert" className="v7-progress-error"><p>Could not load the time log.</p><Button onClick={()=>setReload(value=>value+1)}>Retry</Button></div>}
  {status==='ready'&&(rows.length?days.slice().reverse().filter(item=>byDay.has(item)).map(item=><section key={item} id={'log-'+item} className="v7-log-group" aria-label={formatLongDate(item,{zone})}>
   <h2 className="v7-eyebrow">{formatLongDate(item,{zone})}</h2>
   <ul>{byDay.get(item)!.map(entry=>{const span=spanOf(entry),{klass,path}=look(entry);return <li key={entry.id} className={'v7-log-row '+klass} data-voided={entry.voidedAt?'true':undefined}>
    <span className="v7-log-bar" aria-hidden="true"/>
    <div className="v7-log-body"><strong>{entry.intent}</strong>
     <small>{span?formatClock(span.start,{zone})+'–'+formatClock(span.end,{zone})+' · ':''}{formatDuration(focusMinutes(entry))}{path?' · '+path:''}</small>
     {entry.rating!==null&&<span className="v7-log-dots" role="img" aria-label={'Rated '+entry.rating+' of 5'}>{[1,2,3,4,5].map(n=><i key={n} data-on={n<=(entry.rating??0)||undefined}/>)}</span>}
     {entry.voidedAt&&<StatusBadge tone="warning">Voided · not counted</StatusBadge>}
    </div>
    <RowMenu label={'Actions for '+entry.intent} title={entry.intent} items={entry.voidedAt?[{label:'Restore',icon:<RotateCcw aria-hidden="true"/>,onClick:()=>setEditing(entry)}]:[
     {label:'Edit',icon:<Pencil aria-hidden="true"/>,onClick:()=>setEditing(entry)},
     {label:'Split',icon:<Scissors aria-hidden="true"/>,onClick:()=>setEditing(entry)},
     {label:'Void',icon:<Ban aria-hidden="true"/>,onClick:()=>setVoiding(entry)},
    ]}/>
   </li>;})}</ul></section>):<EmptyMoment title="No study time this week">Focus sessions land here. Use Add time for study you did without the timer.</EmptyMoment>)}
  {editing&&<EntrySheetV7 key={editing.id+'-'+editing.version} entry={editing} busy={busy} onClose={()=>setEditing(null)} onChange={async()=>{setEditing(null);setReload(value=>value+1);}}/>}
  <Sheet open={!!voiding} onClose={()=>setVoiding(null)} title={voiding?'Void “'+voiding.intent+'”?':'Void entry'}
   footer={<><Button variant="ghost" onClick={()=>setVoiding(null)}>Keep entry</Button><Button variant="primary" destructive loading={busy} onClick={()=>{if(voiding)void voidEntry(voiding);}}>Void entry</Button></>}>
   <p>Its time stops counting. You can restore it from the log.</p>
  </Sheet>
  <Sheet open={adding} onClose={()=>setAdding(false)} title="Add time" footer={<Button variant="primary" loading={busy} onClick={()=>{void addTime();}}>Add time</Button>}>
   <div className="v7-log-add">
    <Field label="What you studied" value={intent} onChange={event=>setIntent(event.target.value)} placeholder="e.g. Read Rudin ch. 2"/>
    <DatePicker label="Day" value={day} onChange={setDay}/>
    <TimeRange start={start} end={end} onChange={(from,to)=>{setStart(from);setEnd(to);}}/>
    {problem&&<p role="alert" className="v7-error">{problem}</p>}
   </div>
  </Sheet>
 </main>;
}
