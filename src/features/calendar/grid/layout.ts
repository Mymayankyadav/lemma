/** N121: owner-time-zone-independent layout using real elapsed minutes.
 * The caller supplies civil-day bounds as UTC instants (dayBounds); this lets
 * 23- and 25-hour DST days map correctly without inventing wall-clock hours. */
export type GridInterval={id:string;start:string;end:string};
export type GridDayRange={start:string;end:string};
export type GridItem={
 id:string;start:string;end:string;lane:number;lanes:number;
 top:number;height:number;startMinute:number;endMinute:number;
 continuesBefore:boolean;continuesAfter:boolean;
};
const MINUTE=60_000;
const valid=(iso:string):number=>{
 const ms=Date.parse(iso);
 if(!Number.isFinite(ms)||!/Z$|[+-]\d\d:\d\d$/.test(iso))
  throw Error('Calendar layout requires absolute instants');
 return ms;
};
export function dayMinutes(range:GridDayRange):number{
 const start=valid(range.start),end=valid(range.end);
 if(end<=start||end-start>26*60*MINUTE)throw Error('Invalid civil-day range');
 return (end-start)/MINUTE;
}
/** Shortest available lane allocation in each connected overlap cluster.
 * Two intervals touching at an endpoint never overlap (half-open intervals).
 * Every cluster gets a uniform lane count, avoiding adjacent widths jumping. */
export function layoutDayIntervals(intervals:readonly GridInterval[],range:GridDayRange,
 pixelsPerHour=64):GridItem[]{
 const first=valid(range.start),last=valid(range.end);
 dayMinutes(range);
 if(!Number.isFinite(pixelsPerHour)||pixelsPerHour<=0)
  throw Error('Invalid grid scale');
 const clipped=intervals.flatMap(event=>{
  const s=valid(event.start),e=valid(event.end);
  if(!event.id||e<=s)throw Error('Invalid calendar interval');
  if(e<=first||s>=last)return [];
  return [{event,at:Math.max(first,s),until:Math.min(last,e)}];
 }).sort((a,b)=>a.at-b.at||a.until-b.until||a.event.id.localeCompare(b.event.id));
 const output:GridItem[]=[];
 const flush=(cluster:typeof clipped)=>{
  if(!cluster.length)return;
  const ends:number[]=[];
  const assigned:{item:typeof clipped[number];lane:number}[]=[];
  for(const item of cluster){
   let lane=ends.findIndex(end=>end<=item.at);
   if(lane===-1){lane=ends.length;ends.push(item.until)}
   else ends[lane]=item.until;
   assigned.push({item,lane});
  }
  for(const {item,lane} of assigned){
   const startMinute=(item.at-first)/MINUTE;
   const endMinute=(item.until-first)/MINUTE;
   output.push({id:item.event.id,start:item.event.start,end:item.event.end,
    lane,lanes:ends.length,startMinute,endMinute,
    top:startMinute*pixelsPerHour/60,
    height:(endMinute-startMinute)*pixelsPerHour/60,
    continuesBefore:valid(item.event.start)<first,
    continuesAfter:valid(item.event.end)>last});
  }
 };
 let cluster:typeof clipped=[],clusterEnd=-Infinity;
 for(const event of clipped){
  if(cluster.length&&event.at>=clusterEnd){flush(cluster);cluster=[];}
  cluster.push(event);
  clusterEnd=Math.max(clusterEnd,event.until);
 }
 flush(cluster);
 return output.sort((a,b)=>a.startMinute-b.startMinute||a.lane-b.lane||a.id.localeCompare(b.id));
}
/** Snap pointer movement to a 15-minute grid. This is an elapsed-time delta,
 * not a wall-clock conversion, so the same motion works through DST changes. */
export function snapDragMinutes(deltaPixels:number,pixelsPerHour=64,increment=15):number{
 if(!Number.isFinite(deltaPixels)||!Number.isFinite(pixelsPerHour)||pixelsPerHour<=0||
  !Number.isSafeInteger(increment)||increment<=0)throw Error('Invalid drag or grid scale');
 return Math.round(deltaPixels*60/pixelsPerHour/increment)*increment;
}
export function moveInterval(start:string,end:string,byMinutes:number):{start:string;end:string}{
 const from=valid(start),to=valid(end);
 if(to<=from||!Number.isSafeInteger(byMinutes))throw Error('Invalid moved interval');
 return {start:new Date(from+byMinutes*MINUTE).toISOString(),
  end:new Date(to+byMinutes*MINUTE).toISOString()};
}
export function resizeInterval(start:string,end:string,byMinutes:number,
 minimumMinutes=15):{start:string;end:string}{
 const from=valid(start),to=valid(end);
 if(to<=from||!Number.isSafeInteger(byMinutes)||
  !Number.isSafeInteger(minimumMinutes)||minimumMinutes<=0)throw Error('Invalid resized interval');
 return {start:new Date(from).toISOString(),
  end:new Date(Math.max(from+minimumMinutes*MINUTE,to+byMinutes*MINUTE)).toISOString()};
}
