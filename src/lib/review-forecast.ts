import {DAY,studyClock} from './calendar'
/** Scheduled cards, without the search cap, note-sibling collapse or today's limits. */
export function reviewForecast(cards:Iterable<{state:number;due:string}>,settings:{timeZone:string;rolloverHour:number},now=Date.now()){
 const clock=studyClock(settings.rolloverHour,settings.timeZone),today=clock.dayIndex(now)
 const days=Array.from({length:7},(_,i)=>({day:new Date((today+i)*DAY).toISOString().slice(0,10),due:0}))
 // Many cards share the same study-day deadline (30,000 cards but only
 // two distinct due timestamps in the extreme fixture). Civil-day conversion
 // uses Intl.formatToParts, so cache the result per exact due timestamp.
 const offsetByDue=new Map<string,number>()
 for(const card of cards){
  if(card.state===0)continue
  let offset=offsetByDue.get(card.due)
  if(offset===undefined){
   const due=Date.parse(card.due)
   offset=Number.isFinite(due)?Math.max(0,clock.dayIndex(due)-today):Infinity
   offsetByDue.set(card.due,offset)
  }
  if(offset<days.length)days[offset].due++
 }
 return days
}
