import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {v7Screen} from '../../app/v7Kit';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {getApi} from '../../data';
import type {ProjectSummary} from '../../data/types';
import {ratingText,studyRatings} from '../../lib/labels';
import {Navigate} from 'react-router';
import {getStudyApi} from '../../data/study';
import type {StudyEntryRecord,StudyRange,StudyCorrectionPatch} from '../../data/study/contract';
import {dayBounds} from '../../lib/effort';
import {isFlagOn} from '../../flags';
import Dialog from '../../ui/v6/Dialog';
import {formatDay,formatDuration,formatTimeRange} from '../../lib/format';
import {manualFocusInterval,localClockInstant} from './local-time';
import {weekStartDay} from '../calendar/model';
import {intervalRows,intervalsFromRows} from './interval-editor';
import {IntervalRowsEditor} from './IntervalRowsEditor';
import {StudyRelationsEditor} from './StudyRelationsEditor';

const PAGE=50;
const field='min-h-11 min-w-0 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label text-ink';
const action='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold';
function localDay(instant:string,zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
 const pick=(type:string)=>parts.find(p=>p.type===type)?.value??'';
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
function addDays(day:string,count:number){
 const date=new Date(day+'T12:00:00Z');
 if(!Number.isFinite(date.getTime()))throw Error('Invalid date');
 date.setUTCDate(date.getUTCDate()+count);
 return date.toISOString().slice(0,10);
}
export function visibleLogRange(day:string,zone:string):StudyRange{
 return {start:dayBounds(day,zone).start,end:dayBounds(addDays(day,7),zone).start};
}
export function logDate(entry:StudyEntryRecord,zone:string):string{
 return localDay(entry.intervals[0]?.start??entry.savedAt??entry.createdAt,zone);
}
export function visibleLogRecords(entries:StudyEntryRecord[]):StudyEntryRecord[]{
 return entries.filter(e=>(e.status==='saved'||(e.status==='discarded'&&!!e.voidedAt))&&
  e.intervals.some(i=>i.end!==null)).sort((a,b)=>
  Date.parse(b.intervals[0]?.start??b.createdAt)-
  Date.parse(a.intervals[0]?.start??a.createdAt)||a.id.localeCompare(b.id));
}
export function csvLog(entries:StudyEntryRecord[],zone:string):string{
 const cell=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const head=['date','entry_id','intent','source','approximate','status','voided','rating','reflection',
  'subject_id','project_id','checkpoint_id','session_id','interval_kind','start','end','minutes'];
 const rows=[head.map(cell).join(',')];
 for(const e of entries){
  const intervals=e.intervals.length?e.intervals:[{kind:'focus' as const,start:'',end:null}];
  for(const i of intervals){
   const minutes=i.end&&i.start?Math.max(0,(Date.parse(i.end)-Date.parse(i.start))/60000):'';
   rows.push([
    logDate(e,zone),e.id,e.intent,e.source,e.approximate?'yes':'no',
    e.status,e.voidedAt?'yes':'no',e.rating??'',e.reflection??'',
    e.subjectId??'',e.projectId??'',e.checkpointId??'',e.sessionId??'',
    i.kind,i.start,i.end??'',minutes
   ].map(cell).join(','));
  }
 }
 return rows.join('\r\n')+'\r\n';
}
function rating(value:string):StudyEntryRecord['rating']{
 if(value==='')return null;
 const n=Number(value);
 if(!Number.isInteger(n)||n<1||n>5)throw Error('Rating must be unknown or 1–5.');
 return n as StudyEntryRecord['rating'];
}
/** "2 focus intervals · 1 break" for one saved entry. */
export function intervalSummary(entry:StudyEntryRecord):string{
 const focus=entry.intervals.filter(i=>i.kind==='focus').length,rest=entry.intervals.length-focus;
 return (focus===1?'1 focus interval':focus+' focus intervals')+(rest?' · '+(rest===1?'1 break':rest+' breaks'):'');
}
function focusMinutes(entry:StudyEntryRecord):number{
 return entry.intervals.filter(i=>i.kind==='focus'&&i.end).reduce((sum,i)=>sum+(Date.parse(i.end!)-Date.parse(i.start))/60000,0);
}
export function EntryDialog({entry,onChange,onClose,busy}:{entry:StudyEntryRecord;onChange:()=>Promise<void>;onClose:()=>void;busy:boolean}){
 const api=getStudyApi();
 const [intent,setIntent]=useState(entry.intent);
 const [reflection,setReflection]=useState(entry.reflection??'');
 const [score,setScore]=useState(entry.rating===null?'':String(entry.rating));
 const [relations,setRelations]=useState({subjectId:entry.subjectId??'',projectId:entry.projectId??'',checkpointId:entry.checkpointId??'',sessionId:entry.sessionId??''});
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const [intervals,setIntervals]=useState(()=>intervalRows(entry.intervals.filter(i=>i.end!==null).map(i=>({
  kind:i.kind,start:i.start,end:i.end as string
 })),zone));
 const [splitDay,setSplitDay]=useState(()=>logDate(entry,zone)),[splitTime,setSplitTime]=useState('');
 const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
 const [confirmVoid,setConfirmVoid]=useState(false);
 async function commit(work:()=>Promise<unknown>){
  if(busy||submitting)return;
  setSubmitting(true);setError('');
  try{await work();await onChange();}
  catch(e){setError(e instanceof Error?e.message:'Time log change failed.');}
  finally{setSubmitting(false);}
 }
 function patch():StudyCorrectionPatch{
  const value:StudyCorrectionPatch={intent:intent.trim(),reflection:reflection.trim()||null,rating:rating(score),
   subjectId:relations.subjectId||null,projectId:relations.projectId||null,checkpointId:relations.checkpointId||null,sessionId:relations.sessionId||null};
  if(!value.intent)throw Error('Enter what you studied.');
  const converted=intervalsFromRows(intervals,zone);
  if(converted.errors.some(Boolean))throw Error(converted.errors.find(Boolean)??'Correct the interval rows.');
  value.intervals=converted.intervals;
  return value;
 }
 const disabled=busy||submitting;
 if(entry.voidedAt)return <Dialog title="Voided entry" eyebrow="TIME LOG" busy={disabled} onClose={onClose} footer={<>
   <button type="button" className={action} disabled={disabled} onClick={onClose}>Close</button>
   <button type="button" className={action+' bg-amber text-amber-ink'} disabled={disabled}
    onClick={()=>{void commit(()=>api.restoreStudyEntry(entry.id,entry.version));}}>Restore entry</button></>}>
  <section aria-label={'Restore '+entry.intent}>
   <p className="text-label">This entry is voided and not counted. Restore it to count its time again.</p>
   {error&&<p role="alert" className="mt-2 text-label text-again">{error}</p>}
  </section>
 </Dialog>;
 return <Dialog title="Edit entry" eyebrow="TIME LOG" busy={disabled} onClose={onClose} footer={<>
   {confirmVoid?<>
    <button type="button" className={action} disabled={disabled} onClick={()=>setConfirmVoid(false)}>Keep entry</button>
    <button type="button" className={action+' lemma-destructive'} disabled={disabled}
     onClick={()=>{void commit(()=>api.voidStudyEntry(entry.id,entry.version));}}>Confirm void</button>
   </>:<>
    <button type="button" className={action+' lemma-destructive mr-auto'} disabled={disabled} onClick={()=>setConfirmVoid(true)}>Void entry</button>
    <button type="button" className={action} disabled={disabled} onClick={onClose}>Cancel</button>
    <button type="button" className={action+' bg-amber text-amber-ink'} disabled={disabled} onClick={()=>{
     let value:StudyCorrectionPatch;
     try{value=patch();}catch(e){setError(e instanceof Error?e.message:'Check the entry.');return;}
     void commit(()=>api.correctStudyEntry(entry.id,entry.version,value));
    }}>Save changes</button>
   </>}</>}>
  <section aria-label={'Edit '+entry.intent} className="flex flex-col gap-3">
   {confirmVoid&&<p role="status" className="text-label">Void this entry? Its time stops counting; you can restore it later.</p>}
   <label className="block text-label">What you studied
    <input aria-label="Edit intent" className={field} value={intent} onChange={e=>setIntent(e.target.value)}/></label>
   <label className="block text-label">How focused
    <select aria-label="Edit rating" className={field} value={score} onChange={e=>setScore(e.target.value)}>
     <option value="">Not rated</option>{studyRatings.map(n=><option key={n} value={n}>{ratingText(n)}</option>)}
    </select></label>
   <label className="block text-label">Reflection
    <textarea aria-label="Edit reflection" className={field} value={reflection} onChange={e=>setReflection(e.target.value)}/></label>
   <StudyRelationsEditor value={relations} onChange={setRelations}/>
   <IntervalRowsEditor rows={intervals} onChange={setIntervals} zone={zone}/>
   <details className="lemma-disclosure">
    <summary className="min-h-11 cursor-pointer text-label font-medium">Split this entry in two</summary>
    <fieldset className="mt-2 grid min-w-0 grid-cols-2 gap-2">
     <legend className="sr-only">Split at</legend>
     <label className="min-w-0 text-label">Date<input type="date" className={field} aria-label="Split date"
      value={splitDay} onChange={e=>setSplitDay(e.target.value)}/></label>
     <label className="min-w-0 text-label">Time<input type="time" className={field} aria-label="Split time"
      value={splitTime} onChange={e=>setSplitTime(e.target.value)}/></label>
    </fieldset>
    <button type="button" className={action+' mt-2'} disabled={disabled||!splitTime} onClick={()=>{
     const at=localClockInstant(splitDay,splitTime,zone);
     if(!at){setError('Choose a valid split date and time.');return;}
     void commit(()=>api.splitStudyEntry(entry.id,entry.version,at));
    }}>Split saved entry</button>
   </details>
   {error&&<p role="alert" className="text-label text-again">{error}</p>}
  </section>
 </Dialog>;
}
const TimeLogV7=lazy(()=>import('./v7/TimeLogV7'));
export default function TimeLog(){
 // v7 Time log (PLAN §6.13) behind v7Shell; the v6 log stays for rollback.
 if(v7Screen()==='log')return <Suspense fallback={<div role="status" aria-label="Time log loading" className="min-h-dvh"/>}><TimeLogV7/></Suspense>;
 return <TimeLogV6/>;
}
function TimeLogV6(){
 const enabled=isFlagOn('v6Shell');
 const api=getStudyApi(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const [day,setDay]=useState(()=>weekStartDay(localDay(new Date().toISOString(),zone)));
 const [rows,setRows]=useState<StudyEntryRecord[]>([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(0);
 const [selected,setSelected]=useState<string|null>(null),[manual,setManual]=useState(false);
 const [mIntent,setMIntent]=useState(''),[mDay,setMDay]=useState(()=>localDay(new Date().toISOString(),zone)),[mStart,setMStart]=useState(''),[mEnd,setMEnd]=useState('');
 const [mReflection,setMReflection]=useState(''),[mError,setMError]=useState('');
 const range=useMemo(()=>visibleLogRange(day,zone),[day,zone]);
 const [projects,setProjects]=useState<ProjectSummary[]>([]);
 useEffect(()=>{
  if(!enabled)return;
  let alive=true;
  try{void getApi().listProjects().then(list=>{if(alive)setProjects(list)}).catch(()=>{/* names are optional */});}catch{/* names are optional */}
  return()=>{alive=false};
 },[enabled]);
 async function refresh(){
  const all=await api.listStudyEntries(range);
  setRows(visibleLogRecords(all));
 }
 useEffect(()=>{
  if(!enabled)return;
  let alive=true;setLoading(true);setError('');setPage(0);setSelected(null);
  void api.listStudyEntries(range).then(all=>{
   if(!alive)return;
   setRows(visibleLogRecords(all));
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Unable to load time log.');})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[api,enabled,range]);
 if(!enabled)return <Navigate to="/" replace/>;
 const totalPages=Math.max(1,Math.ceil(rows.length/PAGE));
 const index=Math.min(page,totalPages-1),shown=rows.slice(index*PAGE,(index+1)*PAGE);
 const grouped:Record<string,StudyEntryRecord[]>={};
 for(const entry of shown){
  const date=logDate(entry,zone);
  (grouped[date]??=[]).push(entry);
 }
 const groups=Object.entries(grouped);
 async function changed(){
  setBusy(true);setError('');
  try{await refresh();setSelected(null);}catch(e){setError(e instanceof Error?e.message:'Refresh failed.');}
  finally{setBusy(false);}
 }
 async function manualSave(){
  setBusy(true);setMError('');
  try{
   if(!mIntent.trim())throw Error('Enter what you studied.');
   const interval=manualFocusInterval(mDay,mStart,mEnd,zone);
   await api.createManualStudyEntry({intent:mIntent.trim(),reflection:mReflection.trim()||null,
    intervals:[interval]});
   await refresh();setManual(false);setMIntent('');setMStart('');setMEnd('');setMReflection('');
  }catch(e){setMError(e instanceof Error?e.message:'Could not record manual time.');}
  finally{setBusy(false);}
 }
 function exportCsv(){
  const csv=csvLog(rows,zone);
  const href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=href;link.download='lemma-time-'+day+'.csv';
  document.body.append(link);link.click();link.remove();URL.revokeObjectURL(href);
 }
 const editing=rows.find(entry=>entry.id===selected)??null;
 const weekLabel=new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'short',day:'numeric'}).format(new Date(day+'T12:00:00Z'));
 return <section aria-labelledby="time-log-title" className="flex min-w-0 flex-col gap-4 pb-8">
  <h1 id="time-log-title" className="sr-only">Time log</h1>
  <p className="text-label text-ink-2">Your saved focus time. Add time you studied without the timer, or correct an entry.</p>
  <nav aria-label="Time log week" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
   <button type="button" aria-label="Previous week" className="flex size-11 items-center justify-center rounded-[8px] text-ink" onClick={()=>setDay(addDays(day,-7))}><ChevronLeft size={22} aria-hidden="true"/></button>
   <strong className="text-center text-body font-medium text-ink">Week of {weekLabel}</strong>
   <button type="button" aria-label="Next week" className="flex size-11 items-center justify-center rounded-[8px] text-ink" onClick={()=>setDay(addDays(day,7))}><ChevronRight size={22} aria-hidden="true"/></button>
  </nav>
  <div className="flex flex-wrap items-center gap-2">
   <button type="button" className={action+' bg-amber text-amber-ink'} onClick={()=>setManual(true)}>Add time</button>
   <button type="button" className={action} disabled={busy||loading} onClick={exportCsv}>Export CSV</button>
  </div>
  {manual&&<Dialog title="Add time" eyebrow="TIME LOG" busy={busy} onClose={()=>setManual(false)}
    footer={<>
     <button type="button" className={action} disabled={busy} onClick={()=>setManual(false)}>Cancel</button>
     <button type="submit" form="n121-manual-log" disabled={busy} className={action+' bg-amber text-amber-ink'}>Save time</button>
    </>}>
   <form id="n121-manual-log" aria-label="Manual time entry" onSubmit={e=>{e.preventDefault();void manualSave();}}
    className="flex flex-col gap-3">
    <label className="block text-label">What you studied<input className={field} aria-label="Manual intent" required
     placeholder="e.g. Read Rudin 2.3" value={mIntent} onChange={e=>setMIntent(e.target.value)}/></label>
    <label className="block text-label">Date<input className={field} type="date" aria-label="Manual date"
     value={mDay} onChange={e=>setMDay(e.target.value)}/></label>
    <div className="grid min-w-0 grid-cols-2 gap-2">
     <label className="block min-w-0 text-label">Start<input className={field} type="time" aria-label="Manual start"
      value={mStart} onChange={e=>setMStart(e.target.value)}/></label>
     <label className="block min-w-0 text-label">End<input className={field} type="time" aria-label="Manual end"
      value={mEnd} onChange={e=>setMEnd(e.target.value)}/></label>
    </div>
    <label className="block text-label">Reflection (optional)<textarea className={field} aria-label="Manual reflection"
      value={mReflection} onChange={e=>setMReflection(e.target.value)}/></label>
    <p className="text-caption text-ink-2">Added time is marked approximate.</p>
    {mError&&<p role="alert" className="text-label text-again">{mError}</p>}
   </form>
  </Dialog>}
  {loading&&<p role="status">Loading time log…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&rows.length>0&&<p role="status" className="text-label text-ink-2">{rows.length} {rows.length===1?'entry':'entries'}{totalPages>1?' · Page '+(index+1)+' of '+totalPages:''}</p>}
  {groups.map(([date,items])=><section key={date} aria-label={'Saved entries on '+formatDay(date,{zone})}>
   <h2 className="mb-2 text-label font-semibold text-ink-2">{formatDay(date,{zone})}</h2>
   <div className="space-y-2">{items?.map(entry=>{
    const closed=entry.intervals.filter(i=>i.end);
    const first=closed[0]?.start,last=closed[closed.length-1]?.end;
    const path=entry.projectId?projects.find(p=>p.id===entry.projectId)?.title:undefined;
    const meta=[first&&last?formatTimeRange(first,last,{zone,clock24h:true}):'In progress',formatDuration(focusMinutes(entry)),
     path,entry.rating===null?'Not rated':'Rated '+ratingText(entry.rating)].filter(Boolean).join(' · ');
    return <article key={entry.id} className="min-w-0 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3 text-label">
     <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><strong className="block break-words font-medium text-ink [overflow-wrap:anywhere]">{entry.intent||'Study'}</strong>
       <span className="block text-ink-2">{meta}</span>
       <span className="block text-caption text-ink-2">{entry.approximate?'Approximate · ':''}{entry.voidedAt?'Voided · ':''}{intervalSummary(entry)}</span></div>
      <button type="button" className={action+' shrink-0'} aria-label={(entry.voidedAt?'Open voided entry ':'Edit entry ')+(entry.intent||'Study')}
       onClick={()=>setSelected(entry.id)}>{entry.voidedAt?'Restore':'Edit'}</button>
     </div>
    </article>;
   })}</div>
  </section>)}
  {editing&&<EntryDialog key={editing.id+'-'+editing.version} entry={editing} busy={busy}
   onClose={()=>setSelected(null)} onChange={changed}/>}
  {!loading&&!error&&rows.length===0&&<p className="text-label text-ink-2">No study time saved this week. Use Add time to record a session you studied without the timer.</p>}
  {totalPages>1&&<nav aria-label="Time log pages" className="flex flex-wrap items-center gap-2">
   <button className={action} disabled={index===0} onClick={()=>setPage(index-1)}>Previous page</button>
   <output aria-label="Page position">Page {index+1} of {totalPages}</output>
   <button className={action} disabled={index+1>=totalPages} onClick={()=>setPage(index+1)}>Next page</button>
  </nav>}
 </section>;
}
