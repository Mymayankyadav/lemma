import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,BookOpen,CircleCheck,CircleDashed,CircleHelp,MessageSquarePlus,Undo2,X,Check,Clock3} from 'lucide-react';
import {useAddComment,useRecordReview,useReviewItems,useSettings,useSetNoteStatus,useUndoReview,useSessions} from '../../data/hooks';
import type {Confidence,QueueFilter,Rating,ReviewItem} from '../../data/types';
import {preview,scheduleConfig} from '../../lib/fsrs';
import {useReviewSession} from './store';
import {Screen} from '../../ui/Screen';
import {IconButton} from '../../ui/IconButton';
import {Button} from '../../ui/Button';
import {MathText} from '../../ui/MathText';
import {Card} from '../../ui/Card';
import {Glyph} from '../../ui/Glyph';
import {Chip} from '../../ui/Chip';
import {Sheet} from '../../ui/Sheet';
import {Skeleton} from '../../ui/Skeleton';
import {useToast} from '../../ui/Toast';

const fallback:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const gradeNames=['Again','Hard','Good','Easy'] as const;
const dots=['bg-again','bg-hard','bg-good','bg-easy'] as const;
const confidenceOptions=[
 {value:'sure' as const,label:'Sure',icon:CircleCheck},
 {value:'unsure' as const,label:'Unsure',icon:CircleDashed},
 {value:'guess' as const,label:'Guess',icon:CircleHelp},
];
function CardFace({item,revealed,confidence}:{item:ReviewItem;revealed:boolean;confidence:Confidence}){
 const front=item.type==='reverse'&&item.ord===2?item.back:item.front;
 const back=item.type==='reverse'&&item.ord===2?item.front:item.back;
 return <Card stack className="flex min-h-[370px] flex-col gap-6 px-6 py-7">
  <div className="flex items-center justify-between gap-2">
   <Chip tone="quiet" size={28}>{item.kind.charAt(0).toUpperCase()+item.kind.slice(1)}</Chip>
   {revealed&&confidence&&<Chip tone={confidence==='sure'?'amber':'quiet'} size={28}>{confidence}</Chip>}
  </div>
  <MathText source={front} variant="card" cloze={item.type==='cloze'?{ord:item.ord,revealed}:undefined}/>
  {revealed&&<motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.35}} className="mt-auto">
   <div className="mb-5 flex items-center gap-2 text-amber"><span className="h-px flex-1 bg-amber-line"/>
    <span aria-hidden="true" className="size-2 rotate-45 bg-amber"/><span className="h-px flex-1 bg-amber-line"/></div>
   {back?<MathText source={back} variant="answer"/>:item.type==='cloze'?<MathText source={front} variant="answer" cloze={{ord:item.ord,revealed:true}}/>:
    <p className="font-math text-[18px] text-ink-2">See the highlighted answer above.</p>}
  </motion.div>}
  <div className="mt-auto flex flex-wrap gap-2 text-ink-3">
   {item.sourceShort&&<Chip tone="quiet" icon={BookOpen}>{item.sourceShort}{item.pageLabel?' p. '+item.pageLabel:''}</Chip>}
   {item.sessionNumber&&<Chip tone="quiet" icon={Clock3}>{'S'+item.sessionNumber}</Chip>}
  </div>
 </Card>;
}

