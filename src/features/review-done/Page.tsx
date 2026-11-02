import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {CalendarDays,Clock3,RotateCcw,Target} from 'lucide-react';
import {getApi} from '../../data';
import {useSettings} from '../../data/hooks';
import {summarizeReviewSession} from '../../lib/insights';
import {motion,useReducedMotion} from 'motion/react';
import {useCalm} from '../../ui/useCalm';
import {formatMinutes} from '../../lib/text';
import {useReviewSession} from '../review-run/store';
import {Screen} from '../../ui/Screen';
import {Tile} from '../../ui/Tile';
import {Slab} from '../../ui/Slab';
import {Button} from '../../ui/Button';
import {RoundSeal} from './RoundSeal';
import {prepareSessionNewRound} from './newSession';
import {ReminderOffer} from './ReminderOffer';

function Metric({icon:Icon,label,value}:{icon:typeof Target;label:string;value:string}){
 return <Tile className="flex min-h-[95px] flex-col items-center justify-center gap-1 px-2 py-3 text-center">
  <Icon size={18} aria-hidden="true" className="text-ink-2"/>
  <strong className={"text-card font-semibold tabular-nums "+(value==="–"?"text-ink-4":"text-ink")}>{value}</strong>
  <span className="text-label text-ink-3">{label}</span>
 </Tile>;
}
export default function Page(){
 const reduced=!!useReducedMotion(),calm=useCalm(),quiet=reduced||calm;
 const navigate=useNavigate(),answers=useReviewSession(s=>s.answers),filter=useReviewSession(s=>s.filter);
 const markCompleted=useReviewSession(s=>s.markCompleted);
 useEffect(()=>{if(answers.length>0)markCompleted()},[answers.length,markCompleted]);
 const settings=useSettings(),[tomorrow,setTomorrow]=useState<number|null>(null);
 const [newPending,setNewPending]=useState(false),[newMessage,setNewMessage]=useState<string|null>(null);
 const [showRecalled,setShowRecalled]=useState(false);
 const [showAllMissed,setShowAllMissed]=useState(false);
 const stats=useMemo(()=>summarizeReviewSession(answers.map(a=>({rating:a.rating,confidence:a.confidence,
  durationMs:a.durationMs,stateBefore:a.card.state.state}))),[answers]);
 useEffect(()=>{
  if(!settings.data)return;
  let cancelled=false;
  void getApi().getReviewForecast().then(days=>{
   if(!cancelled)setTomorrow(days[1]?.due??0);
  }).catch(()=>undefined);
  return()=>{cancelled=true};
 },[settings.data]);
 const firstAnswers=useMemo(()=>{
  const seen=new Set<string>();return answers.filter(a=>{
   if(seen.has(a.card.cardId))return false;
   seen.add(a.card.cardId);return true;
  });
 },[answers]);
 const missed=firstAnswers.filter(a=>a.rating===1);
 const sure=firstAnswers.filter(a=>a.confidence==='sure');
 const sureRight=sure.filter(a=>a.rating>1).length;
 const seconds=Math.max(0,Math.floor(stats.durationMs/1000));
 const roundTime=firstAnswers.length?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'–';
 const recalledAnswers=firstAnswers.filter(a=>a.rating>1);
 const recalled=recalledAnswers.length;
 const compact=firstAnswers.length>24;
 const firstRecall=firstAnswers.length?Math.round(100*recalled/firstAnswers.length)+'%':'–';
 function retryMissed(){
  if(!settings.data||!missed.length)return;
  const latest=new Map(answers.map(a=>[a.card.cardId,a]));
  const cards=missed.map(a=>{
   const last=latest.get(a.card.cardId)!;
   return {...a.card,state:{...last.next,due:new Date().toISOString()}};
  });
  useReviewSession.getState().initialize(cards,settings.data,filter);
  navigate('/review/run');
 }
 async function reviewNewFromSession(){
  if(!settings.data||!filter.sessionId||newPending)return;
  setNewPending(true);setNewMessage(null);
  try{
   const started=await prepareSessionNewRound(getApi(),settings.data,filter,useReviewSession.getState().initialize);
   if(!started){setNewMessage('No new cards are due from this session.');return}
   navigate('/review/run?session='+encodeURIComponent(filter.sessionId)+'&new=1');
  }catch{
   setNewMessage('Could not load new cards. Try again.');
  }finally{setNewPending(false)}
 }
 return <Screen className="items-center gap-5">
  <div className="mt-4 flex flex-col items-center text-center">
   {firstAnswers.length>0&&<RoundSeal order={firstAnswers.map(a=>a.card.cardId)} answers={answers}/>}
   <motion.h1 initial={quiet?false:{letterSpacing:'.4em'}} animate={{letterSpacing:'.02em'}} transition={{duration:quiet?0:.7}} className="mt-1 font-[var(--font-display)] text-[44px] italic text-ink">
    <span className="sr-only">Review complete</span><span aria-hidden="true">Q.E.D<span className="text-amber">.</span></span>
   </motion.h1>
   {!firstAnswers.length&&<p className="mt-2 text-body text-ink-3">Review a round to see stats.</p>}
   {firstAnswers.length>0&&<p className="mt-2 text-body-l text-ink-2">{firstAnswers.length} {firstAnswers.length===1?'card':'cards'} reviewed, {missed.length} {missed.length===1?'needed':'needed'} another pass.</p>}
  </div>
  <section aria-label="Review statistics" className="grid w-full grid-cols-2 gap-2">
   <Metric icon={Target} label="recalled on the first try" value={firstRecall}/>
   <Metric icon={Clock3} label="time for the round" value={roundTime}/>
   <Metric icon={RotateCcw} label="right when you were sure" value={sure.length?sureRight+'/'+sure.length:'–'}/>
   <Metric icon={CalendarDays} label="due tomorrow" value={firstAnswers.length&&tomorrow!==null?String(tomorrow):'–'}/>
  </section>
  <ReminderOffer completed={firstAnswers.length>0}/>
  {firstAnswers.length>0&&<section aria-label="Round transcript" className="w-full">
   <h2 className="mb-2 font-math italic text-ink-2">Your round</h2>
   <div className="flex flex-col gap-3">
    {missed.length>0&&<div><p className="mb-2 text-label text-ink-3">{missed.length} missed</p>
     <div className="flex flex-wrap gap-1.5">{missed.slice(0,showAllMissed?undefined:8).map(a=><Link key={a.card.cardId} to={'/cards/'+a.card.noteNo} title={a.card.projectSlug+' · Again'}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-raised px-2 text-label text-ink"
      aria-label={'Missed card N'+a.card.noteNo}>{'N'+a.card.noteNo}</Link>)}</div>
     {missed.length>8&&<button type="button" className="min-h-11 text-label font-semibold text-amber" onClick={()=>setShowAllMissed(v=>!v)}>
      {showAllMissed?'Show first 8':(missed.length-8)+' more missed'}
     </button>}
    </div>}
    {recalled>0&&<div>
     <button type="button" className="min-h-11 text-label font-semibold text-amber" onClick={()=>setShowRecalled(v=>!v)}>
      {recalled} recalled · {compact?(showRecalled?'Hide':'Show cards'):'Full list'}
     </button>
     {(showRecalled||!compact)&&<div className="flex flex-wrap gap-1.5">{recalledAnswers.map(a=><Link key={a.card.cardId}
      title={a.card.projectSlug+' · '+(['','Again','Hard','Good','Easy'][a.rating]??'')} to={'/cards/'+a.card.noteNo} className="flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-raised px-2 text-label text-ink-2">{'N'+a.card.noteNo}</Link>)}</div>}
    </div>}
   </div>
  </section>}
  {missed.length>0&&<Button className="w-full" variant="ghost" onClick={retryMissed}>Go over the {missed.length} missed</Button>}
  <Button className="w-full" size="xl" onClick={()=>{useReviewSession.getState().close();navigate('/')}}>Done</Button>
  <Link className="flex min-h-11 items-center justify-center text-body text-amber" to="/review">
   Review more
  </Link>
  {filter.sessionId&&<div className="flex w-full flex-col items-center gap-2">
   <Button variant="ghost" disabled={newPending||!settings.data} onClick={()=>{void reviewNewFromSession()}}>
    {newPending?'Checking new cards…':'Review new cards from this session'}
   </Button>
   {newMessage&&<p role="status" className="text-center text-label text-ink-2">{newMessage}</p>}
  </div>}
 </Screen>;
}
