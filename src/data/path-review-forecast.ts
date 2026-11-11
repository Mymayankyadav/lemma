import {DAY,studyClock} from '../lib/calendar';

export interface PathReviewForecastDay {
 day:string;
 due:number;
 paths:{slug:string;subject:string;due:number}[];
}

/** Review-only fourteen-day read. Counts every scheduled sibling, before quotas,
 * on the owner's civil study calendar; overdue cards belong to today. */
export function pathForecast(settings:{timeZone:string;rolloverHour:number},now=Date.now()){
 const clock=studyClock(settings.rolloverHour,settings.timeZone),today=clock.dayIndex(now);
 const days:PathReviewForecastDay[]=Array.from({length:14},(_,i)=>({day:new Date((today+i)*DAY).toISOString().slice(0,10),due:0,paths:[]}));
 const buckets=days.map(()=>new Map<string,{slug:string;subject:string;due:number}>());
 const offsets=new Map<string,number>();
 return {
  end:new Date(clock.dayStart(today+14)).toISOString(),
  add(card:{state:number;due:string},path:{slug:string;subject:string}){
   if(card.state<=0)return;
   let offset=offsets.get(card.due);
   if(offset===undefined){
    const at=Date.parse(card.due);
    offset=Number.isFinite(at)?Math.max(0,clock.dayIndex(at)-today):Infinity;
    offsets.set(card.due,offset);
   }
   if(offset>=days.length)return;
   const bucket=buckets[offset],row=bucket.get(path.slug)??{...path,due:0};
   row.due++;bucket.set(path.slug,row);days[offset].due++;
  },
  result(){
   return days.map((day,i)=>({...day,paths:[...buckets[i].values()].map(path=>({...path})).sort((a,b)=>a.slug.localeCompare(b.slug))}));
  },
 };
}
