import type {CardRow,CardSearchFilters} from '../../../data/types';
import {formatShortDate} from '../../../lib/format';

/** PLAN §6.11 Cards. Pure rules: filter mapping, the "due today" test, the meta line and the sort. */
export type CardStateFilter='all'|'due'|'new'|'learning'|'paused';
export type CardSort='due'|'newest';
export const stateWords:Readonly<Record<CardStateFilter,string>>={all:'All states',due:'Due',new:'New',learning:'Learning',paused:'Paused'};
export function cardFilters({query,slug,checkpoint,state,comments}:{query:string;slug:string;checkpoint:string;state:CardStateFilter;comments:boolean}):Omit<CardSearchFilters,'offset'>{
 return {
  query:query.trim(),projectSlug:slug||undefined,checkpointCode:checkpoint||undefined,
  // "Due" is a time test on the loaded rows; New and Learning are scheduler states; Paused is the note status.
  state:state==='new'?0:state==='learning'?1:undefined,
  noteStatus:state==='paused'?'suspended':undefined,
  hasOpenComments:comments||undefined,
 };
}
const civil=(at:Date,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
/** Due today or earlier in the owner's zone. New cards (no due date) are not "due". */
export function isDueToday(row:Pick<CardRow,'due'>,now:Date,zone:string):boolean{
 if(!row.due)return false;
 const due=new Date(row.due);
 return Number.isFinite(due.getTime())&&civil(due,zone)<=civil(now,zone);
}
/** "due today", "due in 7 days", "due Sat 21 Nov", "new". */
export function dueWords(row:Pick<CardRow,'due'|'status'>,now:Date,zone:string):string{
 if(row.status==='suspended')return 'paused';
 if(!row.due)return 'new';
 const due=new Date(row.due);
 if(!Number.isFinite(due.getTime()))return 'new';
 const days=Math.round((Date.parse(civil(due,zone)+'T12:00:00Z')-Date.parse(civil(now,zone)+'T12:00:00Z'))/86_400_000);
 if(days<=0)return days<0?'overdue':'due today';
 if(days===1)return 'due tomorrow';
 if(days<14)return 'due in '+days+' days';
 return 'due '+formatShortDate(due,{zone,now});
}
/** "N49 · CP3 · due in 7 days", plus open comments when there are any. */
/** R1 · F49: names, not codes. The meta line says the path and when the card is due, never "N49 · CP9". */
export function cardMeta(row:CardRow,now:Date,zone:string,pathTitle?:string):string{
 return [pathTitle,dueWords(row,now,zone),row.openComments>0?row.openComments+(row.openComments===1?' comment':' comments'):null].filter(Boolean).join(' · ');
}
export function sortCards(rows:readonly CardRow[],sort:CardSort):CardRow[]{
 const copy=[...rows];
 if(sort==='newest')return copy.sort((a,b)=>b.noteNo-a.noteNo);
 // Due first: paused last, new cards after scheduled ones, then by due date, then by number.
 const rank=(row:CardRow)=>row.status==='suspended'?2:row.due?0:1;
 return copy.sort((a,b)=>rank(a)-rank(b)||(Date.parse(a.due??'')||0)-(Date.parse(b.due??'')||0)||a.noteNo-b.noteNo);
}
