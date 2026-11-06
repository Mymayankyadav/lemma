import {LemmaError} from '../api';
import type {GoalPeriod,NewStudyGoal,StudyGoalPatch,StudyGoalQuery,StudyGoalRecord} from './contract';
const periods:GoalPeriod[]=['week','month','custom'];
export const invalid=(message:string):never=>{throw new LemmaError('invalid',message)};
export function validDate(value:string):boolean {
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d;
}
export function validate(p:StudyGoalPatch|NewStudyGoal):void {
 if(p.period!==undefined&&!periods.includes(p.period))invalid('Invalid goal period');
 if(p.startDate!==undefined&&!validDate(p.startDate))invalid('Invalid goal start date');
 if(p.endDate!==undefined&&!validDate(p.endDate))invalid('Invalid goal end date');
 if(p.timeZone!==undefined){
  if(typeof p.timeZone!=='string'||!p.timeZone.trim())invalid('Time zone required');
  try{new Intl.DateTimeFormat('en',{timeZone:p.timeZone});}
  catch{invalid('Invalid time zone');}
 }
 if(p.targetMinutes!==undefined&&(!Number.isSafeInteger(p.targetMinutes)||p.targetMinutes<0||
  p.targetMinutes>2147483647))invalid('Invalid goal target minutes');
 for(const k of ['subjectId','projectId'] as const)
  if(p[k]!==undefined&&p[k]!==null&&(typeof p[k]!=='string'||!p[k]?.trim()))
   invalid('Invalid goal scope identifier');
}
export function validatedRange(p:Pick<NewStudyGoal,'startDate'|'endDate'>):void {
 if(!validDate(p.startDate)||!validDate(p.endDate)||p.startDate>p.endDate)
  invalid('Goal end date must be on or after the valid start date');
}
export function overlap(item:StudyGoalRecord,other:StudyGoalRecord):boolean {
 return item.id!==other.id&&item.period===other.period&&
  (item.subjectId??null)===(other.subjectId??null)&&
  (item.projectId??null)===(other.projectId??null)&&
  item.startDate<=other.endDate&&other.startDate<=item.endDate;
}
export function queryOptions(q:StudyGoalQuery):{limit:number;archived:'all'|'active'|'archived';cursor:Cursor|null}{
 const limit=q.limit??20,archived=q.archived??'all';
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)invalid('Goal page limit must be 1–50');
 if(!['all','active','archived'].includes(archived))invalid('Invalid goal archive filter');
 let cursor:Cursor|null=null;
 if(q.cursor!=null){
  try{
   if(typeof q.cursor!=='string'||!/^[A-Za-z0-9_-]{4,1000}$/.test(q.cursor))throw Error();
   const result=JSON.parse(atob(q.cursor.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-q.cursor.length%4)%4))) as Cursor;
   if(result.v!==1||result.f!==archived||!validDate(result.s)||
      typeof result.i!=='string'||!result.i)throw Error();
   cursor=result;
  }catch{invalid('Invalid or mismatched goal cursor');}
 }
 return {limit,archived,cursor};
}
type Cursor={v:1;f:'all'|'active'|'archived';s:string;i:string};
export function cursorOf(item:StudyGoalRecord,filter:Cursor['f']):string {
 return btoa(JSON.stringify({v:1,f:filter,s:item.startDate,i:item.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function isAfter(item:StudyGoalRecord,cursor:Cursor):boolean{
 return item.startDate>cursor.s||(item.startDate===cursor.s&&item.id>cursor.i);
}
