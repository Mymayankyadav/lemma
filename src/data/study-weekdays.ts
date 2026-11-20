import {authGeneration,authOwner} from './authBoundary';
import {getDemoProfile,getMode} from './mode';

export type WeekdayValue=number|number[]|null;
export interface WeekdayEdit{operationId:string;ownerId:string;previous:WeekdayValue;minutes:number[]}
const demoKey=()=>'lemma.study.weekday-minutes.demo.'+getDemoProfile();
export function weekdayOwner(){return getMode()==='demo'?'demo.'+getDemoProfile():authOwner();}
export function demoWeekdayMinutes():number[]|null{
 if(typeof sessionStorage==='undefined')return null;
 try{return JSON.parse(sessionStorage.getItem(demoKey())??'null') as number[]|null;}catch{return null;}
}
export async function readWeekdayMinutes():Promise<WeekdayValue>{
 if(getMode()==='demo')return demoWeekdayMinutes();
 const {liveClient}=await import('./live/client'),{checked,owner}=await import('./live/helpers');
 const db=liveClient(),generation=authGeneration(),uid=await owner(db);
 if(authGeneration()!==generation||authOwner()!==uid)throw Error('The signed-in account changed.');
 const row=checked(await db.from('settings').select('capacity').eq('user_id',uid)
  .single<{capacity:{weekday_minutes?:WeekdayValue}|null}>());
 if(authGeneration()!==generation||authOwner()!==uid)throw Error('The signed-in account changed.');
 if(!row)throw Error('The signed-in study settings could not be read.');
 return row.capacity?.weekday_minutes??null;
}
export async function saveWeekdayMinutes(edit:WeekdayEdit):Promise<'applied'|'conflict'>{
 if(edit.ownerId!==weekdayOwner())throw Error('The signed-in account changed.');
 if(edit.minutes.length!==7||edit.minutes.some(n=>!Number.isInteger(n)||n<0||n>1440))throw Error('Enter 0 to 1440 whole minutes for each day.');
 if(getMode()==='demo'){
  const current=demoWeekdayMinutes();
  if(JSON.stringify(current)!==JSON.stringify(edit.previous)&&JSON.stringify(current)!==JSON.stringify(edit.minutes))return 'conflict';
  sessionStorage.setItem(demoKey(),JSON.stringify(edit.minutes));
 }else{
  const {liveClient}=await import('./live/client'),{checked,owner}=await import('./live/helpers');
  const db=liveClient(),generation=authGeneration();
  if(await owner(db)!==edit.ownerId||authGeneration()!==generation)throw Error('The signed-in account changed.');
  const receipt=checked(await db.rpc('set_study_weekday_minutes',{p_operation_id:edit.operationId,p_expected_owner:edit.ownerId,
   p_previous:edit.previous,p_minutes:edit.minutes}));
  if(authOwner()!==edit.ownerId||authGeneration()!==generation)throw Error('The signed-in account changed.');
  if(receipt.operationId!==edit.operationId)throw Error('The saved availability could not be verified.');
  if(receipt.status==='conflict')return 'conflict';
  if(receipt.status!=='applied')throw Error('The saved availability could not be verified.');
 }
 if(JSON.stringify(await readWeekdayMinutes())!==JSON.stringify(edit.minutes))return 'conflict';
 return 'applied';
}
