import {useMemo,useState} from 'react';
import {Pencil,Trash2} from 'lucide-react';
import {getStudyApi} from '../../../data/study';
import type {StudyEntryRecord} from '../../../data/study/contract';
import {formatDuration,formatShortDate} from '../../../lib/format';
import {ratingText} from '../../../lib/labels';
import {Button,Sheet} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';
import {dayKey} from '../model';
import type {BlockLook} from './DayGrid';
import {sessionOf,type SessionStretch} from './loggedSessions';

const stretchName:Record<SessionStretch['kind'],string>={focus:'Focus',pause:'Paused',break:'Break'};

/**
 * N168: what a logged study card is. The session from its first focus to its last, how much of it was focus,
 * paused and break, each stretch at its times, the path, rating and reflection; Edit opens the time-log editor
 * (times, split), Void stops it counting with Undo.
 */
export function LoggedSessionSheet({entry,look,zone,clock,onClose,onEdit,onChanged}:{
 entry:StudyEntryRecord;look:BlockLook;zone:string;clock:(instant:string)=>string;
 onClose:()=>void;onEdit:(entry:StudyEntryRecord)=>void;onChanged:()=>void;
}){
 const api=getStudyApi(),notify=useToast();
 const session=useMemo(()=>sessionOf(entry),[entry]);
 const [busy,setBusy]=useState(false);
 const title=entry.intent||'Study';
 async function voidEntry(){
  if(busy)return;setBusy(true);
  try{
   const result=await api.voidStudyEntry(entry.id,entry.version);
   onClose();onChanged();
   notify('Session voided',{tone:'success',action:{label:'Undo',onClick:()=>{void api.restoreStudyEntry(entry.id,result.record.version).then(onChanged).catch(()=>notify('Could not restore the session',{tone:'danger'}));}}});
  }catch{notify('Could not void the session',{tone:'danger'});}
  finally{setBusy(false);}
 }
 const day=session?dayKey(new Date(session.start),zone):null;
 return <Sheet open onClose={onClose} eyebrow="Logged study" title={title}
  footer={<><Button variant="ghost" destructive loading={busy} onClick={()=>{void voidEntry();}}><Trash2 aria-hidden="true"/>Void</Button>
   <Button variant="primary" disabled={busy} onClick={()=>onEdit(entry)}><Pencil aria-hidden="true"/>Edit times</Button></>}>
  <div className="v7-session" data-logged-session={entry.id}>
   {session?<>
    <p className="v7-session-when">{day?formatShortDate(day,{zone})+' · ':''}{clock(session.start)}–{clock(session.end)}{look.path?' · '+look.path:''}</p>
    <dl className="v7-session-totals">
     <div><dt>Focus</dt><dd>{formatDuration(session.focusMinutes)}</dd></div>
     <div><dt>Paused</dt><dd>{session.pausedMinutes>=1?formatDuration(session.pausedMinutes)+(session.pauses>1?' · '+session.pauses+' pauses':''):'None'}</dd></div>
     {session.breakMinutes>=1&&<div><dt>Break</dt><dd>{formatDuration(session.breakMinutes)}</dd></div>}
    </dl>
    <ol className="v7-session-stretches" aria-label="What happened">
     {session.stretches.map(stretch=><li key={stretch.kind+stretch.start} data-stretch={stretch.kind}>
      <span className="v7-session-time">{clock(stretch.start)}–{clock(stretch.end)}</span>
      <span>{stretchName[stretch.kind]}</span><span className="v7-session-minutes">{formatDuration(stretch.minutes)}</span></li>)}
    </ol>
    <p className="v7-meta">Only focus counts toward Today and Progress. Pausing records nothing, so paused time shows as a gap and is not counted.</p>
   </>:<p>This session has no saved focus time.</p>}
   {(entry.rating||entry.reflection||entry.source==='manual')&&<dl className="v7-session-notes">
    {entry.rating&&<div><dt>How focused</dt><dd>{ratingText(entry.rating)}</dd></div>}
    {entry.reflection&&<div><dt>Reflection</dt><dd>{entry.reflection}</dd></div>}
    {entry.source==='manual'&&<div><dt>Source</dt><dd>Added by hand{entry.approximate?' · approximate':''}</dd></div>}
   </dl>}
  </div>
 </Sheet>;
}
