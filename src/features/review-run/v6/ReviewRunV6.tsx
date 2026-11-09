// N83 v6-only durable review runner. The grade RPC returns a committed
// reviewId which is stored BEFORE any advance; retry never records it twice.
import {useEffect,useMemo,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {useRecordReview,useReviewItems,useSettings} from '../../../data/hooks';
import type {Confidence,QueueFilter,Rating} from '../../../data/types';
import {preview,scheduleConfig} from '../../../lib/fsrs';
import {MathText} from '../../../ui/MathText';
import {advanceGrade,advanceSkip,cardVersion,getRun,lastGraded,pauseRun,resumeRun,
 undoLast,unpauseRun,type DurableRun} from './adapter';
import {Undo2} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import {clearPendingGrade,pendingGrade,writePendingGrade,
 type PendingGrade} from './pending';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const button='min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label font-semibold focus-visible:outline-2 focus-visible:outline-amber disabled:opacity-50';
const grades=['Again','Hard','Good','Easy'] as const;
export default function ReviewRunV6(){
 const navigate=useNavigate(),[search]=useSearchParams();
 const settings=useSettings(),cards=useReviewItems(filter),record=useRecordReview(),queries=useQueryClient();
 const [run,setRun]=useState<DurableRun|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [revealed,setRevealed]=useState(false),[confidence,setConfidence]=useState<Confidence>(null);
 const [startTime,setStartTime]=useState(Date.now());
 const [pending,setPending]=useState<PendingGrade|null>(null);
 const runId=search.get('run');
 const item=run?.items[run.position],card=cards.data?.find(x=>x.cardId===item?.cardId);
 const faces=card?.type==='reverse'&&card.ord===2?
  {front:card.back,back:card.front}:{front:card?.front??'',back:card?.back??''};
 const choices=useMemo(()=>{
  if(!settings.data||!card)return null;
  try{return preview(card.state,Date.now(),scheduleConfig(settings.data))}
  catch{return null}
 },[settings.data,card]);
 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  void (async()=>{
   const loaded=runId?await getRun(runId):await resumeRun();
   if(cancelled)return;
   if(!loaded){setMessage('No saved review run was found.');return}
   const receipt=pendingGrade();
   if(receipt?.runId===loaded.id){
    const current=loaded.items[loaded.position];
    if(current?.id===receipt.itemId){
     setPending(receipt);
     // The grade already committed: only retry the advance.
     try{
      const next=await advanceGrade(loaded,current.id,receipt.reviewId);
      clearPendingGrade();if(!cancelled){setPending(null);setRun(next)}
      return;
     }catch{if(!cancelled)setMessage('The grade was saved. Retry advancing; do not grade again.')}
    }else clearPendingGrade();
   }
   if(!cancelled)setRun(loaded);
  })().catch(error=>{if(!cancelled)setMessage(error instanceof Error?error.message:'Could not restore review')})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[runId]);
 useEffect(()=>{setRevealed(false);setConfidence(null);setStartTime(Date.now())},
  [run?.id,run?.position]);
 const done=(result:DurableRun)=>{
  setRun(result);
  if(result.progress.done)
   navigate('/review/done?run='+encodeURIComponent(result.id));
 };
 async function retryAdvance(){
  if(!run||!item||!pending||busy)return;
  setBusy(true);setMessage(null);
  try{
   const result=await advanceGrade(run,item.id,pending.reviewId);
   clearPendingGrade();setPending(null);done(result);
  }catch(error){setMessage(error instanceof Error?error.message:'Could not advance saved grade')}
  finally{setBusy(false)}
 }
 async function grade(rating:Rating){
  if(!run||!item||!card||!choices||!settings.data||busy||pending)return;
  setBusy(true);setMessage(null);
  try{
   const currentVersion=await cardVersion(item.cardId);
   if(currentVersion!==null&&currentVersion!==item.expectedCardVersion){
    const result=await advanceSkip(run,item.id,'Card changed after run started');
    setMessage('Changed card skipped; no duplicate grade recorded.');done(result);return;
   }
   const reviewed=await record.mutateAsync({
    cardId:item.cardId,rating,confidence,
    durationMs:Math.min(600000,Math.max(0,Date.now()-startTime)),
    next:choices[rating].card,
   });
   const receipt={runId:run.id,itemId:item.id,reviewId:reviewed.reviewId};
   setPending(receipt);
   writePendingGrade(receipt);
   const advanced=await advanceGrade(run,item.id,reviewed.reviewId);
   clearPendingGrade();setPending(null);done(advanced);
  }catch(error){setMessage(error instanceof Error?error.message:'Review could not be saved')}
  finally{setBusy(false)}
 }
 /** bug #1299: undo the last answer; the card returns with its previous schedule, ready to grade again. */
 async function undoAnswer(){
  if(!run||busy||pending||!lastGraded(run))return;
  setBusy(true);setMessage(null);
  try{
   const result=await undoLast(run);
   setRun(result);setMessage('Answer undone. Grade this card again.');
   await queries.invalidateQueries();
  }catch(error){setMessage(error instanceof Error?error.message:'Could not undo the last answer')}
  finally{setBusy(false)}
 }
 async function skip(){
  if(!run||!item||busy||pending)return;
  setBusy(true);setMessage(null);
  try{
   const advanced=await advanceSkip(run,item.id,'Card missing or changed since run snapshot');
   setMessage('Stale card skipped.');done(advanced);
  }catch(error){setMessage(error instanceof Error?error.message:'Could not skip stale card')}
  finally{setBusy(false)}
 }
 async function leave(){
  if(!run||busy)return;
  setBusy(true);
  try{
   if(run.status==='running')await pauseRun(run);
   navigate('/review');
  }catch(error){setMessage(error instanceof Error?error.message:'Could not save the run position')}
  finally{setBusy(false)}
 }
 if(loading)return <main aria-label="Review run" role="status">Restoring saved review run…</main>;
 if(!run)return <main aria-label="Review run" className="flex flex-col gap-3">
  <p role="alert">{message??'No saved run'}</p>
  <button className={button} onClick={()=>navigate('/review')}>Back to Review</button>
 </main>;
 return <main aria-label="Durable review run" className="flex min-w-0 flex-col gap-4 pb-24">
  <header className="flex items-center justify-between gap-2">
   <button className="min-h-11 rounded-[8px] px-2 text-label text-ink-2" disabled={busy} onClick={()=>{void leave()}}>✕ Leave</button>
   <div className="text-center">
    <h1 className="sr-only">Review run</h1>
    <p className="text-label tabular-nums" role="progressbar"
     aria-valuemin={0} aria-valuemax={Math.max(1,run.progress.total)}
     aria-valuenow={run.progress.position}>
     {Math.min(run.progress.total,run.progress.position+1)} of {run.progress.total}
    </p>
   </div>
   <div className="flex items-center gap-1">
    <span className="text-caption text-ink-2">{run.progress.skipped} skipped</span>
    <button type="button" aria-label="Undo last answer" title="Undo last answer"
     disabled={busy||!!pending||!lastGraded(run)} onClick={()=>{void undoAnswer()}}
     className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] text-ink-2 disabled:opacity-40">
     <Undo2 size={20} aria-hidden="true"/>
    </button>
   </div>
  </header>
  {message&&<p role="alert" className="text-label text-ink-2">{message}</p>}
  {run.status==='paused'&&<button className={button} onClick={()=>{
   setBusy(true);void unpauseRun(run).then(setRun).catch(error=>setMessage(String(error)))
    .finally(()=>setBusy(false));
  }}>Resume this run</button>}
  {run.progress.done?<section className="flex flex-col gap-3">
   <p role="status">Review run saved. {run.progress.graded} graded; {run.progress.skipped} stale cards skipped.</p>
   <button className={button} onClick={()=>navigate('/review/done?run='+encodeURIComponent(run.id))}>See results</button>
  </section>:item&&run.status==='running'?<>
   {pending?<section className="flex flex-col gap-3">
    <p role="status">Your answer is recorded. Advance without grading again.</p>
    <button className={button} disabled={busy} onClick={()=>{void retryAdvance()}}>Retry advance</button>
   </section>:!card&&!cards.isPending?<section className="flex flex-col gap-3">
    <p role="status">This card is no longer in the current review queue. Its saved run position is unchanged.</p>
    <button className={button} disabled={busy} onClick={()=>{void skip()}}>Skip stale card</button>
    <button className={button} onClick={()=>{void cards.refetch()}}>Retry card lookup</button>
   </section>:card?<section className="flex flex-col gap-4">
    {/* N112 (mockup `15__Page`): the card sits on review paper; grades use the mockup grid. */}
    <div data-ui="review-paper" className="min-w-0 break-words p-4 font-math">
     <div className="mb-3 flex items-center justify-between border-b border-[var(--hair)] pb-2 font-[var(--font-ui)] text-caption tracking-[.08em] text-ink-2">
      <span>{card.kind.toUpperCase()}</span><span>Note {card.noteNo} · {card.kind}</span></div>
     <MathText source={faces.front} variant="card" interactiveMath/>
     {revealed&&<div className="mt-4 border-t border-edge pt-4">
      <MathText source={faces.back} variant="answer" interactiveMath/>
     </div>}
    </div>
    {!revealed?<section aria-label="Reveal answer" className="notebook-calibration-prompt">
     <p>How sure are you? <span className="text-ink-2">· optional</span></p>
     <div className="lemma-confidence-choices">
     {(['sure','unsure','guess'] as const).map(value=><button key={value}
      onClick={()=>{setConfidence(value);setRevealed(true)}}>
      {value}</button>)}
     </div>
     <small>Choose to reveal, or skip confidence below.</small>
     <button className="notebook-primary" onClick={()=>{setConfidence(null);setRevealed(true)}}>
      Show answer
     </button>
    </section>:<section aria-label="Grade answer" data-ui="review-grades" className="grid">
     {grades.map((label,i)=><button key={label} className={button+' min-w-0 [overflow-wrap:anywhere]'}
      disabled={busy||!choices} onClick={()=>{void grade((i+1) as Rating)}}>
      {label}<span className="block text-caption">{choices?.[(i+1) as Rating].label??'—'}</span>
     </button>)}
    </section>}
   </section>:<p role="status">Loading the saved card…</p>}
  </>:null}
 </main>;
}
