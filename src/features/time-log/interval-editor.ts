import type {ClosedStudyIntervalInput} from '../../data/study/contract';
import {localClockInstant,localWallParts} from './local-time';

export interface LocalIntervalRow {
  kind:'focus'|'break';
  startDay:string;
  startTime:string;
  endDay:string;
  endTime:string;
}

/** Convert persisted instants into editable owner-local wall-clock rows. */
export function intervalRows(
  intervals:ClosedStudyIntervalInput[],zone:string,
):LocalIntervalRow[]{
  return intervals.map(interval=>{
    const start=localWallParts(interval.start,zone);
    const end=localWallParts(interval.end,zone);
    return {kind:interval.kind,startDay:start.day,startTime:start.clock,endDay:end.day,endTime:end.clock};
  });
}

/** Validate rows independently so the UI can attach an error to its row. */
export function intervalsFromRows(
  rows:LocalIntervalRow[],zone:string,
):{intervals:ClosedStudyIntervalInput[];errors:(string|null)[]}{
  const errors:(string|null)[]=rows.map(()=>null);
  const intervals:ClosedStudyIntervalInput[]=[];
  rows.forEach((row,index)=>{
    const start=localClockInstant(row.startDay,row.startTime,zone);
    const end=localClockInstant(row.endDay,row.endTime,zone);
    if(!start||!end){errors[index]='Choose valid local start and end times.';return;}
    if(Date.parse(end)<=Date.parse(start)){
      errors[index]='End must follow start.';return;
    }
    intervals.push({kind:row.kind,start,end});
  });
  if(rows.length===0)return {intervals,errors:['Add at least one interval']};
  if(errors.some(Boolean))return {intervals:[],errors};
  return {intervals,errors};
}
