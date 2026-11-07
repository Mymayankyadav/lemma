// N83 v6-only, server-backed review-run completion. Never infer counts
// from ephemeral Zustand answers; they survive route changes and reload.
import {useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {getApi} from '../../../data';
import {getRun,type DurableRun} from '../../review-run/v6/adapter';
const button='min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label font-semibold';
export default function ReviewDoneV6(){
 const [search]=useSearchParams(),navigate=useNavigate();
 const [run,setRun]=useState<DurableRun|null>(null);
 const [upcoming,setUpcoming]=useState<{date:string;due:number}[]>([]);
 const [error,setError]=useState<string|null>(null);
 const id=search.get('run');
 useEffect(()=>{
  let active=true;
  if(!id){setError('No completed review-run ID');return}
  void getRun(id).then(value=>{if(active)setRun(value)}).catch(e=>{
   if(active)setError(e instanceof Error?e.message:'Could not restore results');
  });
  void getApi().getReviewForecast().then(days=>{
   if(active)setUpcoming(days.filter(x=>x.due>0).slice(0,3)
    .map(x=>({date:x.day,due:x.due})));
  }).catch(()=>{/* Do not invent the next due date if forecast is unavailable. */});
  return()=>{active=false};
 },[id]);
 return <main aria-label="Durable review results" className="flex flex-col gap-4 pb-24">
  <h1 className="text-title-s font-semibold">Review complete</h1>
  {error&&<p role="alert">{error}</p>}
  {run?<section aria-label="Saved review counts" className="rounded-ctl border border-edge p-4">
   <p className="text-label text-ink-2">Saved review run</p>
   <strong className="block text-title-s">{run.progress.graded} graded</strong>
   <p className="text-label">{run.progress.skipped} stale cards skipped</p>
   <p className="text-label">{run.progress.total} cards selected</p>
   {!run.progress.done&&<p role="status">The run has {run.progress.remaining} items remaining.</p>}
  </section>:!error&&<p role="status">Loading saved review results…</p>}
  <section aria-label="Next arrivals" className="rounded-ctl border border-edge p-4">
   <h2 className="text-label font-semibold">Next arrivals</h2>
   {upcoming.length?<ul className="mt-2 flex flex-col gap-2">
    {upcoming.map(row=><li key={row.date} className="flex justify-between text-label">
     <time dateTime={row.date}>{row.date}</time><span>{row.due} due</span>
    </li>)}
   </ul>:<p className="text-label text-ink-2">No upcoming reviews confirmed.</p>}
  </section>
  <button className={button} onClick={()=>navigate('/review')}>Back to Review</button>
 </main>;
}
