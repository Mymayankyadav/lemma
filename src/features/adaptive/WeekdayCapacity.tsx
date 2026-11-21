import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {readWeekdayMinutes,saveWeekdayMinutes,weekdayOwner,type WeekdayEdit} from '../../data/study-weekdays';
import {readCapacityOverrides} from '../../data/adaptive/capacity-override';
import {Button,Sheet} from '../../ui/v7/components';
import {addDays,studyDay} from '../../lib/calendar';
import {useSettings} from '../../data/hooks';
import {formatDuration} from '../../lib/format';

const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function WeekdayCapacity({requested=false,onOpen}: {requested?:boolean;onOpen?:()=>void}={}){
 const [open,setOpen]=useState(false),[inputs,setInputs]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [copying,setCopying]=useState(false);
 const owner=weekdayOwner(),cache=useQueryClient(),settings=useSettings(),lock=useRef(false);
 const pref=useQuery({queryKey:['study-weekdays',owner],queryFn:readWeekdayMinutes,enabled:!!owner});
 const key='lemma.study.weekday-edit.v1.'+owner;
 const values=typeof pref.data==='number'?Array<number>(7).fill(pref.data):pref.data;
 const today=studyDay(Date.now(),settings.data?.timeZone,settings.data?.rolloverHour);
 const day=new Date(today+'T12:00:00Z').getUTCDay();
 function edit(){
  if(!pref.isSuccess)return;
  setError('');
  try{
   const pending=JSON.parse(sessionStorage.getItem(key)??'null') as WeekdayEdit|null;
   setInputs((pending?.ownerId===owner?pending.minutes:values??Array<number>(7).fill(0)).map(String));
  }catch{setError('Availability could not be reopened.');return;}
  setOpen(true);
 }
 useEffect(()=>{
  if(!requested||!pref.isSuccess)return;
  edit();
  onOpen?.();
 },[requested,pref.isSuccess]);
 const first=settings.data?.weekStart??1;
 const order=Array.from({length:7},(_,index)=>(first+index)%7);
 function setMinutes(index:number,minutes:number) {
  setInputs(before=>before.map((value,at)=>at===index?String(minutes):value));
 }
 function applyPreset(preset:'weekday'|'weekend') {
  setInputs(before=>days.map((_,index)=>String(
   preset==='weekday'&&index>=1&&index<=5?60:preset==='weekend'&&(index===0||index===6)?120:Number(before[index]??0))));
 }
 async function copyLastWeek(){
  if(lock.current)return;
  lock.current=true;setCopying(true);setError('');
  try{
   const start=addDays(today,-7-(day-first+7)%7);
   const overrides=await readCapacityOverrides(start,addDays(start,6));
   if(weekdayOwner()!==owner)return;
   setInputs(days.map((_,index)=>String(overrides[addDays(start,(index-first+7)%7)]??values?.[index]??0)));
  }catch{setError('Could not read last week. Try again.');}
  finally{lock.current=false;setCopying(false);}
 }
 async function save(){
  if(!owner||!pref.isSuccess||lock.current)return;
  if(inputs.length!==7||inputs.some(s=>!/^\d+$/.test(s)||Number(s)>1440)){setError('Enter 0 to 1440 whole minutes for each day.');return;}
  lock.current=true;setBusy(true);setError('');
  try{
   const prior=JSON.parse(sessionStorage.getItem(key)??'null') as WeekdayEdit|null;
   const request=prior??{operationId:crypto.randomUUID(),ownerId:owner,previous:pref.data,minutes:inputs.map(Number)};
   if(JSON.stringify(request.minutes)!==JSON.stringify(inputs.map(Number)))throw Error('Reopen and confirm the saved selection before changing it.');
   sessionStorage.setItem(key,JSON.stringify(request));
   const result=await saveWeekdayMinutes(request);
   if(weekdayOwner()!==owner)return;
   sessionStorage.removeItem(key);
   await cache.invalidateQueries({queryKey:['study-weekdays',owner]});
   if(result==='conflict'){setError('Availability changed elsewhere. Reopen the saved values before editing.');return;}
   void cache.invalidateQueries({queryKey:['atlas-model']});
   void cache.invalidateQueries({queryKey:['agenda']});
   void cache.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('adaptive')});
   setOpen(false);
  }catch(e){setError(e instanceof Error?e.message:'Could not confirm availability. Retry the same values.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <div>
  <p role="status">{values?'Available today · '+values[day]+' min':'Set your study time to get a plan.'}</p>
  {pref.isError?<Button onClick={()=>{void pref.refetch();}}>Retry study availability</Button>:
   <Button disabled={!pref.isSuccess} onClick={edit}>{values?'Edit weekday minutes':'Set weekday minutes'}</Button>}
  {!open&&error&&<p role="alert">{error}</p>}
  {open&&<Sheet open onClose={()=>{if(!lock.current)setOpen(false);}} title="Weekday study minutes" footer={<>
   <Button disabled={busy||copying} onClick={()=>setOpen(false)}>Cancel</Button>
   <Button variant="primary" disabled={copying} loading={busy} onClick={()=>{void save();}}>Save availability</Button></>}>
   <div className="v7-capacity-painter" aria-label="Weekday study time">
    {order.map(index=><label key={index}>
     <span aria-hidden="true">{formatDuration(Number(inputs[index]??0))}</span>
     <input type="range" min={0} max={1440} step={1} disabled={busy||copying}
      value={Number(inputs[index]??0)} aria-label={days[index]} aria-valuetext={formatDuration(Number(inputs[index]??0))}
      onChange={event=>setMinutes(index,event.target.valueAsNumber)}/>
     <span>{days[index].slice(0,3)}</span>
    </label>)}
   </div>
   <div className="v7-capacity-presets">
    <Button small disabled={busy||copying} onClick={()=>applyPreset('weekday')}>Weekdays 1 h</Button>
    <Button small disabled={busy||copying} onClick={()=>applyPreset('weekend')}>Weekends 2 h</Button>
    <Button small disabled={busy} loading={copying} onClick={()=>{void copyLastWeek();}}>Copy last week</Button>
   </div>
   {error&&<p role="alert">{error}</p>}
  </Sheet>}
 </div>;
}
