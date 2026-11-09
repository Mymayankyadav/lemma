/** Shared v6 status caption for Today, Focus and the persistent dock. */
export function focusStatus(status:string,phase?:string|null):string{
 if(status==='finishing')return 'Ready to save';
 if(status==='paused')return phase==='long_break'?'Paused · long break':
  phase==='break'?'Paused · break':'Paused';
 if(phase==='long_break')return 'Long break';
 if(status==='break'||phase==='break')return 'On a break';
 return 'In focus';
}
