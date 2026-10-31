import {useState} from 'react';
import {Link} from 'react-router';
import {RotateCcw,Waypoints} from 'lucide-react';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import type {Calibration} from '../../lib/insights';

export interface SubjectMinutes {subject:{name:string;glyph:string};minutes:number}

/** Keep the six largest subjects visible; group the long tail without losing totals. */
export function summarizeSubjects(data:SubjectMinutes[],limit=6) {
 const sorted=[...data].sort((a,b)=>b.minutes-a.minutes||a.subject.name.localeCompare(b.subject.name));
 const top=sorted.slice(0,limit),other=sorted.slice(limit);
 return {top,other,otherMinutes:other.reduce((sum,row)=>sum+row.minutes,0)};
}

export function SubjectRules({data,format}: {data:SubjectMinutes[];format:(minutes:number)=>string}) {
 const [expanded,setExpanded]=useState(false);
 const [fullLabel,setFullLabel]=useState<string|null>(null);
 const {top,other,otherMinutes}=summarizeSubjects(data);
 const rows=expanded?[...top,...other]:top;
 // Compare individual subjects on their own scale; Other is a labelled aggregate.
 const max=Math.max(1,...top.map(row=>row.minutes));
 return <div role="group" aria-label="Time by subject" className="flex flex-col gap-3">
  {data.length===0?<p className="text-label text-ink-3">No study time recorded yet.</p>:<>
   {rows.map(row=><div key={row.subject.name} className="flex flex-col gap-1">
    <div className="flex min-w-0 items-center justify-between gap-3 text-label">
     <button type="button" title={plainMath(row.subject.name)} aria-label={plainMath(row.subject.name)} onClick={()=>setFullLabel(fullLabel===row.subject.name?null:row.subject.name)}
      className={`flex min-h-11 min-w-0 flex-1 items-center text-left text-ink-2 ${fullLabel===row.subject.name?'break-words':'overflow-hidden'}`}>
      <span aria-hidden="true" className="mr-2 shrink-0 font-math italic text-amber">{row.subject.glyph}</span>
      <span className={fullLabel===row.subject.name?'min-w-0 max-w-full overflow-x-auto break-words text-body':'min-w-0 clip-1 text-body'}
       style={fullLabel===row.subject.name?{maskImage:'linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)'}:undefined}><Tex source={row.subject.name}/></span>
     </button>
     <span className="shrink-0 tabular-nums text-ink-2">{format(row.minutes)}</span>
    </div>
    <div className="h-1 w-full overflow-hidden rounded-[1px] bg-fill-2">
     <div className="h-full rounded-[1px] bg-amber" style={{width:`${Math.max(0,Math.min(100,row.minutes/max*100))}%`}}/>
    </div>
   </div>)}
   {other.length>0&&<div className="flex flex-col gap-1">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
     className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-label text-ink-2">
     <span className="clip-1">{expanded?'Hide other subjects':`Other (${other.length})`}</span>
     <span className="shrink-0 tabular-nums">{format(otherMinutes)}</span>
    </button>
    {!expanded&&<div className="h-1 w-full overflow-hidden rounded-[1px] bg-fill-2">
     <div className="h-full rounded-[1px] bg-amber" style={{width:`${Math.max(0,Math.min(100,otherMinutes/max*100))}%`}}/>
    </div>}
   </div>}
  </>}
 </div>;
}


/** Preserve the exact concept name for Atlas fallback lookup: a mathematical
 * name cannot reliably be reconstructed from a lossy ASCII slug. */
export function MostRevisitedLink({conceptName,label}:{conceptName?:string|null;label?:string|null}){
 const name=conceptName||label||'No repeats yet';
 const params=new URLSearchParams();
 if(conceptName){
  params.set('focus',conceptName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
  params.set('name',conceptName);
 }
 return <Link to={conceptName?'/atlas?'+params.toString():'/atlas'} className="tile" aria-label={'Most revisited: '+plainMath(name)}>
  <div className="mb-3 flex items-center justify-between text-amber"><RotateCcw size={20}/><Waypoints size={16}/></div>
  <span className="block text-label text-ink-2">Most revisited</span>
  <strong className="block min-w-0 max-w-full overflow-x-auto break-words text-headline" title={plainMath(name)} style={{maskImage:"linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)"}}><Tex source={name}/></strong>
 </Link>;
}

export function CalibrationRules({data}: {data:Calibration[]}) {
 return <div role="img" aria-label={`Answer confidence calibration: ${data.map(row=>row.confidence+' '+row.right+' of '+row.total+' correct').join('; ')}.`} className="flex flex-col gap-4">
  {data.map(row=><div key={row.confidence} className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-3 text-label">
   <span className="capitalize text-ink-2">{row.confidence}</span>
   <div className="h-1 overflow-hidden rounded-[1px] bg-fill-2">
    <div className="h-full rounded-[1px] bg-amber" style={{width:`${Math.max(0,Math.min(100,(row.rate??0)*100))}%`}}/>
   </div>
   <span className="text-right tabular-nums text-ink">{row.rate===null?'—':Math.round(row.rate*100)+'%'}</span>
  </div>)}
 </div>;
}
