// N74: exact-total cursor traversal of existing owner-scoped, read-only APIs.
// Guard against cyclic or unbounded cursors rather than silently truncating days.
import {getDeadlineApi} from '../../../data/deadlines';
import {getPracticeTopicApi} from '../../../data/practice-topics';
import type {CalendarDues} from './DueDayItems';

async function traverse<T>(fetch:(cursor:string|null)=>Promise<{
 items:T[];nextCursor:string|null;total:number;
}>):Promise<T[]>{
 const result:T[]=[];let cursor:string|null=null;
 const seen=new Set<string>();
 for(let pageNumber=0;pageNumber<200;pageNumber++){
  const page=await fetch(cursor);
  if(!Number.isSafeInteger(page.total)||page.total<0||
    page.items.length>50||page.total<result.length+page.items.length)
   throw new Error('Calendar source returned an invalid page');
  result.push(...page.items);
  if(page.nextCursor===null){
   if(result.length!==page.total)
    throw new Error('Calendar source total changed during loading; reload');
   return result;
  }
  if(!page.nextCursor||seen.has(page.nextCursor)||page.items.length===0)
   throw new Error('Calendar source cursor did not advance');
  seen.add(page.nextCursor);
  cursor=page.nextCursor;
 }
 throw new Error('Calendar contains too many due records to display safely');
}
export async function loadCalendarDues():Promise<CalendarDues>{
 const [deadlines,topics]=await Promise.all([
  traverse(cursor=>getDeadlineApi().listDeadlines({
   statuses:['open'],includeProjections:true,limit:50,cursor,
  })),
  traverse(cursor=>getPracticeTopicApi().listTopics({archived:'active',limit:50,cursor})),
 ]);
 return {deadlines,topics};
}
