/** Shared v6 status caption for Today, Focus and the persistent dock. */
export function focusStatus(status:string,phase?:string|null):string{
 if(status==='finishing')return 'Ready to save';
 if(status==='paused')return phase==='long_break'?'Paused · long break':
  phase==='break'?'Paused · break':'Paused';
 if(phase==='long_break')return 'Long break';
 if(status==='break'||phase==='break')return 'On a break';
 return 'In focus';
}
/** N121 A5: the same status from a saved study entry (the dock reads the server record).
 * An open break interval is a break even though the record's status is "paused". */
export function focusEntryStatus(entry:{status:string;phase?:string|null;intervals:readonly {kind:string;end:string|null}[]}):string{
 const last=entry.intervals[entry.intervals.length-1];
 if(last?.kind==='break'&&last.end===null)return focusStatus('break',entry.phase==='long_break'?'long_break':'break');
 return focusStatus(entry.status==='paused'?'paused':'running',entry.phase);
}
