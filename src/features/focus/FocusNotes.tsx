import {useEffect,useRef,useState} from 'react';
import {getThoughtApi} from '../../data/parked-thoughts';
import {getStudyEventApi} from '../../data/study-events';

/** N71: lightweight persistence actions never change the running timer. */
export default function FocusNotes({entryId}:{entryId:string}){
 const [noticeCount,setNoticeCount]=useState<number|null>(null);
 const [dialog,setDialog]=useState<'thought'|'drift'|null>(null);
 const [text,setText]=useState('');
 const [minutes,setMinutes]=useState('1');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const trigger=useRef<HTMLButtonElement|null>(null);
 const field=useRef<HTMLTextAreaElement|HTMLInputElement|null>(null);
 useEffect(()=>{
  let live=true;
  setNoticeCount(null);
  void getStudyEventApi().listEvents({entryId,kind:['notice'],includeVoided:false,limit:1})
   .then(page=>{if(live)setNoticeCount(page.total)})
   .catch(()=>{if(live)setNoticeCount(null)});
  return ()=>{live=false};
 },[entryId]);
 useEffect(()=>{if(dialog)field.current?.focus()},[dialog]);
 const open=(kind:'thought'|'drift',button:HTMLButtonElement)=>{
  trigger.current=button;setDialog(kind);setError('');setSuccess('');
 };
 const dismiss=()=>{
  if(saving)return;
  setDialog(null);setError('');
  queueMicrotask(()=>trigger.current?.focus());
 };
 async function submit(){
  if(!dialog||saving)return;
  setSaving(true);setError('');
  try{
   if(dialog==='thought'){
    if(!text.trim())throw Error('Enter a thought to park.');
    await getThoughtApi().createThought({studyEntryId:entryId,text:text.trim()});
    setText('');setSuccess('Thought parked for later.');
   }else{
    const value=Number(minutes);
    if(!/^[1-9][0-9]*$/.test(minutes)||!Number.isSafeInteger(value)||value>100000)
     throw Error('Enter whole drift minutes (1–100000).');
    await getStudyEventApi().recordEvent({entryId,kind:'drift',durationMinutes:value});
    setMinutes('1');setSuccess('Drift recorded. Focus minutes are unchanged.');
   }
   setDialog(null);
   queueMicrotask(()=>trigger.current?.focus());
  }catch(e){setError(e instanceof Error?e.message:'Could not save; retry.')}
  finally{setSaving(false)}
 }
 return <section aria-label="Focus notes" className="mt-3 rounded-ctl border border-edge p-3">
  <p className="text-label text-ink-2">Notices: <output aria-label="Focus notice count">{noticeCount===null?'Unavailable':noticeCount}</output></p>
  <div className="mt-2 flex flex-wrap gap-2">
   <button type="button" className="min-h-11 rounded-ctl border border-edge px-3 text-label text-ink"
    onClick={e=>open('thought',e.currentTarget)}>Park a thought</button>
   <button type="button" className="min-h-11 rounded-ctl border border-edge px-3 text-label text-ink"
    onClick={e=>open('drift',e.currentTarget)}>I drifted</button>
  </div>
  {success&&<p role="status" className="mt-2 text-label text-ink-2">{success}</p>}
  {dialog&&<dialog open aria-label={dialog==='thought'?'Park a thought':'Record drift'}
   onCancel={e=>{e.preventDefault();dismiss()}}
   onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();dismiss()}}}
   className="fixed inset-0 z-50 m-auto w-[min(92vw,420px)] rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
   <form onSubmit={e=>{e.preventDefault();void submit()}}>
    <h3 className="text-title font-semibold">{dialog==='thought'?'Park a thought':'Record drift'}</h3>
    {dialog==='thought'?<label className="mt-3 block text-label">Thought
     <textarea ref={el=>{field.current=el}} value={text}
      onChange={e=>setText(e.target.value)} required maxLength={2000} rows={3}
      className="mt-1 w-full rounded-ctl border border-edge bg-fill-1 p-2"/>
    </label>:<label className="mt-3 block text-label">Minutes drifted
     <input ref={el=>{field.current=el}} type="number" min="1" max="100000" step="1"
      value={minutes} onChange={e=>setMinutes(e.target.value)} required
      className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-2"/>
    </label>}
    <p className="mt-2 text-caption text-ink-2">The running timer is not paused. Drift does not deduct minutes yet.</p>
    {error&&<p role="alert" className="mt-2 text-label">{error}</p>}
    <div className="mt-4 flex justify-end gap-2">
     <button type="button" disabled={saving} onClick={dismiss}
      className="min-h-11 rounded-ctl border border-edge px-3">Cancel</button>
     <button type="submit" disabled={saving}
      className="min-h-11 rounded-ctl bg-amber px-3 text-amber-ink">
      {saving?'Saving…':dialog==='thought'?'Park thought':'Record drift'}
     </button>
    </div>
   </form>
  </dialog>}
 </section>;
}
