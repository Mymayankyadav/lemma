// N83 v6-only, server-backed review-run completion. Never infer counts
// from ephemeral Zustand answers; they survive route changes and reload.
import {useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {getApi} from '../../../data';
import {formatDay} from '../../../lib/format';
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
  <h1 className="sr-only">Review complete</h1>
  {error&&<p role="alert">{error}</p>}
  {/* N112 (mockup `16__Page`): one summary card, then upcoming arrivals as ruled rows. */}
  {run?<section aria-label="Saved review counts" className="notebook-review-summary pb-6">
   <p className="notebook-eyebrow">ROUND COMPLETE</p>
   <h2>{run.progress.graded} graded</h2>
   {run.progress.skipped>0&&<p className="text-label">{run.progress.skipped} {run.progress.skipped===1?'card':'cards'} skipped (changed since you started)</p>}
   <p className="text-label">{run.progress.total} cards selected</p>
   {!run.progress.done&&<p role="status">The run has {run.progress.remaining} items remaining.</p>}
  </section>:!error&&<p role="status">Loading saved review results…</p>}
  <section aria-label="Next arrivals" className="notebook-next-step">
   <h3>Next arrivals</h3>
   {upcoming.length?<ul className="mt-2 flex flex-col gap-2">
    {upcoming.map(row=><li key={row.date} className="flex justify-between text-label">
     <time dateTime={row.date}>{formatDay(row.date)}</time><span>{row.due} due</span>
    </li>)}
   </ul>:<p className="text-label text-ink-2">No upcoming reviews confirmed.</p>}
  </section>
  <button className="notebook-primary" onClick={()=>navigate('/review')}>Back to Review</button>
 </main>;
}
