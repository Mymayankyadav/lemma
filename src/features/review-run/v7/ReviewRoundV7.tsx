// PLAN §6.4 B: the v7 review round. The durable-run engine is the N83 one used by v6:
// a grade's committed reviewId is stored BEFORE any advance, so a retry never records it twice.
import {useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {Undo2,X} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import {useHome,useRecordReview,useReviewItems,useSettings} from '../../../data/hooks';
import type {Confidence,QueueFilter,Rating} from '../../../data/types';
import {preview,scheduleConfig} from '../../../lib/fsrs';
import {formatInterval} from '../../../lib/format';
import {noteKindText} from '../../../lib/labels';
import {MathText} from '../../../ui/MathText';
import {Button} from '../../../ui/v7/components';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import {ImmersiveHeader} from '../../../app/v7/V7Shell';
import {kitSubject} from '../../atlas/v7/model';
import {advanceGrade,advanceSkip,cardVersion,getRun,lastGraded,pauseRun,resumeRun,undoLast,unpauseRun,type DurableRun} from '../v6/adapter';
import {clearPendingGrade,pendingGrade,writePendingGrade,type PendingGrade} from '../v6/pending';
import './review.css';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
export const gradeNames=['Again','Hard','Good','Easy'] as const;
/** Swipe: right is Good, left is Again, up is Easy (PLAN §6.4 B). */
export function swipeGrade(dx:number,dy:number,threshold=96):Rating|null{
 if(-dy>threshold&&Math.abs(dy)>Math.abs(dx))return 4;
 if(dx>threshold)return 3;
 if(dx<-threshold)return 1;
 return null;
}
const gradesKey=(runId:string)=>'lemma.v7.review-grades.'+runId;
function readGrades(runId:string):Record<string,Rating>{try{return JSON.parse(sessionStorage.getItem(gradesKey(runId))??'{}') as Record<string,Rating>;}catch{return {};}}
function writeGrades(runId:string,grades:Record<string,Rating>){try{sessionStorage.setItem(gradesKey(runId),JSON.stringify(grades));}catch{/* colour memory only */}}

export default function ReviewRoundV7(){
 const navigate=useNavigate(),[search]=useSearchParams(),queries=useQueryClient(),home=useHome();
 const settings=useSettings(),cards=useReviewItems(filter),record=useRecordReview();
 const [run,setRun]=useState<DurableRun|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState<string|null>(null),[revealed,setRevealed]=useState(false),[confidence,setConfidence]=useState<Confidence>(null);
 const [startTime,setStartTime]=useState(Date.now()),[pending,setPending]=useState<PendingGrade|null>(null);
 const [grades,setGrades]=useState<Record<string,Rating>>({});
 const [drag,setDrag]=useState<{dx:number;dy:number}|null>(null);
 const dragStart=useRef<{x:number;y:number}|null>(null);
 const runId=search.get('run');
 const item=run?.items[run.position],card=cards.data?.find(x=>x.cardId===item?.cardId);
 const faces=card?.type==='reverse'&&card.ord===2?{front:card.back,back:card.front}:{front:card?.front??'',back:card?.back??''};
 const choices=useMemo(()=>{if(!settings.data||!card)return null;try{return preview(card.state,Date.now(),scheduleConfig(settings.data));}catch{return null;}},[settings.data,card]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);
  void (async()=>{
   const loaded=runId?await getRun(runId):await resumeRun();
   if(cancelled)return;
   if(!loaded){setMessage(null);return;}
   setGrades(readGrades(loaded.id));
   const receipt=pendingGrade();
   if(receipt?.runId===loaded.id){
    const current=loaded.items[loaded.position];
    if(current?.id===receipt.itemId){
     setPending(receipt);
     try{const next=await advanceGrade(loaded,current.id,receipt.reviewId);clearPendingGrade();if(!cancelled){setPending(null);setRun(next);}return;}
     catch{if(!cancelled)setMessage('The grade was saved. Retry advancing; do not grade again.');}
    }else clearPendingGrade();
   }
   if(!cancelled)setRun(loaded);
  })().catch(error=>{if(!cancelled)setMessage(error instanceof Error?error.message:'Could not restore review');}).finally(()=>{if(!cancelled)setLoading(false);});
  return ()=>{cancelled=true;};
 },[runId]);
 useEffect(()=>{setRevealed(false);setConfidence(null);setStartTime(Date.now());setDrag(null);},[run?.id,run?.position]);
 const done=(result:DurableRun)=>{setRun(result);if(result.progress.done)navigate('/review/done?run='+encodeURIComponent(result.id));};
 async function grade(rating:Rating){
  if(!run||!item||!card||!choices||!settings.data||busy||pending)return;
  setBusy(true);setMessage(null);
  try{
   const currentVersion=await cardVersion(item.cardId);
   if(currentVersion!==null&&currentVersion!==item.expectedCardVersion){done(await advanceSkip(run,item.id,'Card changed after run started'));setMessage('Changed card skipped; no duplicate grade recorded.');return;}
   const reviewed=await record.mutateAsync({cardId:item.cardId,rating,confidence,durationMs:Math.min(600000,Math.max(0,Date.now()-startTime)),next:choices[rating].card});
   const receipt={runId:run.id,itemId:item.id,reviewId:reviewed.reviewId};
   setPending(receipt);writePendingGrade(receipt);
   const nextGrades={...grades,[item.id]:rating};setGrades(nextGrades);writeGrades(run.id,nextGrades);
   const advanced=await advanceGrade(run,item.id,reviewed.reviewId);
   clearPendingGrade();setPending(null);done(advanced);
  }catch(error){setMessage(error instanceof Error?error.message:'Review could not be saved');}
  finally{setBusy(false);}
 }
 async function retryAdvance(){
  if(!run||!item||!pending||busy)return;setBusy(true);setMessage(null);
  try{const result=await advanceGrade(run,item.id,pending.reviewId);clearPendingGrade();setPending(null);done(result);}
  catch(error){setMessage(error instanceof Error?error.message:'Could not advance saved grade');}
  finally{setBusy(false);}
 }
 async function undo(){
  if(!run||busy||pending||!lastGraded(run))return;setBusy(true);setMessage(null);
  try{
   const graded=lastGraded(run),result=await undoLast(run);
   if(graded){const nextGrades={...grades};delete nextGrades[graded.id];setGrades(nextGrades);writeGrades(run.id,nextGrades);}
   setRun(result);setMessage('Answer undone. Grade this card again.');await queries.invalidateQueries();
  }catch(error){setMessage(error instanceof Error?error.message:'Could not undo the last answer');}
  finally{setBusy(false);}
 }
 async function skip(){
  if(!run||!item||busy||pending)return;setBusy(true);setMessage(null);
  try{done(await advanceSkip(run,item.id,'Card missing or changed since run snapshot'));setMessage('Stale card skipped.');}
  catch(error){setMessage(error instanceof Error?error.message:'Could not skip stale card');}
  finally{setBusy(false);}
 }
 async function leave(){
  if(!run||busy){navigate('/review');return;}
  setBusy(true);
  try{if(run.status==='running')await pauseRun(run);navigate('/review');}
  catch(error){setMessage(error instanceof Error?error.message:'Could not save the run position');}
  finally{setBusy(false);}
 }
 // Keyboard: Space reveals, 1–4 grade, U undoes.
 const keys=useRef({revealed,grade,undo,reveal:()=>setRevealed(true)});keys.current={revealed,grade,undo,reveal:()=>setRevealed(true)};
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(event.metaKey||event.ctrlKey||event.altKey||target?.closest('input,textarea,select,[contenteditable],dialog'))return;
   if(event.key===' '&&!keys.current.revealed){event.preventDefault();keys.current.reveal();}
   else if(/^[1-4]$/.test(event.key)&&keys.current.revealed){event.preventDefault();void keys.current.grade(Number(event.key) as Rating);}
   else if(event.key==='u'||event.key==='U'){void keys.current.undo();}
  };
  window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);
 },[]);
 const down=(event:ReactPointerEvent<HTMLElement>)=>{if(!revealed||busy||(event.target as HTMLElement).closest('a,button'))return;dragStart.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture?.(event.pointerId);};
 const move=(event:ReactPointerEvent<HTMLElement>)=>{if(!dragStart.current)return;setDrag({dx:event.clientX-dragStart.current.x,dy:event.clientY-dragStart.current.y});};
 const up=()=>{const start=dragStart.current;dragStart.current=null;if(!start||!drag){setDrag(null);return;}const rating=swipeGrade(drag.dx,drag.dy);setDrag(null);if(rating)void grade(rating);};
 const swiping=drag?swipeGrade(drag.dx,drag.dy,48):null;
 const project=home.data?.projects.find(entry=>entry.slug===card?.projectSlug),subject=kitSubject(project?.subject.name??'');
 if(loading)return <main id="main-content" className="v7-review" aria-label="Review round"><p role="status" className="v7-review-state">Restoring your review…</p></main>;
 if(!run)return <main id="main-content" className="v7-review" aria-label="Review round">
  <ImmersiveHeader leave={<button type="button" className="v7-icon-button" aria-label="Leave" onClick={()=>navigate('/review')}><X aria-hidden="true"/></button>} center={<span className="v7-meta">Review</span>}/>
  <div className="v7-review-state"><h1 className="v7-hub-title">No review in progress</h1>
   {message?<p role="alert">{message}</p>:<p className="v7-meta">Start a review to work through today's cards.</p>}
   <Button variant="primary" onClick={()=>navigate('/review')}>Start review</Button></div>
 </main>;
 const total=Math.max(1,run.progress.total),shown=Math.min(run.progress.total,run.progress.position+1);
 return <main id="main-content" className="v7-review" aria-label="Review round" data-revealed={revealed?'true':'false'}>
  <ImmersiveHeader leave={<button type="button" className="v7-icon-button" aria-label="Leave" onClick={()=>{void leave();}}><X aria-hidden="true"/></button>}
   center={<p className="v7-review-count" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={run.progress.position}>{shown} of {run.progress.total}</p>}
   more={<button type="button" className="v7-icon-button" aria-label="Undo last answer" title="Undo last answer (U)" disabled={busy||!!pending||!lastGraded(run)} onClick={()=>{void undo();}}><Undo2 aria-hidden="true"/></button>}/>
  <ol className="v7-review-progress" aria-hidden="true">{run.items.map(entry=><li key={entry.id} data-grade={grades[entry.id]?gradeNames[grades[entry.id]-1].toLowerCase():entry.state==='graded'?'answered':entry.state==='stale'?'stale':undefined}/>)}</ol>
  {message&&<p role="alert" className="v7-review-message">{message}</p>}
  {run.status==='paused'&&<Button onClick={()=>{setBusy(true);void unpauseRun(run).then(setRun).catch(error=>setMessage(String(error))).finally(()=>setBusy(false));}}>Resume this round</Button>}
  {run.progress.done?<section className="v7-review-state"><p role="status">Round saved. {run.progress.graded} graded; {run.progress.skipped} skipped.</p>
   <Button variant="primary" onClick={()=>navigate('/review/done?run='+encodeURIComponent(run.id))}>See results</Button></section>
  :item&&run.status==='running'?<>
   {pending?<section className="v7-review-state"><p role="status">Your answer is recorded. Advance without grading again.</p><Button disabled={busy} onClick={()=>{void retryAdvance();}}>Retry advance</Button></section>
   :!card&&!cards.isPending?<section className="v7-review-state"><p role="status">This card is no longer in the current review queue.</p>
    <Button disabled={busy} onClick={()=>{void skip();}}>Skip stale card</Button><Button onClick={()=>{void cards.refetch();}}>Retry card lookup</Button></section>
   :card?<section className="v7-review-stage">
    <article className={'v7-review-card '+subjectClass(subject)} aria-label="Review card" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{dragStart.current=null;setDrag(null);}}
     style={drag?{transform:`translate(${drag.dx}px,${Math.min(0,drag.dy)}px) rotate(${Math.max(-6,Math.min(6,drag.dx/24))}deg)`} as CSSProperties:undefined} data-swipe={swiping?gradeNames[swiping-1].toLowerCase():undefined}>
     <div className="v7-review-card-meta">
      {project&&<span className={'v7-tag '+subjectClass(subject)}><SubjectMark subject={subject}/><span>{project.title}{card.checkpointTitle?' · '+card.checkpointTitle:''}</span></span>}
      <p className="v7-eyebrow">{noteKindText(card.kind)}</p>
     </div>
     <div className="v7-review-front"><MathText source={faces.front} variant="card" interactiveMath/></div>
     {!revealed?<div className="v7-review-confidence"><p>How sure are you? <span className="v7-meta">Optional</span></p>
      <div role="radiogroup" aria-label="How sure are you?">{(['sure','unsure','guess'] as const).map(value=><button key={value} type="button" role="radio" aria-checked={confidence===value}
       className="v7-filter-chip" onClick={()=>setConfidence(confidence===value?null:value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div></div>
     :<div className="v7-review-back"><p className="v7-eyebrow">Answer</p><MathText source={faces.back} variant="answer" interactiveMath/>
      <p className="v7-review-source">{card.sourceShort&&<span className="v7-badge v7-proof-conjecture">{card.sourceShort}{card.pageLabel?' p. '+card.pageLabel:''}</span>}
       {confidence&&<span className="v7-meta">You: {confidence[0].toUpperCase()+confidence.slice(1)}</span>}</p></div>}
     {swiping&&choices&&<p className="v7-review-swipe-label" aria-hidden="true">{gradeNames[swiping-1]} · {formatInterval(choices[swiping].delay/86_400_000)}</p>}
    </article>
    {revealed&&run.progress.graded<3&&<p className="v7-review-hint">Swipe right for Good, left for Again, up for Easy.</p>}
   </section>:<p role="status" className="v7-review-state">Loading the card…</p>}
  </>:null}
  {item&&card&&!pending&&run.status==='running'&&!run.progress.done&&<div className="v7-review-dock">
   {!revealed?<Button variant="primary" onClick={()=>setRevealed(true)}>Show answer</Button>
   :<div className="v7-review-grades" role="group" aria-label="Grade answer">{gradeNames.map((label,index)=>{const choice=choices?.[(index+1) as Rating];
    return <button key={label} type="button" data-grade={label.toLowerCase()} disabled={busy||!choices} onClick={()=>{void grade((index+1) as Rating);}}
     aria-label={label+(choice?', next in '+formatInterval(choice.delay/86_400_000):'')+' ('+(index+1)+')'}>
     <span>{label}</span><small>{choice?formatInterval(choice.delay/86_400_000):'—'}</small></button>;})}</div>}
  </div>}
 </main>;
}
