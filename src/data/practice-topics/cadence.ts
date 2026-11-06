import {PracticeError,type PracticeCadence,type PracticeRating} from './contract';
const fail=(message:string):never=>{throw new PracticeError('invalid',message)};
export function civilPracticeDate(day:string):string{
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))fail('Invalid practice civil date');
 const millis=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(millis)||new Date(millis).toISOString().slice(0,10)!==day)fail('Invalid practice civil date');
 return day;
}
export function validateCadence(cadence:PracticeCadence):PracticeCadence{
 if(!cadence||typeof cadence!=='object')fail('Missing practice cadence');
 const valid=(days:number)=>Number.isInteger(days)&&days>=1&&days<=3650;
 if(cadence.kind==='fixed_days'){
  if(!valid(cadence.days))fail('Fixed cadence days must be 1–3650');
  return{kind:'fixed_days',days:cadence.days};
 }
 if(cadence.kind==='after_rating'){
  if(!Array.isArray(cadence.daysByRating)||cadence.daysByRating.length!==4||
   !cadence.daysByRating.every(valid))fail('Practice cadence must contain four bounded rating delays');
  return{kind:'after_rating',daysByRating:[...cadence.daysByRating] as [number,number,number,number]};
 }
 return fail('Unknown manual-practice cadence');
}
/** Civil arithmetic is independent of DST and the learner's current travel zone. */
export function nextPracticeDue(day:string,rating:PracticeRating,cadence:PracticeCadence):string{
 civilPracticeDate(day);
 if(![1,2,3,4].includes(rating))fail('Practice rating must be 1–4');
 const rule=validateCadence(cadence);
 const days=rule.kind==='fixed_days'?rule.days:rule.daysByRating[rating-1];
 const ms=Date.parse(day+'T00:00:00Z')+days*86400000;
 return new Date(ms).toISOString().slice(0,10);
}
