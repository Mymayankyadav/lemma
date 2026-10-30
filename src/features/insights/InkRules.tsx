import type {Calibration} from '../../lib/insights';

export interface SubjectMinutes {subject:{name:string;glyph:string};minutes:number}

export function SubjectRules({data,format}: {data:SubjectMinutes[];format:(minutes:number)=>string}) {
 const max=Math.max(1,...data.map(row=>row.minutes));
 return <div role="img" aria-label={`Time by subject: ${data.map(row=>row.subject.name+' '+format(row.minutes)).join(', ')||'no sessions'}.`} className="flex flex-col gap-4">
  {data.length===0?<p className="text-label text-ink-3">No study time recorded yet.</p>:data.map(row=><div key={row.subject.name} className="flex flex-col gap-1.5">
   <div className="flex items-baseline justify-between gap-3 text-label">
    <span className="min-w-0 text-ink-2"><span aria-hidden="true" className="mr-2 font-math italic text-amber">{row.subject.glyph}</span>{row.subject.name}</span>
    <span className="shrink-0 tabular-nums text-ink-2">{format(row.minutes)}</span>
   </div>
   <div className="h-1 w-full overflow-hidden rounded-[1px] bg-fill-2">
    <div className="h-full rounded-[1px] bg-amber" style={{width:`${Math.max(0,Math.min(100,row.minutes/max*100))}%`}}/>
   </div>
  </div>)}
 </div>;
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
