import type {ClosedStudyIntervalInput} from '../../data/study/contract';
import {intervalsFromRows,type LocalIntervalRow} from './interval-editor';
import {localWallParts} from './local-time';

const field='min-h-11 min-w-0 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label text-ink';
const action='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold';

export function IntervalRowsEditor({rows,onChange,zone}:{rows:LocalIntervalRow[];onChange:(rows:LocalIntervalRow[])=>void;zone:string}){
 const validation=intervalsFromRows(rows,zone);
 function update(index:number,key:keyof LocalIntervalRow,value:string){
  onChange(rows.map((row,i)=>i===index?{...row,[key]:value}:row));
 }
 function add(){
  const day=localWallParts(new Date().toISOString(),zone).day;
  onChange([...rows,{kind:'focus',startDay:day,startTime:'',endDay:day,endTime:''}]);
 }
 return <fieldset className="mt-3 space-y-3">
  <legend className="text-label font-semibold">Study intervals</legend>
  {rows.map((row,index)=><div key={index} className="min-w-0 rounded-ctl border border-edge p-3">
   <div className="flex items-center justify-between gap-2">
    <label className="min-w-0 flex-1 text-label">Interval type
     <select aria-label={`Interval ${index+1} type`} className={field} value={row.kind}
      onChange={e=>update(index,'kind',e.target.value as ClosedStudyIntervalInput['kind'])}>
      <option value="focus">Focus</option><option value="break">Break</option>
     </select>
    </label>
    <button type="button" className={action+' self-end'} aria-label={`Remove interval ${index+1}`}
     onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>Remove</button>
   </div>
   <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
    <label className="min-w-0 text-label">Start date<input type="date" className={field}
     aria-label={`Interval ${index+1} start date`} value={row.startDay}
     onChange={e=>update(index,'startDay',e.target.value)}/></label>
    <label className="min-w-0 text-label">Start time<input type="time" className={field}
     aria-label={`Interval ${index+1} start time`} value={row.startTime}
     onChange={e=>update(index,'startTime',e.target.value)}/></label>
    <label className="min-w-0 text-label">End date<input type="date" className={field}
     aria-label={`Interval ${index+1} end date`} value={row.endDay}
     onChange={e=>update(index,'endDay',e.target.value)}/></label>
    <label className="min-w-0 text-label">End time<input type="time" className={field}
     aria-label={`Interval ${index+1} end time`} value={row.endTime}
     onChange={e=>update(index,'endTime',e.target.value)}/></label>
   </div>
   {validation.errors[index]&&<p role="alert" className="mt-2 text-caption text-again">{validation.errors[index]}</p>}
  </div>)}
  <button type="button" className={action} onClick={add}>Add interval</button>
 </fieldset>;
}
