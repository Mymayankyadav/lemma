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

function Metric({icon:Icon,label,value}:{icon:typeof Target;label:string;value:string}){
 return <Tile className="flex min-h-[95px] flex-col items-center justify-center gap-1 px-2 py-3 text-center">
  <Icon size={18} aria-hidden="true" className="text-amber"/>
  <strong className="text-card font-semibold tabular-nums">{value}</strong>
  <span className="text-label text-ink-3">{label}</span>
 </Tile>;
}
export default function Page(){
 const reduced=!!useReducedMotion(),calm=useCalm(),quiet=reduced||calm;
 const navigate=useNavigate(),answers=useReviewSession(s=>s.answers),filter=useReviewSession(s=>s.filter);
 const settings=useSettings(),[tomorrow,setTomorrow]=useState<number|null>(null);
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
 const roundTime=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 const recalled=firstAnswers.filter(a=>a.rating>1).length;
 const firstRecall=firstAnswers.length?Math.round(100*recalled/firstAnswers.length)+'%':'—';
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
 const newRemaining=answers.filter(a=>a.card.state.state===0).length>0;
 return <Screen className="items-center gap-5">
  <div className="mt-4 flex flex-col items-center text-center">
   <RoundSeal order={firstAnswers.map(a=>a.card.cardId)} answers={answers}/>
   <motion.h1 initial={quiet?false:{letterSpacing:'.4em'}} animate={{letterSpacing:'.02em'}} transition={{duration:quiet?0:.7}} className="mt-1 font-[var(--font-display)] text-[44px] italic text-ink">
    <span className="sr-only">Review complete</span><span aria-hidden="true"><span className="text-amber">Q</span>.E.D.</span>
   </motion.h1>
   <p className="mt-2 text-body-l text-ink-2">{firstAnswers.length} {firstAnswers.length===1?'card':'cards'} reviewed, {missed.length} {missed.length===1?'needed':'needed'} another pass.</p>
  </div>
  <section aria-label="Review statistics" className="grid w-full grid-cols-2 gap-2">
   <Metric icon={Target} label="recalled on the first try" value={firstRecall}/>
   <Metric icon={Clock3} label="time for the round" value={roundTime}/>
   <Metric icon={RotateCcw} label="right when you were sure" value={sure.length?sureRight+'/'+sure.length:'—'}/>
   <Metric icon={CalendarDays} label="due tomorrow" value={tomorrow===null?'—':String(tomorrow)}/>
  </section>
  <section aria-label="Round transcript" className="w-full">
   <h2 className="mb-2 font-math italic text-ink-2">Your round</h2>
   <div className="flex flex-wrap gap-1.5">{firstAnswers.map(a=><span key={a.card.cardId}
    title={a.card.projectSlug+' · '+(['','Again','Hard','Good','Easy'][a.rating]??'')}
    aria-label={a.card.projectSlug+' '+(['','Again','Hard','Good','Easy'][a.rating]??'')}
    className="size-4 rounded-[2px] border border-edge"
    style={{background:a.rating===1?'var(--bad)':a.rating===2?'var(--warn)':a.rating===3?'var(--accent)':'var(--good)'}}/>)}</div>
  </section>
  {stats.sureSummary&&<Slab className="w-full px-4 py-3 text-center text-body text-ink-soft">{stats.sureSummary}</Slab>}
  {missed.length>0&&<Button className="w-full" variant="ghost" onClick={retryMissed}>Go over the {missed.length} missed</Button>}
  <Button className="w-full" size="xl" onClick={()=>{useReviewSession.getState().close();navigate('/')}}>Done</Button>
  <Link className="flex min-h-11 items-center justify-center text-body text-amber" to="/review">
   Review more
  </Link>
  {newRemaining&&filter.sessionId&&<Link to={'/review/run?session='+encodeURIComponent(filter.sessionId)+'&new=1'}
   className="flex min-h-11 items-center justify-center text-label text-ink-2">Review new cards from this session</Link>}
 </Screen>;
}
