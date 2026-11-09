// N75: read-only owner acknowledgement pages plus explicit audited commands.
import {useEffect,useMemo,useState} from 'react';
import {getOverlapApi} from '../../../data/overlap-acknowledgements';
import type {OverlapAcknowledgement} from '../../../data/overlap-acknowledgements/contract';
import type {StudyRange} from '../../../data/study/contract';
import {matchingAcknowledgement,overlapChoice,
 type CalendarOverlap} from './model';

async function fetchAcks(range:StudyRange):Promise<OverlapAcknowledgement[]>{
 const api=getOverlapApi(),items:OverlapAcknowledgement[]=[];
 let cursor:string|null=null;const seen=new Set<string>();
 for(let n=0;n<200;n++){
  const page=await api.listAcknowledgements({from:range.start,to:range.end,limit:50,cursor});
  if(!Number.isSafeInteger(page.total)||page.total<items.length+page.items.length||
    page.items.length>50)throw Error('Invalid owner acknowledgement page');
  items.push(...page.items);
  if(page.nextCursor===null){
   if(items.length!==page.total)throw Error('Acknowledgements changed during loading; reload');
   return items;
  }
  if(!page.nextCursor||seen.has(page.nextCursor)||page.items.length===0)
   throw Error('Acknowledgement cursor did not advance');
  seen.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('Too many acknowledgements for the visible range');
}
export function useCalendarOverlaps(range:StudyRange){
 const [records,setRecords]=useState<OverlapAcknowledgement[]>([]);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading');
 const [error,setError]=useState(''),[busy,setBusy]=useState<string|null>(null);
 const [token,setToken]=useState(0);
 useEffect(()=>{
  let mounted=true;setPhase('loading');setError('');setRecords([]);
  void fetchAcks(range).then(rows=>{if(mounted){setRecords(rows);setPhase('ready')}})
   .catch(e=>{if(mounted){setPhase('error');setError(e instanceof Error?e.message:String(e))}});
  return ()=>{mounted=false};
 },[range.start,range.end,token]);
 const reload=()=>setToken(x=>x+1);
 async function acknowledge(row:CalendarOverlap,kind:'keep_both'|'attribute_to',
  chosen=0){
  if(phase!=='ready'||busy!==null)return;
  setBusy(row.key);setError('');
  try{
   const attribution=kind==='attribute_to'?overlapChoice(row,chosen):null;
   await getOverlapApi().createAcknowledgement({
    participants:row.participants,startsAt:row.startsAt,endsAt:row.endsAt,
    disposition:kind,attributedTo:attribution,reason:null,
   });
   reload();
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(null)}
 }
 return {records,phase,error,busy,reload,acknowledge};
}
export type OverlapControls=ReturnType<typeof useCalendarOverlaps>;
export function OverlapMarkers({windows,controls,zone,compact=false,clock24h=true}:{
 windows:CalendarOverlap[];controls:OverlapControls;zone:string;compact?:boolean;clock24h?:boolean;
}){
 const fmt=useMemo(()=>new Intl.DateTimeFormat('en',{
  timeZone:zone,hour:'numeric',minute:'2-digit',hourCycle:clock24h?'h23':'h12'
 }),[zone,clock24h]);
 const day=useMemo(()=>new Intl.DateTimeFormat('en',{timeZone:zone,weekday:'short',month:'short',day:'numeric'}),[zone]);
 if(!windows.length)return null;
 const time=(instant:string)=>fmt.format(new Date(instant));
 return <section aria-label="Calendar overlap conflicts"
  className={'flex min-w-0 flex-col gap-2 '+(compact?'text-caption':'text-label')}>
  {controls.phase==='error'&&<p role="alert">{controls.error}
   <button type="button" onClick={controls.reload} className="ml-2 underline">Reload acknowledgements</button>
  </p>}
  {controls.phase==='ready'&&controls.error&&<p role="alert">{controls.error}</p>}
  {windows.map(row=>{
   const current=matchingAcknowledgement(row,controls.records);
   const canWrite=controls.phase==='ready'&&controls.busy===null;
   const label=row.names.join(' and ');
   return <article key={row.key} data-overlap={row.key}
    className="rounded-ctl border border-amber bg-amber-tint p-2 text-ink">
    <p className="font-semibold">{current?'Overlap acknowledged':'Overlap conflict'} · {day.format(new Date(row.startsAt))} ·
     {' '}{time(row.startsAt)}–{time(row.endsAt)}</p>
    <p className="break-words">{label}</p>
    {current?<p>{current.disposition==='keep_both'?'Kept both':
     'Counted toward '+(row.names[row.participants.findIndex(p=>
       p.kind===current.attributedTo?.kind&&p.id===current.attributedTo?.id)]||'one of them')}
    </p>:
    <div className="mt-2 flex flex-wrap gap-2">
     <button type="button" disabled={!canWrite}
      aria-label={'Keep both for '+label}
      onClick={()=>void controls.acknowledge(row,'keep_both')}
      className="min-h-11 rounded-ctl border border-edge px-2 disabled:opacity-50">
      Keep both</button>
     {row.participants.map((participant,i)=><button type="button"
       key={participant.kind+participant.id} disabled={!canWrite}
       aria-label={'Count this time toward '+row.names[i]}
       onClick={()=>void controls.acknowledge(row,'attribute_to',i)}
       className="min-h-11 rounded-ctl border border-edge px-2 disabled:opacity-50">
       Count this time toward {row.names[i]}</button>)}
    </div>}
    </article>;
  })}
 </section>;
}
