import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {readWeekdayMinutes,saveWeekdayMinutes,weekdayOwner,type WeekdayEdit} from '../../data/study-weekdays';
import {Button,Sheet} from '../../ui/v7/components';
import {studyDay} from '../../lib/calendar';
import {useSettings} from '../../data/hooks';

const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function WeekdayCapacity(){
 const [open,setOpen]=useState(false),[inputs,setInputs]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const owner=weekdayOwner(),cache=useQueryClient(),settings=useSettings(),lock=useRef(false);
 const pref=useQuery({queryKey:['study-weekdays',owner],queryFn:readWeekdayMinutes,enabled:!!owner});
 const key='lemma.study.weekday-edit.v1.'+owner;
 const values=typeof pref.data==='number'?Array<number>(7).fill(pref.data):pref.data;
 const day=new Date(studyDay(Date.now(),settings.data?.timeZone,settings.data?.rolloverHour)+'T12:00:00Z').getUTCDay();
 function edit(){
  if(!pref.isSuccess)return;
  setError('');
  try{
   const pending=JSON.parse(sessionStorage.getItem(key)??'null') as WeekdayEdit|null;
   setInputs((pending?.ownerId===owner?pending.minutes:values??Array<number>(7).fill(0)).map(String));
  }catch{setError('Availability could not be reopened.');return;}
  setOpen(true);
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
   void cache.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('adaptive')});
   setOpen(false);
  }catch(e){setError(e instanceof Error?e.message:'Could not confirm availability. Retry the same values.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <div>
  <p role="status">{values?'Available today · '+values[day]+' min':'Set weekday study minutes to plan your time.'}</p>
  {pref.isError?<Button onClick={()=>{void pref.refetch();}}>Retry study availability</Button>:
   <Button disabled={!pref.isSuccess} onClick={edit}>{values?'Edit weekday minutes':'Set weekday minutes'}</Button>}
  {!open&&error&&<p role="alert">{error}</p>}
  {open&&<Sheet open onClose={()=>{if(!busy)setOpen(false);}} title="Weekday study minutes" footer={<>
   <Button disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button>
   <Button variant="primary" loading={busy} onClick={()=>{void save();}}>Save availability</Button></>}>
   {days.map((label,index)=><label key={label} className="v7-field-group">{label}<input className="v7-field" type="number" min="0" max="1440" inputMode="numeric" value={inputs[index]} onChange={e=>setInputs(before=>before.map((v,i)=>i===index?e.target.value:v))}/></label>)}
   {error&&<p role="alert">{error}</p>}
  </Sheet>}
 </div>;
}
