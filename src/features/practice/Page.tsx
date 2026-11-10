// N78: v6-only practice topic management. Practice records are distinct from card reviews.
import {formatDay,formatInterval} from '../../lib/format';
import {practiceRatingText} from '../../lib/labels';
import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {getPracticeTopicApi} from '../../data/practice-topics';
import type {PracticeCadence,PracticeEventRecord,PracticeRating,
 PracticeTopicRecord} from '../../data/practice-topics/contract';
import {Screen} from '../../ui/Screen';

const action='min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold disabled:opacity-50';
const field='min-h-11 rounded-ctl border border-edge bg-well px-3 py-2 text-body text-ink';
const dateOf=(date:string)=>date.slice(0,10);
const compareTopics=(a:PracticeTopicRecord,b:PracticeTopicRecord)=>
 (a.nextDueDate??'9999-12-31').localeCompare(b.nextDueDate??'9999-12-31')||
 a.title.localeCompare(b.title)||a.id.localeCompare(b.id);
const validNumber=(input:string,min:number,max:number,name:string)=>{
 if(!/^(0|[1-9][0-9]*)$/.test(input)||!Number.isSafeInteger(Number(input))||
  Number(input)<min||Number(input)>max)
  throw Error(name+' must be a whole number between '+min+' and '+max);
 return Number(input);
};
export function parsePracticeRating(input:string):PracticeRating{
 const n=validNumber(input,1,4,'Rating');
 return n as PracticeRating;
}
export function parsePracticeCadence(kind:string,days:readonly string[]):PracticeCadence{
 if(kind==='fixed_days'){
  if(days.length!==1)throw Error('Fixed cadence needs one number');
  return {kind:'fixed_days',days:validNumber(days[0],1,3650,'Cadence days')};
 }
 if(kind==='after_rating'){
  if(days.length!==4)throw Error('Rating cadence needs four numbers');
  const ratingDays=days.map((d,i)=>validNumber(d,1,3650,'Rating '+(i+1)+' days'));
  return {kind:'after_rating',daysByRating:ratingDays as [number,number,number,number]};
 }
 throw Error('Unsupported cadence');
}
export async function loadAllPracticeTopics(archived:'active'|'archived'|'all'='all'){
 const api=getPracticeTopicApi(),items:PracticeTopicRecord[]=[];
 const cursors=new Set<string>();
 let cursor:string|null=null;
 for(let i=0;i<500;i++){
  const page=await api.listTopics({archived,limit:50,cursor});
  if(!Array.isArray(page.items)||page.items.length>50)throw Error('Invalid practice page');
  items.push(...page.items);
  if(page.nextCursor===null){
   if(items.length!==page.total)throw Error('Incomplete practice topics');
   return items.sort(compareTopics);
  }
  if(!page.nextCursor||cursors.has(page.nextCursor))throw Error('Repeated practice cursor');
  cursors.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('Practice topic paging limit reached');
}
export async function loadAllPracticeEvents(topicId:string){
 const api=getPracticeTopicApi(),items:PracticeEventRecord[]=[];
 const cursors=new Set<string>();
 let cursor:string|null=null;
 for(let i=0;i<500;i++){
  const page=await api.listEvents({topicId,includeVoided:true,limit:50,cursor});
  if(!Array.isArray(page.items)||page.items.length>50)throw Error('Invalid practice event page');
  items.push(...page.items);
  if(page.nextCursor===null){
   if(items.length!==page.total)throw Error('Incomplete practice events');
   return items.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||b.id.localeCompare(a.id));
  }
  if(!page.nextCursor||cursors.has(page.nextCursor))throw Error('Repeated practice event cursor');
  cursors.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('Practice event paging limit reached');
}

export default function PracticePage(){
 const [items,setItems]=useState<PracticeTopicRecord[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [events,setEvents]=useState<PracticeEventRecord[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [rating,setRating]=useState('3');
 const [response,setResponse]=useState('');
 const [minutes,setMinutes]=useState('');
 const [cadenceKind,setCadenceKind]=useState<'fixed_days'|'after_rating'>('fixed_days');
 const [cadenceDays,setCadenceDays]=useState(['7','1','3','7','14']);
 const [showArchived,setShowArchived]=useState(false);
 const [reloadSignal,setReloadSignal]=useState(0);
 // N121 X10: refetch when the window regains focus instead of a manual Refresh button.
 useEffect(()=>{const again=()=>setReloadSignal(x=>x+1);window.addEventListener('focus',again);return()=>window.removeEventListener('focus',again);},[]);
 useEffect(()=>{
  let alive=true;
  setLoading(true);
  void loadAllPracticeTopics().then(rows=>{
   if(alive){setItems(rows);setError('');setLoading(false);}
  }).catch(e=>{
   if(alive){setError(e instanceof Error?e.message:'Could not load practice topics');setLoading(false);}
  });
  return()=>{alive=false};
 },[reloadSignal]);
 useEffect(()=>{
  if(!selected){setEvents([]);return;}
  let alive=true;
  void loadAllPracticeEvents(selected).then(rows=>{if(alive)setEvents(rows)})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Could not load event history')});
  return()=>{alive=false};
 },[selected,reloadSignal]);
 const active=items.filter(x=>x.archivedAt===null);
 const archived=items.filter(x=>x.archivedAt!==null);
 const current=items.find(x=>x.id===selected);
 const open=(topic:PracticeTopicRecord)=>{
  setSelected(topic.id);setError('');setNotice('');
  setCadenceKind(topic.cadence.kind);
  setCadenceDays(topic.cadence.kind==='fixed_days'?
   [String(topic.cadence.days),'1','3','7','14']:
   ['7',...topic.cadence.daysByRating.map(String)]);
 };
 const run=async(fn:()=>Promise<unknown>,message:string)=>{
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await fn();
   // Always reload the authoritative optimistic versions; never infer a
   // successful command from local state or from a stale due projection.
   const rows=await loadAllPracticeTopics();
   setItems(rows);
   if(selected)setEvents(await loadAllPracticeEvents(selected));
   setNotice(message);
  }catch(e){setError(e instanceof Error?e.message:'Practice operation failed')}
  finally{setBusy(false)}
 };
 const record=(event:FormEvent)=>{
  event.preventDefault();
  if(!current||busy)return;
  let minutesValue:number|null=null;let ratingValue:PracticeRating;
  try{
   ratingValue=parsePracticeRating(rating);
   minutesValue=minutes.trim()?validNumber(minutes,0,1440,'Minutes'):null;
  }catch(e){setError(e instanceof Error?e.message:'Invalid practice entry');return}
  void run(async()=>{
   await getPracticeTopicApi().recordPractice(current.id,current.version,{
    rating:ratingValue,response:response.trim()||null,minutes:minutesValue,
   });
   setResponse('');setMinutes('');
  },'Practice recorded — due date updated');
 };
 const saveCadence=(event:FormEvent)=>{
  event.preventDefault();
  if(!current||busy)return;
  let cadence:PracticeCadence;
  try{cadence=parsePracticeCadence(cadenceKind,
    cadenceKind==='fixed_days'?cadenceDays.slice(0,1):cadenceDays.slice(1,5))}
  catch(e){setError(e instanceof Error?e.message:'Invalid cadence');return}
  void run(()=>getPracticeTopicApi().updateTopic(current.id,current.version,{cadence}),
   'Practice cadence saved');
 };
 // N121 F11: today is the owner's civil day (not the UTC date), and labels say which day.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}).format(new Date());
 const due=(topic:PracticeTopicRecord)=>!topic.nextDueDate?'Not scheduled':
  topic.nextDueDate<today?(formatDay(topic.nextDueDate)==='Yesterday'?'Due yesterday':'Overdue · '+formatDay(topic.nextDueDate)):
  topic.nextDueDate===today?'Due today':'Due '+formatDay(topic.nextDueDate);
 return <Screen title="Practice" back="/" className="pb-8">
  <section aria-label="Practice topics" className="space-y-4">
   <div>
    <h1 className="sr-only">Practice topics</h1>
    <p className="text-label text-ink-2">Practise a topic and rate how it went; the rating sets when it comes back. Cards are reviewed separately in <Link to="/review" className="text-[var(--link)] underline">Review</Link>.</p>
   </div>
   {loading?<p role="status">Loading practice topics…</p>:null}
   {error?<p role="alert" className="text-label text-again">{error}</p>:null}
   {notice?<p role="status" className="text-label text-ink-2">{notice}</p>:null}
   {!loading&&!active.length?<p>No active practice topics yet.</p>:null}
   {!loading&&active.map(topic=><article key={topic.id} id={'topic-'+topic.id} className="rounded-slab border border-edge p-4">
    <div className="flex flex-col items-start gap-2">
     <div className="min-w-0">
      <h2 className="break-words text-body font-semibold">{topic.title}</h2>
      <p className={'text-label '+(topic.nextDueDate&&topic.nextDueDate<today?'text-again':'text-ink-2')}>{due(topic)} · {topic.cadence.kind==='fixed_days'?
       'Every '+formatInterval(topic.cadence.days):'Next time depends on your rating'}</p>
     </div>
     <button type="button" className={action} disabled={busy}
      aria-expanded={selected===topic.id}
      aria-label={(selected===topic.id?'Close ':'Practice ')+topic.title}
      onClick={()=>selected===topic.id?setSelected(null):open(topic)}>
      {selected===topic.id?'Close':'Practice'}
     </button>
    </div>
    {selected===topic.id&&<div className="mt-3 space-y-4 border-t border-edge pt-3">
     <form noValidate onSubmit={record} aria-label={'Record '+topic.title} className="space-y-3">
      <h3 className="text-label font-semibold">Record practice</h3>
      <label className="block text-label">How did it go?
       <select className={field+' ml-2'} aria-label="Practice rating" value={rating}
        onChange={event=>setRating(event.target.value)}>
        {[1,2,3,4].map(x=><option key={x} value={x}>{practiceRatingText(x)}</option>)}
       </select>
      </label>
      <label className="block text-label">Response (optional)
       <textarea className={field+' block w-full'} maxLength={4000}
        aria-label="Practice response" value={response} onChange={event=>setResponse(event.target.value)}/>
      </label>
      <label className="block text-label">Minutes (optional)
       <input className={field+' ml-2 w-32'} type="number" min={0} max={1440}
        aria-label="Practice minutes" value={minutes} onChange={event=>setMinutes(event.target.value)}/>
      </label>
      <button className={action} type="submit" disabled={busy}>Record practice</button>
     </form>
     <form noValidate onSubmit={saveCadence} aria-label={'Cadence '+topic.title} className="space-y-3">
      <h3 className="text-label font-semibold">Cadence</h3>
      <label className="block text-label">Schedule
       <select className={field+' ml-2'} aria-label="Cadence kind" value={cadenceKind}
        onChange={event=>setCadenceKind(event.target.value as 'fixed_days'|'after_rating')}>
        <option value="fixed_days">Every few days</option>
        <option value="after_rating">Depends on my rating</option>
       </select>
      </label>
      <div className="flex flex-wrap gap-2">
       {(cadenceKind==='fixed_days'?[0]:[1,2,3,4]).map(index=>
        <label key={index} className="text-label">
         {index===0?'Days':'After '+practiceRatingText(index)+', days'}
         <input className={field+' ml-2 w-24'} type="number" min={1} max={3650}
          aria-label={index===0?'Cadence days':'Rating '+index+' cadence days'}
          value={cadenceDays[index]} onChange={event=>setCadenceDays(old=>
           old.map((v,i)=>i===index?event.target.value:v))}/>
        </label>)}
      </div>
      <button type="submit" className={action} disabled={busy}>Save cadence</button>
     </form>
     <button className={action} type="button" disabled={busy}
      aria-label={'Archive '+topic.title} onClick={()=>
       void run(()=>getPracticeTopicApi().archiveTopic(topic.id,topic.version),
        'Topic archived')}>Archive topic</button>
     <section aria-label={'History '+topic.title} className="space-y-2">
      <h3 className="text-label font-semibold">Practice history</h3>
      {!events.length?<p className="text-label">No practice events yet.</p>:null}
      {events.map(history=><div key={history.id} className="rounded-ctl bg-fill-1 p-3 text-label">
       <p>{formatDay(history.occurredAt)} · {practiceRatingText(history.rating)}
        {history.minutes!==null?' · '+history.minutes+' min':''}
        {history.voidedAt?' · Voided':''}</p>
       {history.response?<p className="break-words">{history.response}</p>:null}
       {!history.voidedAt&&<button className={action+' mt-2'} type="button"
        disabled={busy} aria-label={'Void practice from '+formatDay(history.occurredAt)}
        onClick={()=>void run(()=>getPracticeTopicApi().voidPracticeEvent(
         history.id,history.version),'Practice event voided; due date restored')}>
        Void event
       </button>}
      </div>)}
     </section>
    </div>}
   </article>)}
   <button type="button" className={action}
    aria-expanded={showArchived} onClick={()=>setShowArchived(v=>!v)}>
    {showArchived?'Hide archived topics':'Show archived topics'} ({archived.length})
   </button>
   {showArchived&&<section aria-label="Archived practice topics" className="space-y-2">
    {archived.map(topic=><article key={topic.id} className="rounded-slab border border-edge p-3">
     <span className="break-words text-label">{topic.title}</span>
     <button className={action+' ml-3'} type="button" disabled={busy}
      aria-label={'Restore '+topic.title} onClick={()=>
       void run(()=>getPracticeTopicApi().restoreTopic(topic.id,topic.version),
        'Practice topic restored')}>Restore</button>
    </article>)}
   </section>}

  </section>
 </Screen>;
}
