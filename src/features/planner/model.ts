// N67: deterministic, side-effect-free placement previews for the v6 planner.
// All instants are UTC ISO; date boundaries and windows belong to the owner's
// IANA time zone. This module never writes a block or claims a server commit.
import type {TaskDue,TaskPriority,TaskStatus} from '../../data/tasks/contract';
import type {CalendarBlockKind,CalendarBlockStatus,StudyEntryStatus,
 StudyIntervalKind} from '../../data/study/contract';

export interface PlanningSettings {
 window_start:string;window_end:string;gap_minutes:number;
 max_consecutive_minutes:number;daily_minimum_minutes:number;daily_intention:boolean;
}
/** Mirrors the deployed settings.planning JSON default until N39 UI ships. */
export const DEFAULT_PLANNING:Readonly<PlanningSettings>=Object.freeze({
 window_start:'08:00',window_end:'22:00',gap_minutes:10,
 max_consecutive_minutes:120,daily_minimum_minutes:20,daily_intention:true,
});

export interface PlannerTask {
 id:string;priority:TaskPriority;due:TaskDue;estimateMinutes:number|null;
 status?:TaskStatus;
 /** False by default: splitting is never silently inferred. */
 allowSplit?:boolean;
}
export interface PlannerBlock {
 id:string;startsAt:string;endsAt:string;kind:CalendarBlockKind;
 status:CalendarBlockStatus;
}
export interface PlannerSavedEntry {
 id:string;status:StudyEntryStatus;
 intervals:readonly {kind:StudyIntervalKind;start:string;end:string|null}[];
}
export interface PlannerInput {
 from:string;through:string;timeZone:string;
 /** Absolute time bound: ignore elapsed time without changing existing callers. */
 now?:string;
 tasks:readonly PlannerTask[];
 blocks?:readonly PlannerBlock[];
 savedEntries?:readonly PlannerSavedEntry[];
 /** Undefined uses documented defaults. Null explicitly means unknown. */
 planning?:Partial<PlanningSettings>|null;
 /** Null means this day's availability is unknown, not zero. */
 dayWindows?:Readonly<Record<string,{start:string;end:string}|null>>;
}
export interface PlannerPlacement {
 taskId:string;date:string;start:string;end:string;
 minutes:number;part:number;
}
export type UnplacedReason='no_capacity'|'after_due'|'too_long'|'no_estimate';
export type PlannerSuggestion='make_smaller_step'|'move_to_next_free_day'|
 'plan_next_step'|'set_availability';
export interface PlannerUnplaced {
 taskId:string;estimateMinutes:number|null;reason:UnplacedReason;
 availabilityKnown:boolean;suggestion:PlannerSuggestion;
}
export interface PlannerDay {
 date:string;windowStart:string|null;windowEnd:string|null;
 /** Null denotes unknown availability; never represent it as zero. */
 windowMinutes:number|null;capacityMinutes:number|null;
 occupiedMinutes:number;remainingMinutes:number|null;
 placedMinutes:number;overloaded:boolean;empty:boolean;
 suggestions:PlannerSuggestion[];
}
export interface PlannerResult {
 placements:PlannerPlacement[];days:PlannerDay[];
 unplaced:PlannerUnplaced[];placedTaskIds:string[];
}
type Span=[number,number];
type Candidate=PlannerTask & {deadline:number};
type DayState={day:PlannerDay;free:Span[];start:number;end:number};

const MINUTE=60_000;
const clockRe=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const instantRe=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const fail=(message:string):never=>{throw new Error('Planner: '+message)};
const whole=(v:unknown,min:number,max:number):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const lexical=(a:string,b:string):number=>a<b?-1:a>b?1:0;

