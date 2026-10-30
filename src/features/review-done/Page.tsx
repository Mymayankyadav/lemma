import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {CalendarDays,Clock3,RotateCcw,Target} from 'lucide-react';
import {getApi} from '../../data';
import {useSettings} from '../../data/hooks';
import {summarizeReviewSession} from '../../lib/insights';
import {studyDayBounds} from '../../lib/calendar';
import {formatMinutes} from '../../lib/text';
import {useReviewSession} from '../review-run/store';
import {Screen} from '../../ui/Screen';
import {Tile} from '../../ui/Tile';
import {Slab} from '../../ui/Slab';
import {Button} from '../../ui/Button';
import {DoneBurst} from '../../ui/art/DoneBurst';

function Metric({icon:Icon,label,value}:{icon:typeof Target;label:string;value:string}){
 return <Tile className="flex min-h-[95px] flex-col items-center justify-center gap-1 px-2 py-3 text-center">
  <Icon size={18} aria-hidden="true" className="text-amber"/>
  <strong className="text-card font-semibold tabular-nums">{value}</strong>
  <span className="text-label text-ink-3">{label}</span>
 </Tile>;
}
export default function Page(){
 const navigate=useNavigate(),answers=useReviewSession(s=>s.answers),filter=useReviewSession(s=>s.filter);
 const settings=useSettings(),[tomorrow,setTomorrow]=useState<number|null>(null);
 const stats=useMemo(()=>summarizeReviewSession(answers.map(a=>({rating:a.rating,confidence:a.confidence,
  durationMs:a.durationMs,stateBefore:a.card.state.state}))),[answers]);
 useEffect(()=>{
  if(!settings.data)return;
  let cancelled=false;
  const {end}=studyDayBounds(Date.now(),settings.data.timeZone,settings.data.rolloverHour);
  const nextEnd=studyDayBounds(end,settings.data.timeZone,settings.data.rolloverHour).end;
  void getApi().searchCards('').then(notes=>{
   if(cancelled)return;
   // Search returns at most 100 notes; treat results as a lower bound when capped.
   const due=notes.filter(note=>note.status==='active'&&note.due
    &&Date.parse(note.due)>=end&&Date.parse(note.due)<nextEnd).length;
   setTomorrow(due);
  }).catch(()=>undefined);
  return()=>{cancelled=true};
 },[settings.data]);
 const minutes=Math.max(0,Math.ceil(stats.durationMs/60000));
 const recall=stats.recall===null?'—':Math.round(stats.recall*100)+'%';
 const newRemaining=answers.filter(a=>a.card.state.state===0).length>0;
 return <Screen className="items-center gap-5">
  <div className="mt-4 flex flex-col items-center text-center">
   <DoneBurst size={168}/>
   <h1 className="mt-1 text-card font-semibold">Review complete</h1>
   <p className="mt-4 text-num-xl font-semibold leading-none tracking-tight tabular-nums">{stats.count}</p>
   <p className="text-body-l text-ink-2">{stats.count===1?'card reviewed':'cards reviewed'}</p>
  </div>
  <section aria-label="Review statistics" className="grid w-full grid-cols-3 gap-2">
   <Metric icon={Target} label="recalled" value={recall}/>
   <Metric icon={Clock3} label="time" value={formatMinutes(minutes)}/>
   <Metric icon={RotateCcw} label="again" value={String(stats.again)}/>
  </section>
  {stats.sureSummary&&<Slab className="w-full px-4 py-3 text-center text-body text-ink-soft">{stats.sureSummary}</Slab>}
  <div className="flex min-h-12 w-full items-center justify-center gap-2 text-body text-ink-2">
   <CalendarDays size={19} className="text-amber" aria-hidden="true"/>
   {tomorrow===null?'Your next study day is ahead':tomorrow===0?'Nothing scheduled for tomorrow':
    tomorrow+' due tomorrow'+(tomorrow>=100?' (at least)':'')}
  </div>
  <Button className="w-full" size="xl" onClick={()=>{useReviewSession.getState().close();navigate('/')}}>Done</Button>
  <Link className="flex min-h-11 items-center justify-center text-body text-amber" to="/review">
   Review more
  </Link>
  {newRemaining&&filter.sessionId&&<Link to={'/review/run?session='+encodeURIComponent(filter.sessionId)+'&new=1'}
   className="flex min-h-11 items-center justify-center text-label text-ink-2">Review new cards from this session</Link>}
 </Screen>;
}
