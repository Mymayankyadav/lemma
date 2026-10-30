import {DAY,studyClock} from './calendar'
/** Scheduled cards, without the search cap, note-sibling collapse or today's limits. */
export function reviewForecast(cards:readonly {state:number;due:string}[],settings:{timeZone:string;rolloverHour:number},now=Date.now()){
 const clock=studyClock(settings.rolloverHour,settings.timeZone),today=clock.dayIndex(now)
 const days=Array.from({length:7},(_,i)=>({day:new Date((today+i)*DAY).toISOString().slice(0,10),due:0}))
 for(const card of cards){
  const due=Date.parse(card.due)
  if(card.state===0||!Number.isFinite(due))continue
  const offset=Math.max(0,clock.dayIndex(due)-today)
  if(offset<days.length)days[offset].due++
 }
 return days
}
