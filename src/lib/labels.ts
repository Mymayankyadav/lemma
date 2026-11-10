/** V6-only copy: identifiers and API enums must never leak into reader-facing labels. */
export function unplacedReasonText(code:string):string{
 switch(code){
  case 'too_long':return 'Longer than your longest sitting. Split it or increase the limit in Settings.';
  case 'after_due':return 'Due before your first available slot.';
  case 'no_estimate':return 'Add a time estimate to plan this task.';
  case 'no_capacity':return 'No free study time remains in these days.';
  default:return 'This task could not be scheduled. Review its details.';
 }
}
export function sessionStatusText(value:string):string{
 return ({yes:'Demonstrated',no:'Not demonstrated',partial:'Partially demonstrated',paused:'Paused',
  completed:'Completed',active:'In progress',running:'In progress',live:'In progress',ended:'Ended'} as Record<string,string>)[value]??'Status unavailable';
}
export function evidenceText(value:string):string{
 return ({hint:'Hint',explanation:'Explanation',partial:'Partly there',yes:'Demonstrated',no:'Not yet',
  demonstrated:'Demonstrated',recheck_ok:'Recheck passed',recheck_fail:'Recheck missed',attempt:'Attempt',
  misconception:'Misconception',proof:'Proof',full:'Complete',none:'Not yet'} as Record<string,string>)[value]??'Evidence';
}
export function cardTypeText(value:string):string{
 return ({basic:'Basic · question and answer',cloze:'Fill in the blank',reverse:'Both ways · ask in either direction'} as Record<string,string>)[value]??'Card';
}
export function noteKindText(value:string):string{
 return ({other:'Other',definition:'Definition',theorem:'Theorem',why:'Why it is true',example:'Example',
  counterexample:'Counterexample',proof:'Proof',exercise:'Exercise'} as Record<string,string>)[value]??'Note';
}
/** Saved study time is rated 1–5 for focus. */
export const studyRatings=[1,2,3,4,5] as const;
export function ratingText(value:number|null|undefined):string{
 return value==null?'Not rated':({1:'1 · Scattered',2:'2 · Distracted',3:'3 · Solid',4:'4 · Focused',5:'5 · Deep focus'} as Record<number,string>)[value]??'Not rated';
}
/** Practice topics are rated 1–4 for recall. */
export function practiceRatingText(value:number):string{
 return ({1:"1 · Couldn't recall",2:'2 · Hard',3:'3 · Good',4:'4 · Easy'} as Record<number,string>)[value]??String(value);
}
export function clientName(value:string):string{
 return ({claude:'Claude',chatgpt:'ChatGPT',openai:'ChatGPT',gemini:'Gemini'} as Record<string,string>)[value.toLowerCase()]??'AI tutor';
}
export function projectTitle(id:string|null|undefined,items:ReadonlyArray<{id:string;slug?:string;title:string}>):string{
 if(!id)return 'Unassigned path';
 return items.find(item=>item.id===id||item.slug===id)?.title??'Linked path';
}
export function subjectName(id:string|null|undefined,items:ReadonlyArray<{id:string;name:string}>):string{
 if(!id)return 'Unassigned subject';
 return items.find(item=>item.id===id)?.name??'Linked subject';
}
export function checkpointTitle(id:string|null|undefined,items:ReadonlyArray<{id:string;code?:string;title:string}>):string{
 if(!id)return 'No checkpoint';
 const item=items.find(item=>item.id===id||item.code===id);
 return item?`${item.title}${item.code?' · '+item.code:''}`:'Linked checkpoint';
}
/** Expose plain text from a cloze expression without its syntax. */
export function plainCardText(source:string):string{
 return source.replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g,'$1').replace(/\$([^$]+)\$/g,'$1').trim();
}
