import {useEffect,useMemo,useState} from 'react';
import {Link,Navigate} from 'react-router';
import {getStudyApi} from '../../data/study';
import type {ClosedStudyIntervalInput,StudyEntryRecord,StudyRange,StudyCorrectionPatch} from '../../data/study/contract';
import {dayBounds} from '../../lib/effort';
import {isFlagOn} from '../../flags';

const PAGE=50;
const field='min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label text-ink';
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
function parseIntervals(value:string):ClosedStudyIntervalInput[]{
 const candidate:unknown=JSON.parse(value);
 if(!Array.isArray(candidate)||candidate.length===0||
  candidate.some(item=>!item||typeof item!=='object'||Array.isArray(item)||
   !['focus','break'].includes((item as {kind?:unknown}).kind as string)||
   typeof (item as {start?:unknown}).start!=='string'||
   typeof (item as {end?:unknown}).end!=='string'))
  throw Error('Intervals need a nonempty JSON array with kind, start and end.');
 return candidate.map(item=>({
  kind:item.kind as 'focus'|'break',start:item.start as string,end:item.end as string
 }));
}
function rating(value:string):StudyEntryRecord['rating']{
 if(value==='')return null;
 const n=Number(value);
 if(!Number.isInteger(n)||n<1||n>5)throw Error('Rating must be unknown or 1–5.');
 return n as StudyEntryRecord['rating'];
}
function EntryDetails({entry,onChange,busy}:{entry:StudyEntryRecord;onChange:()=>Promise<void>;busy:boolean}){
 const api=getStudyApi();
 const [intent,setIntent]=useState(entry.intent);
 const [reflection,setReflection]=useState(entry.reflection??'');
 const [score,setScore]=useState(entry.rating===null?'':String(entry.rating));
 const [subject,setSubject]=useState(entry.subjectId??''),[project,setProject]=useState(entry.projectId??'');
 const [checkpoint,setCheckpoint]=useState(entry.checkpointId??''),[session,setSession]=useState(entry.sessionId??'');
 const [intervals,setIntervals]=useState(JSON.stringify(entry.intervals.filter(i=>i.end).map(i=>({
  kind:i.kind,start:i.start,end:i.end
 })),null,2));
 const [splitAt,setSplitAt]=useState('');
 const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
 async function commit(work:()=>Promise<unknown>){
  if(busy||submitting)return;
  setSubmitting(true);setError('');
  try{await work();await onChange();}
  catch(e){setError(e instanceof Error?e.message:'Time log change failed.');}
  finally{setSubmitting(false);}
 }
 function patch():StudyCorrectionPatch{
  const value:StudyCorrectionPatch={intent:intent.trim(),reflection:reflection.trim()||null,rating:rating(score),
   subjectId:subject||null,projectId:project||null,checkpointId:checkpoint||null,sessionId:session||null};
  if(!value.intent)throw Error('Intent must not be empty.');
  value.intervals=parseIntervals(intervals);
  return value;
 }
 const disabled=busy||submitting;
 return <section aria-label={'Edit '+entry.intent} className="mt-3 rounded-ctl border border-edge bg-fill-1 p-3">
  <h4 className="font-semibold">Edit saved time</h4>
  <label className="mt-2 block text-label">Intent
   <input aria-label="Edit intent" className={field} value={intent} onChange={e=>setIntent(e.target.value)}/></label>
  <label className="mt-2 block text-label">Reflection
   <textarea aria-label="Edit reflection" className={field} value={reflection} onChange={e=>setReflection(e.target.value)}/></label>
  <label className="mt-2 block text-label">Rating (blank means unknown)
   <select aria-label="Edit rating" className={field} value={score} onChange={e=>setScore(e.target.value)}>
    <option value="">Unknown</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
   </select></label>
  <div className="mt-2 grid grid-cols-2 gap-2">
   {([['Subject ID',subject,setSubject],['Project ID',project,setProject],
    ['Checkpoint ID',checkpoint,setCheckpoint],['Session ID',session,setSession]] as const)
    .map(([label,value,change])=><label key={label} className="text-caption">{label}
     <input aria-label={label} className={field} value={value} onChange={e=>change(e.target.value)}
      placeholder="UUID or blank"/></label>)}
  </div>
  <label className="mt-2 block text-label">Intervals (ISO instants, JSON array)
   <textarea aria-label="Edit intervals" rows={5} className={field} value={intervals}
    onChange={e=>setIntervals(e.target.value)}/></label>
  <button className={action+' mt-2'} disabled={disabled} onClick={()=>{
   void commit(()=>api.correctStudyEntry(entry.id,entry.version,patch()));
  }}>Save changes</button>
  <label className="mt-3 block text-label">Split at (ISO instant)
   <input className={field} aria-label="Split at" placeholder="2026-11-07T13:00:00Z"
    value={splitAt} onChange={e=>setSplitAt(e.target.value)}/></label>
  <div className="mt-2 flex flex-wrap gap-2">
   <button className={action} disabled={disabled||!splitAt} onClick={()=>{
    void commit(()=>api.splitStudyEntry(entry.id,entry.version,splitAt));
   }}>Split saved entry</button>
   {entry.voidedAt?
    <button className={action} disabled={disabled} onClick={()=>{void commit(()=>api.restoreStudyEntry(entry.id,entry.version));}}>Restore entry</button>:
    <button className={action} disabled={disabled} onClick={()=>{void commit(()=>api.voidStudyEntry(entry.id,entry.version));}}>Void entry</button>}
  </div>
  {error&&<p role="alert" className="mt-2 text-label">{error}</p>}
 </section>;
}
export default function TimeLog(){
 const enabled=isFlagOn('v6Shell');
 const api=getStudyApi(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const [day,setDay]=useState(()=>localDay(new Date().toISOString(),zone));
 const [rows,setRows]=useState<StudyEntryRecord[]>([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(0);
 const [selected,setSelected]=useState<string|null>(null),[manual,setManual]=useState(false);
 const [mIntent,setMIntent]=useState(''),[mStart,setMStart]=useState(''),[mEnd,setMEnd]=useState('');
 const [mReflection,setMReflection]=useState(''),[mError,setMError]=useState('');
 const range=useMemo(()=>visibleLogRange(day,zone),[day,zone]);
 async function refresh(){
  const all=await api.listStudyEntries(range);
  setRows(all.filter(e=>e.status==='saved'&&e.intervals.some(i=>i.end!==null))
   .sort((a,b)=>Date.parse(b.intervals[0]?.start??b.createdAt)-
    Date.parse(a.intervals[0]?.start??a.createdAt)||a.id.localeCompare(b.id)));
 }
 useEffect(()=>{
  if(!enabled)return;
  let alive=true;setLoading(true);setError('');setPage(0);setSelected(null);
  void api.listStudyEntries(range).then(all=>{
   if(!alive)return;
   setRows(all.filter(e=>e.status==='saved'&&e.intervals.some(i=>i.end!==null))
    .sort((a,b)=>Date.parse(b.intervals[0]?.start??b.createdAt)-
     Date.parse(a.intervals[0]?.start??a.createdAt)||a.id.localeCompare(b.id)));
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Unable to load time log.');})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[api,enabled,range]);
 if(!enabled)return <Navigate to="/" replace/>;
 const totalPages=Math.max(1,Math.ceil(rows.length/PAGE));
 const index=Math.min(page,totalPages-1),shown=rows.slice(index*PAGE,(index+1)*PAGE);
 const groups=Object.entries(Object.groupBy(shown,e=>logDate(e,zone)));
 async function changed(){
  setBusy(true);setError('');
  try{await refresh();setSelected(null);}catch(e){setError(e instanceof Error?e.message:'Refresh failed.');}
  finally{setBusy(false);}
 }
 async function manualSave(){
  setBusy(true);setMError('');
  try{
   if(!mIntent.trim()||!mStart||!mEnd)throw Error('Fill in intent and both ISO instants.');
   if(!Number.isFinite(Date.parse(mStart))||!Number.isFinite(Date.parse(mEnd))||
    Date.parse(mEnd)<=Date.parse(mStart))throw Error('End must follow start.');
   await api.createManualStudyEntry({intent:mIntent.trim(),reflection:mReflection.trim()||null,
    intervals:[{kind:'focus',start:mStart,end:mEnd}]});
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
 return <main className="mx-auto max-w-3xl space-y-4 p-4">
  <header className="flex items-center justify-between gap-2">
   <div><Link to="/" className="text-label underline">Today</Link>
    <h1 className="text-title font-semibold">Time log</h1>
    <p className="text-caption text-ink-2">Saved focus intervals, including approximate manual records. Missing ratings are unknown.</p>
   </div>
  </header>
  <div className="flex flex-wrap items-end gap-2">
   <label className="text-label">Week starting
    <input aria-label="Week starting" className={field} type="date" value={day}
     onChange={e=>setDay(e.target.value)}/></label>
   <button className={action} onClick={()=>setDay(addDays(day,-7))}>Previous week</button>
   <button className={action} onClick={()=>setDay(addDays(day,7))}>Next week</button>
   <button className={action} disabled={busy||loading} onClick={exportCsv}>Export visible range CSV</button>
   <button className={action} onClick={()=>setManual(v=>!v)}>Add approximate time</button>
  </div>
  {manual&&<form aria-label="Manual time entry" onSubmit={e=>{e.preventDefault();void manualSave();}}
   className="space-y-2 rounded-ctl border border-edge p-3">
   <label className="block text-label">Intent<input className={field} aria-label="Manual intent"
    value={mIntent} onChange={e=>setMIntent(e.target.value)}/></label>
   <label className="block text-label">Start ISO instant<input className={field} aria-label="Manual start"
    value={mStart} onChange={e=>setMStart(e.target.value)}/></label>
   <label className="block text-label">End ISO instant<input className={field} aria-label="Manual end"
    value={mEnd} onChange={e=>setMEnd(e.target.value)}/></label>
   <label className="block text-label">Reflection<textarea className={field} aria-label="Manual reflection"
    value={mReflection} onChange={e=>setMReflection(e.target.value)}/></label>
   <button type="submit" disabled={busy} className={action}>Save approximate time</button>
   {mError&&<p role="alert">{mError}</p>}
  </form>}
  {loading&&<p role="status">Loading time log…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&<p role="status">{rows.length} saved entries · Showing {index+1} of {totalPages} pages (50 per page)</p>}
  {groups.map(([date,items])=><section key={date} aria-label={'Saved entries on '+date}>
   <h2 className="mb-2 text-label font-semibold">{date}</h2>
   <div className="space-y-2">{items?.map(entry=><article key={entry.id}
    className="rounded-ctl border border-edge p-3 text-label">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <div><strong className="block">{entry.intent}</strong>
      <span className="text-ink-2">{entry.approximate?'Approximate · ':''}
       {entry.voidedAt?'Voided · ':''}Rating: {entry.rating===null?'Unknown':entry.rating}</span></div>
     <button type="button" className={action} onClick={()=>setSelected(v=>v===entry.id?null:entry.id)}>
      {selected===entry.id?'Hide editor':'Edit entry'}</button>
    </div>
    <ol className="mt-2 space-y-1">
     {entry.intervals.map(i=><li key={i.id} className="text-caption text-ink-2">
      {i.kind}: {i.start} – {i.end??'in progress'}</li>)}
    </ol>
    {selected===entry.id&&<EntryDetails key={entry.id+'-'+entry.version} entry={entry}
     busy={busy} onChange={changed}/>}
   </article>)}</div>
  </section>)}
  {!loading&&!error&&rows.length===0&&<p>No saved study time in this seven-day range.</p>}
  <nav aria-label="Time log pages" className="flex items-center gap-2">
   <button className={action} disabled={index===0} onClick={()=>setPage(index-1)}>Previous page</button>
   <output aria-label="Page position">{index+1} / {totalPages}</output>
   <button className={action} disabled={index+1>=totalPages} onClick={()=>setPage(index+1)}>Next page</button>
  </nav>
 </main>;
}