function civil(date:string):string{
 if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date)||
  date.startsWith('0000'))return fail('Expected a YYYY-MM-DD civil date');
 const epoch=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==date)
  return fail('Invalid civil date');
 return date;
}
function addDay(date:string,delta:number):string{
 const t=Date.parse(civil(date)+'T00:00:00Z')+delta*86_400_000;
 return new Date(t).toISOString().slice(0,10);
}
function instant(value:string):number{
 if(typeof value!=='string'||!instantRe.test(value))return fail('Expected an absolute ISO instant');
 // Date.parse normalizes invalid days; enforce real civil dates independently.
 civil(value.slice(0,10));
 const epoch=Date.parse(value);
 if(!Number.isFinite(epoch))return fail('Invalid ISO instant');
 const offset=value.endsWith('Z')?0:(()=>{
  const s=value.slice(-6),hour=Number(s.slice(1,3)),minute=Number(s.slice(4));
  if(hour>14||(hour===14&&minute!==0))return fail('Invalid instant offset');
  return (s[0]==='-'?-1:1)*(hour*60+minute);
 })();
 // Verify the supplied wall date/time exists, even when its offset is explicit.
 const local=new Date(epoch+offset*MINUTE).toISOString();
 if(local.slice(0,19)!==value.slice(0,19))
  return fail('Invalid instant wall calendar date');
 return epoch;
}
function config(input:PlannerInput['planning']):PlanningSettings|null{
 if(input===null)return null;
 if(input!==undefined&&(typeof input!=='object'||Array.isArray(input)))
  return fail('Invalid planning settings object');
 // Optional settings often come from partial forms; an explicitly undefined
 // field is absent, not an instruction to erase the durable SQL default.
 const extra=Object.fromEntries(Object.entries(input??{})
  .filter(([,value])=>value!==undefined));
 const p:PlanningSettings={...DEFAULT_PLANNING,...extra};
 if(!clockRe.test(p.window_start)||!clockRe.test(p.window_end))
  return fail('Planning window must use HH:mm');
 if(!whole(p.gap_minutes,0,120)||!whole(p.max_consecutive_minutes,15,600)||
  !whole(p.daily_minimum_minutes,0,600)||typeof p.daily_intention!=='boolean')
  return fail('Invalid planning settings');
 return p;
}
function formatter(zone:string):Intl.DateTimeFormat{
 try{
  return new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',
   month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 }catch{return fail('Unknown IANA time zone')}
}
function wall(ms:number,fmt:Intl.DateTimeFormat):string{
 const parts=fmt.formatToParts(new Date(ms));
 const part=(t:string)=>parts.find(x=>x.type===t)?.value??'';
 return part('year')+'-'+part('month')+'-'+part('day')+'T'+
  part('hour')+':'+part('minute');
}
function possibleWall(naive:number,fmt:Intl.DateTimeFormat):number[]{
 const offsets=new Set<number>();
 // Probe both sides of any modern DST transition; offsets, not the host's
 // local timezone, determine exact solutions to the wall-clock equation.
 for(let hours=-36;hours<=36;hours+=6){
  const at=naive+hours*3_600_000;
  const w=wall(at,fmt);
  const asUtc=Date.parse(w+':00Z');
  offsets.add(Math.round((asUtc-at)/MINUTE));
 }
 const expected=new Date(naive).toISOString().slice(0,16);
 const found:number[]=[];
 for(const offset of offsets){
  const candidate=naive-offset*MINUTE;
  if(wall(candidate,fmt)===expected)found.push(candidate);
 }
 return [...new Set(found)].sort((a,b)=>a-b);
}
/** Spring gaps advance to the first real minute; autumn folds include both. */
function localInstant(date:string,clock:string,fmt:Intl.DateTimeFormat,
 edge:'start'|'end'):number{
 const naive=Date.parse(civil(date)+'T'+clock+':00Z');
 for(let step=0;step<=180;step++){
  const candidates=possibleWall(naive+step*MINUTE,fmt);
  if(candidates.length)
   return edge==='start'?candidates[0]:candidates[candidates.length-1];
 }
 return fail('Cannot resolve wall-clock time');
}
function union(spans:Span[]):Span[]{
 const sorted=spans.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const out:Span[]=[];
 for(const [a,b] of sorted){
  const last=out[out.length-1];
  if(last&&a<=last[1])last[1]=Math.max(last[1],b);
  else out.push([a,b]);
 }
 return out;
}
function subtract(window:Span,occupied:Span[]):Span[]{
 let cur=window[0];const free:Span[]=[];
 for(const [a,b] of union(occupied)){
  if(b<=cur||a>=window[1])continue;
  if(a>cur)free.push([cur,Math.min(a,window[1])]);
  cur=Math.min(window[1],Math.max(cur,b));
 }
 if(cur<window[1])free.push([cur,window[1]]);
 return free;
}
const spanMinutes=(spans:readonly Span[]):number=>
 Math.floor(spans.reduce((sum,[a,b])=>sum+(b-a),0)/MINUTE);
