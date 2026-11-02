import './review.css';
import {lazy,memo,Suspense,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {AnimatePresence,motion,useAnimationControls,useMotionValue,useReducedMotion,useTransform} from 'motion/react';
import {ArrowLeft,BookOpen,CircleCheck,CircleDashed,CircleHelp,MessageSquarePlus,Undo2,X,Check,Clock3} from 'lucide-react';
import {useAddComment,useRecordReview,useReviewItems,useSettings,useSetNoteStatus,useUndoReview} from '../../data/hooks';
import type {Confidence,QueueFilter,Rating,ReviewItem} from '../../data/types';
import {preview,scheduleConfig} from '../../lib/fsrs';
import {useReviewSession} from './store';
import {Screen} from '../../ui/Screen';
import {IconButton} from '../../ui/IconButton';
import {Button} from '../../ui/Button';
import {isPlainReviewFront} from './plainFront';
import {reviewInitialLoadFailure} from './loadFailure';
import {scheduleScrollHintMeasure} from './scrollHint';
import {Card} from '../../ui/Card';
import {Glyph} from '../../ui/Glyph';
import {Chip} from '../../ui/Chip';

import {Skeleton} from '../../ui/Skeleton';
import {useToast} from '../../ui/Toast';
import {useCalm} from '../../ui/useCalm';

const RichMathText=lazy(()=>import('../../ui/MathText').then(module=>({default:module.MathText})));
const NoteSheet=lazy(()=>import('../../ui/Sheet').then(module=>({default:module.Sheet})));
// Local performance entries only; no network/analytics. CI reads these to
// distinguish module loading, data readiness and queue initialization.
if(typeof performance!=='undefined')performance.mark('review-run-module-ready');

const fallback:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const gradeNames=['Again','Hard','Good','Easy'] as const;
const gradeColors=['var(--danger)','var(--late)','var(--early)','var(--link)'] as const;
const confidenceOptions=[
 {value:'sure' as const,label:'Sure',icon:CircleCheck},
 {value:'unsure' as const,label:'Unsure',icon:CircleDashed},
 {value:'guess' as const,label:'Guess',icon:CircleHelp},
];

const CardFace=memo(function CardFace({item,revealed,confidence,quiet,stamp}:{item:ReviewItem;revealed:boolean;confidence:Confidence;quiet:boolean;stamp:boolean}){
 const front=item.type==='reverse'&&item.ord===2?item.back:item.front;
 const back=item.type==='reverse'&&item.ord===2?item.front:item.back;
 const scrollRef=useRef<HTMLDivElement>(null);
 const [more,setMore]=useState(0);
 const fontSize=front.length>200?18:21;
 const plainFront=isPlainReviewFront(front,item.type);
 useEffect(()=>{
  const el=scrollRef.current;
  if(!el)return;
  const measure=()=>setMore(Math.max(0,Math.ceil((el.scrollHeight-el.scrollTop-el.clientHeight)/28)));
  if(typeof performance!=='undefined')performance.mark('review-run-card-mounted');
  return scheduleScrollHintMeasure(measure);
 },[front,back,revealed]);
 return <Card stack className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[6px] px-[18px] pb-3 pt-3"
  style={{height:'clamp(208px,42dvh,350px)',minHeight:208,backgroundImage:'repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, var(--line) 28px)'}}>
  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-edge pb-2">
   <span className="text-label uppercase tracking-wide text-ink-3">{item.kind}</span>
   <span className="font-math text-label text-ink-2">N{item.noteNo}</span>
   {revealed&&confidence&&<Chip tone={confidence==='sure'?'amber':'quiet'} size={28}>{confidence}</Chip>}
  </div>
  <div className="relative min-h-0 min-w-0 flex-1">
   <div ref={scrollRef} data-review-card-scroll tabIndex={0} role="region" aria-label="Card face, scroll to read the full content"
    onScroll={e=>{const el=e.currentTarget;setMore(Math.max(0,Math.ceil((el.scrollHeight-el.scrollTop-el.clientHeight)/28)))}}
    className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain pr-1 pb-6">
    <div className="review-front min-w-0 font-math" style={{fontSize,lineHeight:'28px'}}>
     {plainFront?<div className={'lemma-math prose-invert min-w-0 max-w-none wrap-break-word font-math text-card leading-[1.3] text-ink '+(fontSize===21?'!text-[21px] !leading-[28px]':'!text-[18px] !leading-[28px]')}><p>{front}</p></div>:
      <RichMathText className={fontSize===21?'!text-[21px] !leading-[28px]':'!text-[18px] !leading-[28px]'} source={front} variant="card" cloze={item.type==='cloze'?{ord:item.ord,revealed}:undefined} interactiveMath/>}
    </div>
    {revealed&&<div className="mt-4 min-w-0 font-math text-[18px] leading-[28px]">
     <motion.div initial={quiet?false:{scaleX:0}} animate={{scaleX:1}} transition={{duration:quiet?0:0.32}} className="mb-4 h-[1.5px] origin-left bg-amber"/>
     <motion.div initial={quiet?false:{opacity:0}} animate={{opacity:1}} transition={{duration:quiet?0:.3}}>
      <Suspense fallback={<p role="status" className="text-label text-ink-2">Rendering mathematical answer…</p>}>
      {back?<RichMathText className="!text-[18px] !leading-[28px]" source={back} variant="answer" interactiveMath/>:item.type==='cloze'?<RichMathText source={front} variant="answer" cloze={{ord:item.ord,revealed:true}} interactiveMath/>:
       <p className="font-math text-title-s text-ink-2">See the highlighted answer above.</p>}
      </Suspense>
     </motion.div>
    </div>}
   </div>
   {more>0&&<div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-end justify-center pb-1 text-caption text-amber"
    style={{background:'linear-gradient(transparent,var(--card-bg, var(--raised)))'}}>
    {more} more {more===1?'line':'lines'} · scroll
   </div>}
  </div>
  <div className="flex shrink-0 flex-wrap gap-2 text-ink-3">
   {item.sourceShort&&<Chip tone="quiet" icon={BookOpen}>{item.sourceShort}{item.pageLabel?' p. '+item.pageLabel:''}</Chip>}
   {item.sessionNumber&&<Chip tone="quiet" icon={Clock3}>{'S'+item.sessionNumber}</Chip>}
  </div>
  {stamp&&<motion.span aria-hidden="true" data-proof-stamp className="pointer-events-none absolute right-4 top-12 font-math text-title text-amber" initial={quiet?false:{opacity:0,scale:1.8}} animate={{opacity:1,scale:1}} transition={{duration:quiet?0:.12}}>∎</motion.span>}
 </Card>;
});

/** Preserve native Space/Enter activation for focused controls and editable content. */
function isInteractiveShortcutTarget(target:EventTarget|null):boolean{
 return target instanceof Element&&!!target.closest(
  'button, a[href], input, textarea, select, summary, [contenteditable], '+
  '[role="button"], [role="link"], [role="checkbox"], [role="radio"], '+
  '[role="switch"], [role="tab"], [role="slider"], [role="menuitem"], '+
  '[role="textbox"], [role="combobox"]'
 );
}

export default function Page(){
 const firstRender=useRef(false);
 if(!firstRender.current){firstRender.current=true;if(typeof performance!=='undefined')performance.mark('review-run-first-render')}
 const navigate=useNavigate(),[search]=useSearchParams(),notify=useToast(),reduced=!!useReducedMotion(),calm=useCalm(),reduce=reduced||calm;
 const settings=useSettings(),mutate=useRecordReview(),undo=useUndoReview();
 const addComment=useAddComment(),suspend=useSetNoteStatus();
 const current=useReviewSession(s=>s.current),queue=useReviewSession(s=>s.queue);
 const revealed=useReviewSession(s=>s.revealed),confidence=useReviewSession(s=>s.confidence);
 const submitting=useReviewSession(s=>s.submitting),answers=useReviewSession(s=>s.answers);
 const lastUndo=useReviewSession(s=>s.lastUndo),total=useReviewSession(s=>s.total),startTime=useReviewSession(s=>s.startTime);
 const roundOrder=useReviewSession(s=>s.roundOrder),pendingAgain=useReviewSession(s=>s.pendingAgain);
 // A retry must not send the linear meter backwards. Count settled or
 // suspended cards, not the original index of a card revisited after Again.
 const settled=Math.max(0,Math.min(total,roundOrder.length-1-pendingAgain.length));
 const reveal=useReviewSession(s=>s.reveal),beginGrade=useReviewSession(s=>s.beginGrade);
 const cancelGrade=useReviewSession(s=>s.cancelGrade),committed=useReviewSession(s=>s.committed);
 const undoCommitted=useReviewSession(s=>s.undoCommitted);
 const [sheetOpen,setSheetOpen]=useState(false);
 const [sheetActivated,setSheetActivated]=useState(false);
 // An unsaved note belongs to its review card, never to the next card dealt.
 const [draft,setDraft]=useState<{cardId:string;value:string}|null>(null);
 const note=draft&&current&&draft.cardId===current.cardId?draft.value:'';
 const dragX=useMotionValue(0),dragY=useMotionValue(0),rotation=useTransform(dragX,x=>x/22);
 const swipeLabel=useTransform([dragX,dragY],([x,y]):string=>Number(y)<-60?'Easy':Number(x)>40?'Good':Number(x)<-40?'Again':'');
 const cardMotion=useAnimationControls();
 const [stamp,setStamp]=useState(false),[calibrationNote,setCalibrationNote]=useState<string|null>(null);
 const previousCardId=useRef<string|null>(null);
 const firstCard=useRef(true);
 useEffect(()=>{
  const cardId=current?current.cardId+':'+answers.length:null;
  if(previousCardId.current===cardId)return;
  previousCardId.current=cardId;
  const first=firstCard.current;
  firstCard.current=false;
  dragX.set(0);dragY.set(0);setStamp(false);
  // The cold first card already mounts with initial=false: do not enqueue a
  // redundant zero-duration MotionControls update before its first paint.
  // Subsequent cards keep their existing reset and entrance animation.
  if(!first)void cardMotion.start({opacity:1,x:0,y:0,scale:1,transition:{duration:reduce?0:.48}});
  setDraft(null);
  setSheetOpen(false);
 },[current?.cardId,answers.length,reduce]);
 const init=useRef(false);
 const sessionId=search.get('session'),conceptSlug=search.get('concept'),onlyNew=search.get('new')==='1';
 const filter=useMemo<QueueFilter>(()=>({...fallback,sessionId,conceptSlug,newOnly:onlyNew}),[sessionId,conceptSlug,onlyNew]);
 const apiCards=useReviewItems(filter);
 // Loaded settings/cards must initialize the first real card in the layout
 // phase, not after a passive-effect frame of skeleton/Preparing UI.
 useLayoutEffect(()=>{
  if(init.current||!settings.data||!apiCards.data)return;
  init.current=true;
  if(useReviewSession.getState().queue)return;
  const queueStart=performance.now();
  performance.mark('review-run-data-ready');
  useReviewSession.getState().initialize(apiCards.data,settings.data,filter);
  performance.measure('review-run-queue-initialize',{start:queueStart,end:performance.now()});
 },[settings.data,apiCards.data,filter]);
 const intervals=useMemo(()=>{
  // FSRS preview and scheduleConfig are not visible until the answer is
  // revealed. Defer them off the strict cold first-card paint, then compute
  // the same intervals for every grade button and committed review.
  if(!revealed||!settings.data||!current)return null;
  try{return preview(current.state,Date.now(),scheduleConfig(settings.data))}
  catch{return null}
 },[revealed,settings.data,current]);
 function close(){
  if(answers.length)navigate('/review/done');
  else {useReviewSession.getState().close();navigate('/review')}
 }
 async function grade(rating:Rating){
  if(!current||!revealed||!intervals||useReviewSession.getState().submitting)return;
  const durationMs=Math.max(0,Math.min(600000,Date.now()-startTime));
  beginGrade();
  try{
   const result=await mutate.mutateAsync({cardId:current.cardId,rating,confidence,durationMs,
    next:intervals[rating].card});
   const note=confidence==='sure'&&rating===1?'You were sure, so this one comes back soon':
    confidence==='guess'&&(rating===3||rating===4)?'A good guess. It will come back a little sooner.':null;
   setCalibrationNote(note);
   if(rating>=3)setStamp(true);
   if(!reduce){
    try{
    if(rating>=3)await cardMotion.start({scale:1,transition:{duration:.12}});
    const exit=rating===1?{x:0,y:72,scale:.86}:rating===2?{x:-140,y:0,scale:1}:rating===3?{x:0,y:-130,scale:1}:{x:130,y:-170,scale:1};
    await cardMotion.start({...exit,opacity:0,transition:{duration:.3,ease:'easeIn'}});
    }catch{/* The durable answer still commits if a visual animation is interrupted. */}
   }
   committed({card:current,reviewId:result.reviewId,rating,confidence,durationMs,
    next:intervals[rating].card,answeredAt:Date.now()});
   try{navigator.vibrate?.(8)}catch{/* not available in every browser */}
   if(!useReviewSession.getState().current)navigate('/review/done');
  }catch(error){
   setStamp(false);void cardMotion.start({opacity:1,x:0,y:0,scale:1,transition:{duration:0}});
   cancelGrade();
   notify((error instanceof Error?error.message:'Could not confirm answer')+'. Current card kept.',
    {tone:'danger',action:{label:'Retry',onClick:()=>{if(navigator.onLine)void grade(rating);else notify('Reconnect before retrying',{tone:'danger'})}}});
  }
 }
 async function undoLast(){
  if(!lastUndo||undo.isPending||submitting)return;
  try{
   await undo.mutateAsync(lastUndo.reviewId);
   undoCommitted();
   notify('Answer undone');
  }catch(error){notify(error instanceof Error?error.message:'Could not undo',{tone:'danger'})}
 }
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||sheetOpen||event.ctrlKey||event.altKey||event.metaKey||
    (event.target instanceof Element&&!!event.target.closest('input, textarea, select, [contenteditable]')))return;
   if(!current || submitting)return;
   // Escape still exits a round when a button or link has focus.
   if(event.key==='Escape'){event.preventDefault();close();return}
   if(isInteractiveShortcutTarget(event.target))return;
   if(!revealed){
    if(event.key==='1'||event.key==='2'||event.key==='3'){
     event.preventDefault();reveal(['sure','unsure','guess'][Number(event.key)-1] as Confidence);
    }else if(event.key===' '||event.key==='Enter'){event.preventDefault();reveal(null)}
   }else{
    const rating=event.key===' '?3:Number(event.key);
    if(rating===1||rating===2||rating===3||rating===4){event.preventDefault();void grade(rating)}
   }
  };
  document.addEventListener('keydown',handler);
  return ()=>document.removeEventListener('keydown',handler);
 },[current,submitting,revealed,sheetOpen,intervals,confidence,startTime]);
 async function leaveNote(){
  if(!current || !note.trim())return;
  try{
   await addComment.mutateAsync({noteNo:current.noteNo,body:note.trim()});
   setDraft(null);setSheetOpen(false);notify('Note saved for your tutor',{tone:'success'});
  }catch(error){notify(error instanceof Error?error.message:'Could not add note',{tone:'danger'})}
 }
 async function suspendCard(){
  if(!current)return;
  try{
   await suspend.mutateAsync({noteNo:current.noteNo,status:'suspended'});
   setSheetOpen(false);
   const state=useReviewSession.getState();
   if(state.queue){
    const next=state.queue;
    const {nextCard}=await import('../../lib/queue');
    const advanced=nextCard(next);
    useReviewSession.setState({
     current:advanced.item,queue:advanced.queue,revealed:false,confidence:null,
     startTime:Date.now(),
     roundOrder:advanced.item&&!state.roundOrder.includes(advanced.item.cardId)
      ?[...state.roundOrder,advanced.item.cardId]:state.roundOrder,
    });
    if(!advanced.item)navigate('/review/done');
   }
   notify('Card suspended',{tone:'success'});
  }catch(error){notify(error instanceof Error?error.message:'Could not suspend',{tone:'danger'})}
 }
 const loadFailure=reviewInitialLoadFailure(settings,apiCards);
 if(loadFailure)return <Screen title="Card review" back="/review">
  <p role="alert" className="text-body text-ink-2">Could not load {loadFailure==='settings'?'review settings':'due cards'}. Your saved answers are unchanged.</p>
  <Button onClick={()=>{void settings.refetch();void apiCards.refetch()}}>Try again</Button>
 </Screen>;
 if(settings.isPending||apiCards.isPending)return <Screen title="Card review" back="/review"><Skeleton h={50}/><Skeleton h={380}/></Screen>;
 if(!current && !queue)return <Screen title="Card review" back="/review"><div className="text-body text-ink-2">Preparing your cards…</div></Screen>;
 if(!current)return <Screen title="Card review" back="/review"><p className="text-ink-2">Nothing due in this selection.</p>
  <Button onClick={()=>navigate(answers.length?'/review/done':'/review')}>Continue</Button></Screen>;
 return <Screen className="gap-3">
  <h1 className="sr-only">Card review</h1>
  <header className="flex items-center gap-2">
   <IconButton icon={X} label="Close review" disabled={submitting} onClick={close}/>
   <div className="min-w-0 flex-1">
    <div role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={Math.max(1,total)} aria-valuenow={settled} className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper-2)]"><div className="h-full rounded-full bg-[var(--ink-2)]" style={{width:(total?settled/total*100:0)+"%"}}/></div>
    <p className="mt-1 text-center text-label tabular-nums text-ink-2">{Math.min(total,settled+1)} of {total}</p>
    <div className="mt-1 flex items-center justify-center gap-1 text-label text-ink-3">
     <span className="font-math italic text-amber">{current.glyph}</span>
     <span className="truncate">{current.projectSlug.replaceAll('-',' ')} · {current.checkpointCode}</span>
    </div>
   </div>
   <IconButton icon={Undo2} label="Undo last answer" disabled={!lastUndo||undo.isPending||submitting} onClick={()=>{void undoLast()}}/>
   <IconButton icon={MessageSquarePlus} label="Note for tutor" onClick={()=>{setSheetActivated(true);setSheetOpen(true)}}/>
  </header>
  <div>
   <motion.div key={current.cardId} initial={firstCard.current?false:reduce?false:{opacity:0,y:34,scale:0.94}} animate={cardMotion}
    exit={{opacity:0,transition:{duration:0}}} transition={{duration:reduce?0:.48}}
    drag={revealed&&!submitting&&current.front.length<500&&current.back.length<500} dragElastic={0.6} dragSnapToOrigin
    dragConstraints={{left:0,right:0,top:0,bottom:0}}
    style={{x:dragX,y:dragY,rotate:rotation,touchAction:'pan-y'}}
    onDragEnd={(_,info)=>{
     if(!revealed||submitting)return;
     if(info.offset.x>110)void grade(3);
     else if(info.offset.x< -110)void grade(1);
     else if(info.offset.y< -110)void grade(4);
    }}>
    <motion.span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 z-10 text-center font-math text-num italic text-amber">{swipeLabel}</motion.span>
    <Suspense fallback={<Skeleton h={208}/>}> 
     <CardFace item={current} revealed={revealed} confidence={confidence} quiet={reduce} stamp={stamp}/>
    </Suspense>
   </motion.div>
  </div>
  <p className="text-center text-caption text-ink-3">{Math.max(0,total-new Set(answers.map(a=>a.card.cardId)).size-1)} after this</p>
  {calibrationNote&&<p role="status" className="text-center font-math text-label italic text-ink-2">{calibrationNote}</p>}
  {!revealed?<section aria-label="Confidence" className="sticky bottom-0 z-20 flex flex-col gap-2 rounded-ctl bg-obsidian pb-[max(6px,env(safe-area-inset-bottom))] pt-2">
   <p className="text-center text-label text-ink-3">How sure are you? Tapping reveals the answer.</p>
   <div className="grid grid-cols-3 gap-2">
    {confidenceOptions.map(({value,label})=><button type="button" key={value}
      onClick={()=>reveal(value)} className={'flex min-h-[var(--ctl)] items-center justify-center gap-2 rounded-btn border border-edge-2 bg-raised px-2 text-label '+(value==='sure'?'text-amber':'text-ink-soft')}>
      <span aria-hidden="true" className={'size-3 rounded-full border border-current '+(value==='sure'?'bg-current':value==='guess'?'border-dashed':'')}/>{label}</button>)}
   </div>
   <button type="button" className="min-h-11 text-label text-ink-3 underline-offset-4 hover:underline" onClick={()=>reveal(null)}>Show answer</button>
  </section>:<section aria-label="Grade answer" className="sticky bottom-0 z-20 grid grid-cols-4 gap-1.5 rounded-ctl bg-obsidian pb-[max(6px,env(safe-area-inset-bottom))] pt-2">
   {gradeNames.map((label,i)=>{
    const rating=(i+1) as Rating;
    return <button key={rating} type="button" disabled={submitting}
     onClick={()=>{void grade(rating)}} aria-label={'Grade '+label}
     className="flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-btn border border-edge-2 bg-raised px-1 disabled:opacity-50">
     <span className="flex items-center gap-1 text-label font-semibold" style={{color:gradeColors[i]}}><span className="size-1.5 rounded-full" style={{background:gradeColors[i]}}/>{label}</span>
     <span className="text-caption tabular-nums text-ink-3">{intervals?.[rating].label??'—'}</span>
    </button>
   })}
  </section>}
  {sheetActivated&&<Suspense fallback={<p role="status" className="text-label text-ink-2">Opening note…</p>}><NoteSheet open={sheetOpen} onClose={()=>setSheetOpen(false)} title="For your tutor">
   <div className="flex flex-col gap-4">
    <label htmlFor="review-note" className="text-body text-ink-2">Ask your tutor to improve or explain this card</label>
    <textarea id="review-note" maxLength={500} rows={4} value={note} onChange={e=>{if(current)setDraft({cardId:current.cardId,value:e.target.value})}}
     className="w-full rounded-ctl border border-edge-2 bg-well p-3 text-body-l text-ink" placeholder="What should the tutor revisit?"/>
    <Button disabled={!note.trim()||addComment.isPending} onClick={()=>{void leaveNote()}} icon={Check}>Save note</Button>
    <Button variant="ghost" onClick={()=>{void suspendCard()}}>Suspend this card</Button>
   </div>
  </NoteSheet></Suspense>}
 </Screen>;
}
