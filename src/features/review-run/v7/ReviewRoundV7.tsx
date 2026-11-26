import {FirstUseHint} from '../../../ui/v7/FirstUseHint';
import {Dock} from '../../../ui/v7/Dock';
import {AnimatePresence,motion,useIsPresent,type HTMLMotionProps} from 'motion/react';
import {useSurfaceBeta} from '../../../app/surfaceBeta';
import {useStudyUi} from '../../../data/StudyUiRelease';
// PLAN §6.4 B: the v7 review round. The durable-run engine is the N83 one used by v6:
// a grade's committed reviewId is stored BEFORE any advance, so a retry never records it twice.
import {GradeGlyph,type GradeKey} from '../../../ui/v7/grades';
import {fromEdge} from '../../../ui/v7/edges';
import {haptic} from '../../../ui/v7/haptics';
import {useToast} from '../../../ui/Toast';
import {memo,useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type PointerEvent as ReactPointerEvent} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {Undo2,X} from 'lucide-react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {authOwner,onAccountChange} from '../../../data/authBoundary';
import {getMode} from '../../../data/mode';
import {openStudyTarget,skipChangedStudyItem,targetFromLink} from './scopedRound';
import {saveGrade,savedGrade,confirmGrade,type GradeIntent} from './gradeIntent';
import {useHome,useRecordReview,useReviewItems,useSettings} from '../../../data/hooks';
import type {Confidence,QueueFilter,Rating,ReviewItem} from '../../../data/types';
import {preview,scheduleConfig} from '../../../lib/fsrs';
import {formatInterval} from '../../../lib/format';
import {noteKindText} from '../../../lib/labels';
import {MathText} from '../../../ui/MathText';
import {Button} from '../../../ui/v7/components';
import {isFlagOn} from '../../../flags';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import {ImmersiveHeader} from '../../../app/v7/V7Shell';
import {Margin} from '../../../app/v7/Margin';
import {ScratchPad} from './ScratchPad';
import {kitSubject} from '../../atlas/v7/model';
import {advanceGrade,advanceSkip,cardVersion,getRun,lastGraded,pauseRun,resumeRun,undoLast,unpauseRun,type DurableRun} from '../v6/adapter';
import {clearPendingGrade,pendingGrade,writePendingGrade,type PendingGrade} from '../v6/pending';
import './review.css';
import {Loader} from '../../../ui/v7/Loader';
import {playSound,soundsOn} from '../../../ui/v7/sounds';
import {useMotionReduced} from '../../../ui/v7/effects';
import {distances,durations,easings} from '../../../ui/v7/motion';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
export const gradeNames=['Again','Hard','Good','Easy'] as const;
const ReviewMath=memo(MathText);
/** Swipe: right is Good, left is Again, up is Easy (PLAN §6.4 B). */
export function swipeGrade(dx:number,dy:number,threshold=96):Rating|null{
 if(-dy>threshold&&Math.abs(dy)>Math.abs(dx))return 4;
 if(dx>threshold)return 3;
 if(dx<-threshold)return 1;
 return null;
}
type SwipeOffset={dx:number;dy:number};
type CommittedSwipe=SwipeOffset&{speed:number};
export function gradeDirection(rating:Rating):SwipeOffset{
 return rating===1?{dx:-1,dy:0}:rating===2?{dx:0,dy:1}:rating===3?{dx:1,dy:0}:{dx:0,dy:-1};
}
function dragTransform({dx,dy}:SwipeOffset){
 return `translate(${dx}px,${Math.min(0,dy)}px) rotate(${Math.max(-6,Math.min(6,dx/24))}deg)`;
}
export function swipeExit(offset:SwipeOffset,rating:Rating,extent:number):SwipeOffset{
 const direction=gradeDirection(rating);
 return {dx:offset.dx+direction.dx*extent,dy:Math.min(0,offset.dy)+direction.dy*extent};
}
const shifted=(direction:SwipeOffset,distance:number)=>`translate(${direction.dx*distance}px,${direction.dy*distance}px)`;
const gradesKey=(runId:string)=>'lemma.v7.review-grades.'+runId;
function readGrades(runId:string):Record<string,Rating>{try{return JSON.parse(sessionStorage.getItem(gradesKey(runId))??'{}') as Record<string,Rating>;}catch{return {};}}
function writeGrades(runId:string,grades:Record<string,Rating>){try{sessionStorage.setItem(gradesKey(runId),JSON.stringify(grades));}catch{/* colour memory only */}}