export default function Page(){
 const navigate=useNavigate(),[search]=useSearchParams(),notify=useToast(),reduce=!!useReducedMotion();
 const settings=useSettings(),sessions=useSessions(),mutate=useRecordReview(),undo=useUndoReview();
 const addComment=useAddComment(),suspend=useSetNoteStatus();
 const current=useReviewSession(s=>s.current),queue=useReviewSession(s=>s.queue);
 const revealed=useReviewSession(s=>s.revealed),confidence=useReviewSession(s=>s.confidence);
 const submitting=useReviewSession(s=>s.submitting),answers=useReviewSession(s=>s.answers);
 const lastUndo=useReviewSession(s=>s.lastUndo),total=useReviewSession(s=>s.total),startTime=useReviewSession(s=>s.startTime);
 const reveal=useReviewSession(s=>s.reveal),beginGrade=useReviewSession(s=>s.beginGrade);
 const cancelGrade=useReviewSession(s=>s.cancelGrade),committed=useReviewSession(s=>s.committed);
 const undoCommitted=useReviewSession(s=>s.undoCommitted);
 const [sheetOpen,setSheetOpen]=useState(false);
 // An unsaved note belongs to its review card, never to the next card dealt.
 const [draft,setDraft]=useState<{cardId:string;value:string}|null>(null);
 const note=draft?.cardId===current?.cardId?draft.value:'';
 const previousCardId=useRef<string|null>(null);
 useEffect(()=>{
  const cardId=current?.cardId??null;
  if(previousCardId.current===cardId)return;
  previousCardId.current=cardId;
  setDraft(null);
  setSheetOpen(false);
 },[current?.cardId]);
 const init=useRef(false);
 const sessionId=search.get('session'),conceptSlug=search.get('concept'),onlyNew=search.get('new')==='1';
 const filter=useMemo<QueueFilter>(()=>({...fallback,sessionId,conceptSlug,newOnly:onlyNew}),[sessionId,conceptSlug,onlyNew]);
 const apiCards=useReviewItems(filter);
 useEffect(()=>{
  if(init.current||!settings.data||!apiCards.data)return;
  init.current=true;
  if(useReviewSession.getState().queue)return;
  useReviewSession.getState().initialize(apiCards.data,settings.data,filter);
 },[settings.data,apiCards.data,filter]);
 const intervals=useMemo(()=>{
  if(!settings.data||!current)return null;
  try{return preview(current.state,Date.now(),scheduleConfig(settings.data))}
  catch{return null}
 },[settings.data,current]);
 function close(){
  if(answers.length)navigate('/review/done');
  else {useReviewSession.getState().close();navigate('/review')}
 }
 async function grade(rating:Rating){
  if(!current||!revealed||!intervals||submitting)return;
  const durationMs=Math.max(0,Math.min(600000,Date.now()-startTime));
  beginGrade();
  try{
   const result=await mutate.mutateAsync({cardId:current.cardId,rating,confidence,durationMs,
    next:intervals[rating].card});
   committed({card:current,reviewId:result.reviewId,rating,confidence,durationMs,
    next:intervals[rating].card,answeredAt:Date.now()});
   try{navigator.vibrate?.(8)}catch{/* not available in every browser */}
   if(!useReviewSession.getState().current)navigate('/review/done');
  }catch(error){
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
   if(sheetOpen||event.ctrlKey||event.altKey||event.metaKey||
    event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
   if(!current || submitting)return;
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
    useReviewSession.setState({current:advanced.item,queue:advanced.queue,revealed:false,confidence:null});
    if(!advanced.item)navigate('/review/done');
   }
   notify('Card suspended',{tone:'success'});
  }catch(error){notify(error instanceof Error?error.message:'Could not suspend',{tone:'danger'})}
 }
 if(settings.isPending||apiCards.isPending)return <Screen title="Card review" back="/review"><Skeleton h={50}/><Skeleton h={380}/></Screen>;
 if(!current && !queue)return <Screen title="Card review" back="/review"><div className="text-[14px] text-ink-2">Preparing your cards…</div></Screen>;
 if(!current)return <Screen title="Card review" back="/review"><p className="text-ink-2">Nothing due in this selection.</p>
  <Button onClick={()=>navigate(answers.length?'/review/done':'/review')}>Continue</Button></Screen>;
 const progress=Math.max(1,answers.length+1),progressWidth=Math.min(100,100*answers.length/Math.max(1,total));
 return <Screen className="gap-6">
  <h1 className="sr-only">Card review</h1>
  <header className="flex items-center gap-2">
   <IconButton icon={X} label="Close review" onClick={close}/>
   <div className="min-w-0 flex-1">
    <div className="flex items-center justify-between gap-1 text-[12px] text-ink-3">
     <span className="flex min-w-0 items-center gap-1 truncate"><span className="font-math italic text-amber">{current.glyph}</span>
      {current.checkpointTitle??current.projectSlug}</span>
     <span className="shrink-0 tabular-nums">{progress} / {Math.max(total,progress)}</span>
    </div>
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-fill-2">
     <motion.div className="h-1 rounded-full bg-amber shadow-[0_0_10px_var(--amber)]"
      animate={{width:progressWidth+'%'}} transition={{duration:reduce?0.15:0.4}}/>
    </div>
   </div>
   <IconButton icon={Undo2} label="Undo last answer" disabled={!lastUndo||undo.isPending||submitting} onClick={()=>{void undoLast()}}/>
   <IconButton icon={MessageSquarePlus} label="Note for tutor" onClick={()=>setSheetOpen(true)}/>
  </header>
  <AnimatePresence mode="wait" initial={false}>
   <motion.div key={current.cardId} initial={{opacity:0,y:reduce?0:34,scale:reduce?1:0.94}} animate={{opacity:1,y:0,scale:1}}
    exit={{opacity:0,y:-12}} transition={{duration:reduce?0.15:0.42}}>
    <CardFace item={current} revealed={revealed} confidence={confidence}/>
   </motion.div>
  </AnimatePresence>
  {!revealed?<section aria-label="Confidence" className="flex flex-col gap-3">
   <p className="text-center text-[13px] text-ink-3">How sure? Tap to reveal</p>
   <div className="grid grid-cols-3 gap-2">
    {confidenceOptions.map(({value,label,icon:Icon})=><button type="button" key={value}
      onClick={()=>reveal(value)} className={'flex min-h-[60px] items-center justify-center gap-2 rounded-btn border border-edge-2 bg-raised px-2 text-[13px] '+(value==='sure'?'text-amber':'text-ink-soft')}>
      <Icon size={18} aria-hidden="true"/>{label}</button>)}
   </div>
   <button type="button" className="min-h-11 text-[13px] text-ink-3 underline-offset-4 hover:underline" onClick={()=>reveal(null)}>Show answer</button>
  </section>:<section aria-label="Grade answer" className="grid grid-cols-2 gap-3">
   {gradeNames.map((label,i)=>{
    const rating=(i+1) as Rating;
    return <button key={rating} type="button" disabled={submitting}
     onClick={()=>{void grade(rating)}} aria-label={'Grade '+label}
     className={'flex min-h-[60px] items-center justify-between rounded-btn border px-5 disabled:opacity-50 '+
      (rating===3&&confidence==='sure'?'border-amber-line-2 bg-amber-tint':'border-edge-2 bg-raised')}>
     <span className="flex items-center gap-2 text-[15px] font-semibold"><span className={'size-2 rounded-full '+dots[i]}/>{label}</span>
     <span className="text-[13px] text-ink-3">{intervals?.[rating].label??'—'}</span>
    </button>
   })}
  </section>}
  <Sheet open={sheetOpen} onClose={()=>setSheetOpen(false)} title="For your tutor">
   <div className="flex flex-col gap-4">
    <label htmlFor="review-note" className="text-[14px] text-ink-2">Ask your tutor to improve or explain this card</label>
    <textarea id="review-note" maxLength={500} rows={4} value={note} onChange={e=>{if(current)setDraft({cardId:current.cardId,value:e.target.value})}}
     className="w-full rounded-ctl border border-edge-2 bg-well p-3 text-[15px] text-ink" placeholder="What should the tutor revisit?"/>
    <Button disabled={!note.trim()||addComment.isPending} onClick={()=>{void leaveNote()}} icon={Check}>Save note</Button>
    <Button variant="ghost" onClick={()=>{void suspendCard()}}>Suspend this card</Button>
   </div>
  </Sheet>
 </Screen>;
}