const ceilMinute=(v:number):number=>Math.ceil(v/MINUTE)*MINUTE;
const floorMinute=(v:number):number=>Math.floor(v/MINUTE)*MINUTE;
function occupancy(input:PlannerInput):Span[]{
 const spans:Span[]=[];
 for(const b of input.blocks??[]){
  if(b.status==='cancelled')continue;
  if(!['study','busy'].includes(b.kind)||!['planned','done'].includes(b.status))
   fail('Invalid calendar block');
  const start=instant(b.startsAt),end=instant(b.endsAt);
  if(end<=start)fail('Invalid block interval');
  spans.push([start,end]);
 }
 const seen=new Set<string>();
 for(const entry of input.savedEntries??[]){
  if(entry.status!=='saved')continue;
  if(seen.has(entry.id))continue;
  seen.add(entry.id);
  for(const interval of entry.intervals){
   if(interval.kind==='break')continue;
   if(interval.kind!=='focus'||interval.end===null)
    return fail('Invalid saved focus interval');
   const start=instant(interval.start),end=instant(interval.end);
   if(end<=start)fail('Invalid saved focus interval');
   spans.push([start,end]);
  }
 }
 return union(spans);
}
function deadline(task:PlannerTask,fmt:Intl.DateTimeFormat):number{
 if(task.due.kind==='none')return Infinity;
 if(task.due.kind==='instant')return instant(task.due.at);
 if(task.due.kind==='date')return localInstant(addDay(civil(task.due.date),1),
  '00:00',fmt,'start');
 return fail('Invalid due kind');
}
function sortTasks(tasks:readonly PlannerTask[],fmt:Intl.DateTimeFormat):Candidate[]{
 if(tasks.length>500)fail('Too many selected tasks');
 const priorities:Record<TaskPriority,number>={high:0,normal:1,low:2};
 const seen=new Set<string>();
 const rows:Candidate[]=[];
 for(const task of tasks){
  if(!task||typeof task.id!=='string'||!task.id.trim()||seen.has(task.id))
   fail('Tasks need unique nonempty IDs');
  seen.add(task.id);
  if(task.status==='completed'||task.status==='cancelled')continue;
  if(!['high','normal','low'].includes(task.priority)||
   (task.allowSplit!==undefined&&typeof task.allowSplit!=='boolean')||
   (task.estimateMinutes!==null&&!whole(task.estimateMinutes,1,100000)))
   fail('Invalid selected task');
  rows.push({...task,deadline:deadline(task,fmt)});
 }
 return rows.sort((a,b)=>priorities[a.priority]-priorities[b.priority]||
  a.deadline-b.deadline||lexical(a.id,b.id));
}
function makeDays(input:PlannerInput,fmt:Intl.DateTimeFormat,p:PlanningSettings|null,
 busy:Span[]):DayState[]{
 const from=civil(input.from),through=civil(input.through);
 const now=input.now===undefined?null:instant(input.now);
 if(from>through)fail('Reverse date range');
 const endDate=addDay(from,30);
 if(through>endDate)fail('Planner range exceeds 31 civil days');
 const days:DayState[]=[];
 for(let date=from;date<=through;date=addDay(date,1)){
  const override=input.dayWindows?.[date];
  if(override===null||p===null){
   days.push({start:0,end:0,free:[],day:{
    date,windowStart:null,windowEnd:null,windowMinutes:null,
    capacityMinutes:null,occupiedMinutes:0,remainingMinutes:null,
    placedMinutes:0,overloaded:false,empty:true,
    suggestions:['set_availability'],
   }});
   continue;
  }
  const startClock=override?.start??p.window_start;
  const endClock=override?.end??p.window_end;
  if(!clockRe.test(startClock)||!clockRe.test(endClock))
   fail('Invalid day window');
  const earliest=localInstant(date,startClock,fmt,'start');
  const end=localInstant(endClock<=startClock?addDay(date,1):date,
   endClock,fmt,'end');
  if(end<=earliest||end-earliest>26*3_600_000)fail('Invalid planning day window');
  // DST-safe: compute elapsed time in absolute milliseconds, rounded up to 5 minutes.
  // Past dates have zero remaining capacity, not an invalid-range error.
  const start=now===null?earliest:Math.min(end,Math.max(earliest,
   Math.ceil(now/(5*MINUTE))*5*MINUTE));
  const bounded=busy.map(([a,b]):Span=>[Math.max(start,a),Math.min(end,b)])
   .filter(([a,b])=>b>a);
  const gap=p.gap_minutes*MINUTE;
  const padded=bounded.map(([a,b]):Span=>[
   Math.max(start,a-gap),Math.min(end,b+gap)]);
  const free=subtract([start,end],padded).map(([a,b]):Span=>[
   ceilMinute(a),floorMinute(b)]).filter(([a,b])=>b>a);
  const rawOccupied=spanMinutes(union(bounded));
  const usable=spanMinutes(free);
  days.push({start,end,free,day:{
   date,windowStart:new Date(start).toISOString(),
   windowEnd:new Date(end).toISOString(),
   windowMinutes:Math.floor((end-start)/MINUTE),
   capacityMinutes:usable,remainingMinutes:usable,
   occupiedMinutes:rawOccupied,placedMinutes:0,
   overloaded:usable===0,empty:rawOccupied===0,suggestions:[],
  }});
 }
 return days;
}
function allocate(slot:Span,minutes:number,gap:number):Span|null{
 const next=slot[0]+(minutes+gap)*MINUTE;
 if(next>=slot[1])return null;
 return [next,slot[1]];
}
function schedule(task:Candidate,states:DayState[],settings:PlanningSettings):PlannerPlacement[]|null{
 const estimate=task.estimateMinutes;
 if(estimate===null)return null;
 // Stage all changes: an impossible task must not reserve fragments.
 const copies=states.map(s=>s.free.map(([a,b]):Span=>[a,b]));
 const staged:PlannerPlacement[]=[];
 let remaining=estimate;
 const perPlacementLimit=settings.max_consecutive_minutes;
 for(let i=0;i<states.length&&remaining>0;i++){
  const state=states[i],slots=copies[i];
  for(let j=0;j<slots.length&&remaining>0;j++){
   const [a,b]=slots[j];
   const possible=Math.floor((Math.min(b,task.deadline)-a)/MINUTE);
   if(possible<=0)continue;
   const chunk=task.allowSplit
    ?Math.min(remaining,perPlacementLimit,possible)
    :(remaining<=perPlacementLimit&&remaining<=possible?remaining:0);
   if(chunk<=0)continue;
   const end=a+chunk*MINUTE;
   staged.push({taskId:task.id,date:state.day.date,start:new Date(a).toISOString(),
    end:new Date(end).toISOString(),minutes:chunk,part:staged.length+1});
   remaining-=chunk;
   const rest=allocate([a,b],chunk,settings.gap_minutes);
   if(rest){
    slots[j]=rest;
    // A long splittable task may need several bounded work segments in the
    // SAME free interval, with a real gap between them. Revisit its tail.
    if(task.allowSplit)j--;
   }else slots.splice(j--,1);
   // A non-splittable task can occupy only one continuous slot.
   if(!task.allowSplit)break;
  }
 }
 if(remaining>0)return null;
 states.forEach((s,i)=>{s.free=copies[i]});
 return staged;
}
function suggestion(reason:UnplacedReason):PlannerSuggestion{
 return reason==='no_estimate'||reason==='too_long'
  ?'make_smaller_step':'move_to_next_free_day';
}
export function planTaskPlacements(input:PlannerInput):PlannerResult{
 if(!input||typeof input!=='object'||!Array.isArray(input.tasks))
  return fail('Invalid planner input');
 const fmt=formatter(input.timeZone);
 const planning=config(input.planning);
 const busy=occupancy(input);
 const states=makeDays(input,fmt,planning,busy);
 const ordered=sortTasks(input.tasks,fmt);
 const placements:PlannerPlacement[]=[],unplaced:PlannerUnplaced[]=[];
 const placedTaskIds:string[]=[];
 for(const task of ordered){
  const known=states.some(s=>s.day.capacityMinutes!==null);
  const exceedsConsecutive=task.estimateMinutes!==null&&planning!==null&&
   task.estimateMinutes>planning.max_consecutive_minutes&&!task.allowSplit;
  let reason:UnplacedReason='no_capacity';
  if(task.estimateMinutes===null)reason='no_estimate';
  else if(exceedsConsecutive)reason='too_long';
  else if(planning!==null){
   const result=schedule(task,states,planning);
   if(result){
    placements.push(...result);placedTaskIds.push(task.id);
    for(const item of result){
     const d=states.find(s=>s.day.date===item.date);
     if(d)d.day.placedMinutes+=item.minutes;
    }
    continue;
   }
   if(Number.isFinite(task.deadline)&&states.some(s=>
    s.day.capacityMinutes!==null&&s.free.some(([,b])=>b>task.deadline)))
    reason='after_due';
  }
  unplaced.push({taskId:task.id,estimateMinutes:task.estimateMinutes,
   reason,availabilityKnown:known,suggestion:known?suggestion(reason):'set_availability'});
 }
 for(const state of states){
  const day=state.day;
  if(day.capacityMinutes===null)continue;
  day.remainingMinutes=spanMinutes(state.free);
  const overflow=unplaced.some(t=>t.reason==='no_capacity'&&t.availabilityKnown);
  day.overloaded=(day.remainingMinutes===0&&unplaced.length>0)||overflow;
  day.empty=day.occupiedMinutes===0&&day.placedMinutes===0&&ordered.length===0;
  day.suggestions=day.empty?['plan_next_step']:
   unplaced.length>0&& (day.overloaded||day.placedMinutes===0)
    ?['make_smaller_step','move_to_next_free_day']:[];
 }
 return {placements,days:states.map(x=>x.day),unplaced,placedTaskIds};
}