function ReviewCard({softExit,...props}:HTMLMotionProps<'article'>&{softExit:boolean}){
 const present=useIsPresent();
 return <motion.article {...props} inert={!present} aria-hidden={!present||undefined} data-exiting={!present||undefined}
  exit={softExit?{opacity:0,transition:{duration:durations.reduced,ease:easings.standard}}:undefined}/>;
}

export default function ReviewRoundV7(){
 const studyRepair=useStudyUi(),reviewMotion=useSurfaceBeta();
 const notify=useToast();
 const navigate=useNavigate(),[search]=useSearchParams(),queries=useQueryClient(),home=useHome();
 const settings=useSettings(),cards=useReviewItems(filter),record=useRecordReview();
 const [run,setRun]=useState<DurableRun|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [failedGrade,setFailedGrade]=useState<Rating|null>(null);
 const [message,setMessage]=useState<string|null>(null),[revealed,setRevealed]=useState(false),[confidence,setConfidence]=useState<Confidence>(null);
 const [startTime,setStartTime]=useState(Date.now()),[pending,setPending]=useState<PendingGrade|null>(null);
 const [grades,setGrades]=useState<Record<string,Rating>>({});
 const items=run?.items;
 const progressMarks=useMemo(()=>items?.map(entry=><li key={entry.id}
  data-grade={grades[entry.id]?gradeNames[grades[entry.id]-1].toLowerCase():entry.state==='graded'?'answered':entry.state==='stale'?'stale':undefined}/>),[grades,items]);
 const [redo,setRedo]=useState<{runId:string;version:number;itemId:string;rating:Rating}|null>(null);
 const [drag,setDrag]=useState<SwipeOffset|null>(null),[tracking,setTracking]=useState(false);
 const dragStart=useRef<{x:number;y:number;id:number;lastX:number;lastY:number;at:number;velocity:SwipeOffset}|null>(null);
 const gradeLock=useRef(false),cardNode=useRef<HTMLElement>(null),answerHeading=useId();
 const attachCard=useCallback((node:HTMLElement|null)=>{
  if(!node)return;
  cardNode.current=node;
  return ()=>{if(cardNode.current===node)cardNode.current=null;};
 },[]);
 const incoming=useRef<{itemId:string;from?:SwipeOffset}|null>(null);
 const reduced=useMotionReduced();
 const pendingRef=useRef<{itemId:string;rating:Rating;swipe?:CommittedSwipe}|null>(null);
 const queuedUndo=useRef<{runId:string;itemId:string}|null>(null);
 const pendingCard=useRef<{itemId:string;card:ReviewItem}|null>(null);
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
 const runId=search.get('run'),link=search.toString(),repair=studyRepair;
 const signedIn=useSyncExternalStore(onAccountChange,authOwner,authOwner);
 const atomic=studyRepair&&getMode()==='live';
 const [frozen,setFrozen]=useState<GradeIntent|null>(null),[changedItem,setChangedItem]=useState<string|null>(null);
 const item=run?.items[run.position],exactId=run?.targetCardId??(run?.target?item?.cardId:undefined);
 // Do not fetch singleton faces from the global quota-ranked prefix.
 const exact=useQuery({queryKey:['review-exact-card',run?.id,exactId],enabled:!!exactId&&!!item,
  queryFn:async()=>{
   if(run?.target&&getMode()==='live'){
    const {liveClient}=await import('../../../data/live/client');
    const {data,error}=await liveClient().rpc('study_run_item_available',{p_run:run.id,p_item:item!.id,p_card:exactId});
    if(error)throw Error(error.message);
    if(!data)return null;
   }
   return await getApi().getExactReviewCard?.(exactId!)??null;
  }});
 const lookedUp=exactId?(exact.data?.cardId===item?.cardId?exact.data:null):cards.data?.find(x=>x.cardId===item?.cardId);
 const card=pendingCard.current?.itemId===item?.id?pendingCard.current?.card??lookedUp:lookedUp;
 const lookup=exactId?exact:cards;
 const faces=card?.type==='reverse'&&card.ord===2?{front:card.back,back:card.front}:{front:card?.front??'',back:card?.back??''};
 const choices=useMemo(()=>{if(!settings.data||!card)return null;try{return preview(card.state,Date.now(),scheduleConfig(settings.data));}catch{return null;}},[settings.data,card]);
 useEffect(()=>{
  let cancelled=false;pendingCard.current=null;queuedUndo.current=null;setFailedGrade(null);setLoading(true);setRun(null);setFrozen(null);setPending(null);setMessage(null);
  void (async()=>{
   const parameters=new URLSearchParams(link);
   // A scoped URL must never fall through to a different active round while its
   // release check is pending, unavailable, or switched off for this owner.
   if(!repair&&(parameters.has('target')||parameters.has('id')||parameters.has('concept'))){
    setMessage('This review selection is not available yet. Reconnect and try again.');return;
   }
   const target=repair?await targetFromLink(parameters):null;
   const loaded=target?await openStudyTarget(target):runId?await getRun(runId):await resumeRun();
   if(cancelled)return;
   if(!loaded){setMessage(target?'There are no eligible cards in this review selection.':null);return;}
   if(target&&target.kind!=='round'){
    navigate('/review/run?run='+encodeURIComponent(loaded.id),{replace:true});return;
   }
   setGrades(readGrades(loaded.id));setRun(loaded);
   const intent=getMode()==='live'&&signedIn?savedGrade(signedIn,loaded.id):null;
   if(intent){
    setFrozen(intent);
    if(!atomic){setMessage('Reconnect to confirm your saved grade.');return;}
    try{
     const confirmed=await confirmGrade(intent);
     if(!cancelled){
      setFrozen(null);setRun(confirmed.run);
      if(!confirmed.applied){setChangedItem(intent.itemId);setMessage('The round changed. Your saved selection did not add a grade.');}
      else void queries.invalidateQueries();
     }
    }catch{if(!cancelled)setMessage('The grade could not be confirmed. Retry to recover this answer.');}
    return;
   }
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
 },[runId,link,repair,atomic,signedIn,queries,navigate]);
 useEffect(()=>{setRevealed(false);setConfidence(null);setStartTime(Date.now());setDrag(null);},[run?.id,run?.position]);
 useLayoutEffect(()=>{
  if(revealed)cardNode.current?.querySelector<HTMLElement>('.v7-review-back')?.focus({preventScroll:true});
 },[revealed]);
 useLayoutEffect(()=>{
  const next=incoming.current,node=cardNode.current;
  if(!node||!next||next.itemId!==item?.id||!card)return;
  incoming.current=null;
  node.querySelector<HTMLElement>('.v7-review-front')?.focus({preventScroll:true});
  if(!reviewMotion||typeof node.animate!=='function')return;
  const entry=reduced?undefined:next.from?shifted(next.from,distances.rise):`translateY(${distances.riseSmall}px)`;
  node.animate([{opacity:0,transform:entry},{opacity:1,transform:reduced?undefined:'none'}],{
   duration:1000*(reduced?durations.reduced:durations.quick),easing:`cubic-bezier(${easings.enter.join(',')})`,
  });
 },[item?.id,run?.version,card,reduced,reviewMotion]);
 const showRun=(result:DurableRun,from?:SwipeOffset,returning=false)=>{
  if(!alive.current)return;
  const next=result.items[result.position];
  if(next&&(returning||next.id!==item?.id)){
   incoming.current={itemId:next.id,from};
   setRevealed(false);setConfidence(null);setStartTime(Date.now());
  }
  pendingCard.current=null;setDrag(null);setRun(result);
  if(result.progress.done)navigate('/review/done?run='+encodeURIComponent(result.id));
 };
 async function done(result:DurableRun){
  const motion=pendingRef.current,node=cardNode.current;
  let exit:Animation|undefined;
  if(reviewMotion&&!reduced&&!queuedUndo.current&&motion&&motion.itemId===item?.id&&node&&typeof node.animate==='function'){
   // Keyboard and button grades use a fixed nudge without measuring the card.
   const extent=motion.swipe?Math.max(node.offsetWidth,node.offsetHeight)+24:0;
   const from=motion.swipe?dragTransform(motion.swipe):'none';
   const to=motion.swipe?dragTransform(swipeExit(motion.swipe,motion.rating,extent)):shifted(gradeDirection(motion.rating),distances.rise);
   const duration=1000*(motion.swipe?durations.baseExit:durations.quickExit);
   const initialSlope=motion.swipe?Math.max(.35,Math.min(3,motion.swipe.speed*duration/extent)):0;
   const curve=motion.swipe?[.2,.2*initialSlope,.38,1]:easings.exit;
   exit=node.animate([
    {opacity:1,transform:from},{opacity:0,transform:to},
   ],{duration,easing:`cubic-bezier(${curve.join(',')})`,fill:'forwards'});
   await exit.finished.catch(()=>undefined);
  }
  const request=queuedUndo.current;
  queuedUndo.current=null;
  if(alive.current&&request?.runId===result.id&&request.itemId===lastGraded(result)?.id){
   exit?.cancel();
   try{
    const restored=await undoGrade(result,request.itemId,motion?.rating);
    showRun(restored,motion?gradeDirection(motion.rating):undefined,true);
    return;
   }catch(error){setMessage(error instanceof Error?error.message:'Could not undo the last answer');}
  }
  showRun(result);
 }
 async function recover(intent:GradeIntent){
  const saved=await confirmGrade(intent);
  if(authOwner()!==intent.ownerId)return;
  setFrozen(null);
  if(saved.applied){
   const nextGrades={...grades,[intent.itemId]:intent.rating};
   setGrades(nextGrades);writeGrades(intent.runId,nextGrades);
   void queries.invalidateQueries();
  }else{setChangedItem(intent.itemId);setMessage('The round changed. Your saved selection did not add a grade.');}
  await done(saved.run);
 }
 async function retryGrade(){
  if(!frozen||gradeLock.current||busy||!atomic)return;
  gradeLock.current=true;setBusy(true);setMessage(null);
  pendingRef.current={itemId:frozen.itemId,rating:frozen.rating};
  try{await recover(frozen);}
  catch{if(authOwner()===frozen.ownerId)setMessage('The grade could not be confirmed. Retry to recover this answer.');}
  finally{gradeLock.current=false;pendingRef.current=null;queuedUndo.current=null;setBusy(false);}
 }
 async function grade(rating:Rating,swipe?:CommittedSwipe){
  if(!run||!item||!card||!choices||!settings.data||busy||gradeLock.current||pending||frozen)return;
  gradeLock.current=true;pendingRef.current={itemId:item.id,rating,swipe};pendingCard.current={itemId:item.id,card};
  if(swipe)setDrag(swipe);
  setBusy(true);setMessage(null);setFailedGrade(null);
  // N131 · A5: the pencil tick, when Sounds is on (it plays on the tap, before saving, so it is felt as the mark).
  void playSound('tick',soundsOn(settings.data.ui));
  // AW6: Good, Hard or Easy is one click, Again two light ticks.
  haptic(rating===1?'gradeAgain':'grade');
  try{
   if(getMode()==='live'&&run.target&&!atomic){
    setMessage('Reconnect to confirm review is available.');return;
   }
   if(atomic){
    let intent:GradeIntent;
    try{intent=saveGrade(run,{cardId:item.cardId,rating,confidence,durationMs:Math.min(600000,Math.max(0,Date.now()-startTime)),next:choices[rating].card});}
    catch{setMessage('This device could not keep a recoverable grade. Try again after reloading.');return;}
    setFrozen(intent);
    try{await recover(intent);}
    catch{if(authOwner()===intent.ownerId)setMessage('The grade could not be confirmed. Retry to recover this answer.');}
    return;
   }
   const currentVersion=await cardVersion(item.cardId);
   if(currentVersion!==null&&currentVersion!==item.expectedCardVersion){await done(await advanceSkip(run,item.id,'Card changed after run started'));setMessage('Changed card skipped; no duplicate grade recorded.');return;}
   const reviewed=await record.mutateAsync({cardId:item.cardId,expectedVersion:item.expectedCardVersion,rating,confidence,durationMs:Math.min(600000,Math.max(0,Date.now()-startTime)),next:choices[rating].card});
   const receipt={runId:run.id,itemId:item.id,reviewId:reviewed.reviewId};
   setPending(receipt);writePendingGrade(receipt);
   const nextGrades={...grades,[item.id]:rating};setGrades(nextGrades);writeGrades(run.id,nextGrades);
   const advanced=await advanceGrade(run,item.id,reviewed.reviewId);
   clearPendingGrade();setPending(null);await done(advanced);
  }catch(error){setMessage(error instanceof Error?error.message:'Review could not be saved');setFailedGrade(rating);}
  finally{gradeLock.current=false;pendingRef.current=null;queuedUndo.current=null;setDrag(null);setBusy(false);}
 }
 async function retryAdvance(){
  if(!run||!item||!pending||busy||gradeLock.current)return;gradeLock.current=true;setBusy(true);setMessage(null);
  const rating=grades[item.id];if(rating)pendingRef.current={itemId:item.id,rating};
  try{const result=await advanceGrade(run,item.id,pending.reviewId);clearPendingGrade();setPending(null);await done(result);}
  catch(error){setMessage(error instanceof Error?error.message:'Could not advance saved grade');}
  finally{gradeLock.current=false;pendingRef.current=null;queuedUndo.current=null;setBusy(false);}
 }
 async function undoGrade(source:DurableRun,itemId:string,rating:Rating|undefined){
  const result=await undoLast(source);
  if(!alive.current)return result;
  const nextGrades={...grades};
  delete nextGrades[itemId];setGrades(nextGrades);writeGrades(source.id,nextGrades);
  void queries.invalidateQueries();
  notify('Answer undone',{action:rating?{label:'Redo',onClick:()=>setRedo({runId:result.id,version:result.version,itemId,rating})}:undefined});
  return result;
 }
 async function undo(){
  if(!run)return;
  const attempt=pendingRef.current;
  if(gradeLock.current&&attempt){queuedUndo.current={runId:run.id,itemId:attempt.itemId};return;}
  const graded=lastGraded(run);
  if(busy||gradeLock.current||pending||frozen||!graded)return;
  gradeLock.current=true;setBusy(true);setMessage(null);
  try{
   const rating=grades[graded.id],result=await undoGrade(run,graded.id,rating);
   showRun(result,rating?gradeDirection(rating):undefined);
  }catch(error){setMessage(error instanceof Error?error.message:'Could not undo the last answer');}
  finally{gradeLock.current=false;setBusy(false);}
 }
 async function skip(){
  if(!run||!item||busy||pending||frozen)return;setBusy(true);setMessage(null);
  try{await done(atomic?await skipChangedStudyItem(run,item.id):await advanceSkip(run,item.id,'Card missing or changed since run snapshot'));setMessage('Stale card skipped.');}
  catch(error){setMessage(error instanceof Error?error.message:'Could not skip stale card');}
  finally{setBusy(false);}
 }
 async function leave(){
  if(!run||busy||frozen){navigate('/review');return;}
  setBusy(true);
  try{if(run.status==='running')await pauseRun(run);navigate('/review');}
  catch(error){setMessage(error instanceof Error?error.message:'Could not save the run position');}
  finally{setBusy(false);}
 }
 // Keyboard: Space reveals, 1–4 grade, U undoes.
 // AW6: revealing the answer is one soft tick.
 const reveal=()=>{if(!revealed)haptic('reveal');setRevealed(true);};
 useEffect(()=>{
  if(!redo||!run||busy||pending||frozen)return;
  if(redo.runId!==run.id||redo.version!==run.version||redo.itemId!==item?.id){setRedo(null);return;}
  if(!card||!choices)return;
  setRedo(null);
  void grade(redo.rating);
 },[redo,run,item,card,choices,busy,pending,frozen]);
 const keys=useRef({revealed,grade,undo,reveal});keys.current={revealed,grade,undo,reveal};
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(event.repeat||event.metaKey||event.ctrlKey||event.altKey||target?.closest('input,textarea,select,[contenteditable],dialog'))return;
   if(event.key===' '&&!keys.current.revealed){event.preventDefault();keys.current.reveal();}
   else if(/^[1-4]$/.test(event.key)&&keys.current.revealed){event.preventDefault();void keys.current.grade(Number(event.key) as Rating);}
   else if(event.key==='u'||event.key==='U'){void keys.current.undo();}
  };
  window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);
 },[]);
 // N132: a mouse swipe that starts on text the previous swipe selected would drag that text (the browser's own drag and
 // drop cancels the gesture), so the card never graded. Clear the selection when a swipe starts and after one is read.
 const clearSelection=()=>{try{window.getSelection()?.removeAllRanges();}catch{/* no selection API */}};
 const down=(event:ReactPointerEvent<HTMLElement>)=>{
  if(busy||gradeLock.current||pending||frozen||!event.isPrimary||event.button!==0||(event.target as Element).closest('a,button')||fromEdge(event.clientX))return;
  if(event.pointerType==='mouse')clearSelection();
  dragStart.current={x:event.clientX,y:event.clientY,id:event.pointerId,lastX:event.clientX,lastY:event.clientY,at:event.timeStamp,velocity:{dx:0,dy:0}};setTracking(true);
  event.currentTarget.setPointerCapture?.(event.pointerId);
 };
 const move=(event:ReactPointerEvent<HTMLElement>)=>{
  const start=dragStart.current;
  if(start?.id!==event.pointerId)return;
  const elapsed=Math.max(1,event.timeStamp-start.at);
  start.velocity={dx:(event.clientX-start.lastX)/elapsed,dy:(event.clientY-start.lastY)/elapsed};
  start.lastX=event.clientX;start.lastY=event.clientY;start.at=event.timeStamp;
  setDrag({dx:event.clientX-start.x,dy:event.clientY-start.y});
 };
 const up=(event:ReactPointerEvent<HTMLElement>)=>{
  const start=dragStart.current;if(start?.id!==event.pointerId)return;
  dragStart.current=null;setTracking(false);
  const offset={dx:event.clientX-start.x,dy:event.clientY-start.y},rating=swipeGrade(offset.dx,offset.dy);
  if(!rating){setDrag(null);return;}
  clearSelection();
  if(!revealed){setDrag(null);reveal();return;}
  if(!choices||gradeLock.current){setDrag(null);return;}
  const direction=gradeDirection(rating);
  const speed=event.timeStamp-start.at<80?Math.max(0,direction.dx*start.velocity.dx+direction.dy*start.velocity.dy):0;
  void grade(rating,{...offset,speed});
 };
 const swiping=drag&&revealed?swipeGrade(drag.dx,drag.dy,48):null;
 const project=home.data?.projects.find(entry=>entry.slug===card?.projectSlug),subject=kitSubject(project?.subject.name??'');
 if(loading)return <main id="main-content" className="v7-review" aria-label="Review round"><Loader className="v7-review-state" label="Restoring your review…"/></main>;
 if(!run)return <main id="main-content" className="v7-review" aria-label="Review round">
  <ImmersiveHeader leave={<button type="button" className="v7-icon-button" aria-label="Leave" onClick={()=>navigate('/review')}><X aria-hidden="true"/></button>} center={<span className="v7-meta">Review</span>}/>
  <div className="v7-review-state"><h1 className="v7-hub-title">No review in progress</h1>
   {message?<p role="alert">{message}</p>:<p className="v7-meta">Start a review to work through today's cards.</p>}
   <Button variant="primary" onClick={()=>navigate('/review')}>Start review</Button></div>
 </main>;
 const total=Math.max(1,run.progress.total),shown=Math.min(run.progress.total,run.progress.position+1);
 const savingGrade=busy?pendingRef.current:null;
 const canQueueUndo=!!savingGrade;
 return <main id="main-content" className="v7-review" aria-label="Review round" data-revealed={revealed?'true':'false'} data-review-motion={reviewMotion||undefined} data-spread={isFlagOn('v7Spread')?'':undefined}>
  <ImmersiveHeader leave={<button type="button" className="v7-icon-button" aria-label="Leave" onClick={()=>{void leave();}}><X aria-hidden="true"/></button>}
   center={<p className="v7-review-count" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={run.progress.position}>{shown} of {run.progress.total}</p>}
   more={<button type="button" className="v7-icon-button" aria-label="Undo last answer" title="Undo last answer (U)" disabled={!canQueueUndo&&(busy||!!pending||!!frozen||!lastGraded(run))} onClick={()=>{void undo();}}><Undo2 aria-hidden="true"/></button>}/>
  <ol className="v7-review-progress" aria-hidden="true">{progressMarks}</ol>
  {run.scopeLabel&&<p className="v7-review-message">{run.scopeLabel}</p>}
  {message&&<p role="alert" className="v7-review-message">{message}</p>}
  {failedGrade!==null&&!pending&&!frozen&&<Button small disabled={busy} onClick={()=>{void grade(failedGrade);}}>Retry saving answer</Button>}
  {/* N157 · U1 S11 (flag v7Margin): why this card and its source, beside the round; never the answer. */}
  {card&&revealed&&<Margin notes={[
   ...(project?[{title:'Why this card',body:<p>{project.title}{card.checkpointTitle?' · '+card.checkpointTitle:''}</p>}]:[]),
   ...(card.sourceShort?[{title:'Source',body:<p>{card.sourceShort}{card.pageLabel?', p. '+card.pageLabel:''}</p>}]:[]),
  ]} sheet={false}/>}
  {run.status==='paused'&&<Button onClick={()=>{setBusy(true);void unpauseRun(run).then(setRun).catch(error=>setMessage(String(error))).finally(()=>setBusy(false));}}>Resume this round</Button>}
  {frozen&&!busy&&<div className="v7-review-state">
   <p role="status">Your grade selection is saved on this device.</p>
   <Button disabled={!atomic} onClick={()=>{void retryGrade();}}>Retry grade confirmation</Button>
  </div>}
  {pending&&!busy&&<div className="v7-review-state"><p role="status">Your answer is recorded. Advance without grading again.</p><Button onClick={()=>{void retryAdvance();}}>Retry advance</Button></div>}
  {run.progress.done?<section className="v7-review-state"><p role="status">Round saved. {run.progress.graded} graded; {run.progress.skipped} skipped.</p>
   <Button variant="primary" onClick={()=>navigate('/review/done?run='+encodeURIComponent(run.id))}>See results</Button></section>
  :item&&run.status==='running'?<>
   {(!card&&!lookup.isPending&&!pending&&!frozen||changedItem===item.id)?<section className="v7-review-state"><p role="status">{lookup.isError?'Could not load this card. Retry the lookup.':'This card is no longer available for this review.'}</p>
    <Button disabled={busy||lookup.isError} onClick={()=>{void skip();}}>Skip stale card</Button><Button onClick={()=>{void lookup.refetch();}}>Retry card lookup</Button></section>
   :card?<section className="v7-review-stage">
    <AnimatePresence initial={false}>
    <ReviewCard key={item.id} ref={attachCard} softExit={reviewMotion&&reduced} className={'v7-review-card '+subjectClass(subject)} aria-label="Review card" aria-busy={!!savingGrade}
     data-tracking={tracking||drag?true:undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up}
     onPointerCancel={()=>{dragStart.current=null;setTracking(false);setDrag(null);}}
     style={drag&&!reduced?{transform:dragTransform(drag)}:undefined} data-swipe={swiping?gradeNames[swiping-1].toLowerCase():undefined}>
     <div className="v7-review-card-meta">
      {project&&<><span className={'v7-tag '+subjectClass(subject)}><SubjectMark subject={subject}/><span>{subject==='Other'?project.subject.name:subject}</span></span><span className="v7-meta">{project.title}{card.checkpointTitle?' · '+card.checkpointTitle:''}</span></>}
      <p className="v7-eyebrow">{noteKindText(card.kind)}</p>
     </div>
     <div className="v7-review-front" tabIndex={-1} role="group" aria-label="Question"><ReviewMath source={faces.front} variant="card" interactiveMath/></div>
     {!revealed?<div className="v7-review-confidence"><p>How sure? <span className="v7-meta">Optional</span></p>
      <div role="radiogroup" aria-label="How sure?">{(['sure','unsure','guess'] as const).map(value=><button key={value} type="button" role="radio" aria-checked={confidence===value}
       className="v7-filter-chip" onClick={()=>setConfidence(confidence===value?null:value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div></div>
     :<div className="v7-review-back" tabIndex={-1} role="group" aria-labelledby={answerHeading}>
      <p className="v7-eyebrow" id={answerHeading}>Answer</p><ReviewMath source={faces.back} variant="answer" interactiveMath/>
      <p className="v7-review-source">{card.sourceShort&&<span className="v7-meta">{card.sourceShort}{card.pageLabel?' p. '+card.pageLabel:''}</span>}
       {confidence&&<span className="v7-meta">You: {confidence[0].toUpperCase()+confidence.slice(1)}</span>}</p></div>}
     {savingGrade&&<span className="v7-review-pending" role="status">{frozen?'Confirming your grade…':'Saving answer…'}</span>}
     {swiping&&choices&&<p className="v7-review-swipe-label" aria-hidden="true">{gradeNames[swiping-1]} · {formatInterval(choices[swiping].delay/86_400_000)}</p>}
    </ReviewCard>
    </AnimatePresence>
    {isFlagOn('v7Scratch')&&<ScratchPad cardKey={item.id}/>}
    <FirstUseHint key={run.id} name="review-swipe" active={revealed}><p className="v7-review-hint">Swipe: right Good · left Again · up Easy</p></FirstUseHint>
   </section>:<p role="status" className="v7-review-state">Loading the card…</p>}
  </>:null}
  {item&&card&&changedItem!==item.id&&(!(pending||frozen)||busy)&&run.status==='running'&&!run.progress.done&&<Dock className="v7-review-dock">
   {!revealed?<Button variant="primary" onClick={reveal}>Show answer<kbd className="v7-review-key" aria-hidden="true">Space</kbd></Button>
   :<div className="v7-review-grades" role="group" aria-label="Grade answer">{gradeNames.map((label,index)=>{const choice=choices?.[(index+1) as Rating];
    return <button key={label} type="button" data-grade={label.toLowerCase()} data-pending={savingGrade?.rating===index+1||undefined}
     disabled={busy||!choices} onClick={()=>{void grade((index+1) as Rating);}}
     aria-label={label+(choice?', next in '+formatInterval(choice.delay/86_400_000):'')+' ('+(index+1)+')'}>
     <span><GradeGlyph grade={label.toLowerCase() as GradeKey} size={14}/>{label}</span><small>{choice?formatInterval(choice.delay/86_400_000):'—'}</small><kbd className="v7-review-key" aria-hidden="true">{index+1}</kbd></button>;})}</div>}
  </Dock>}
 </main>;
}
