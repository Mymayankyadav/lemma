import type {PracticeCadence} from '../../../data/practice-topics/contract';
import {formatInterval} from '../../../lib/format';

/** PLAN §6.13 Practice. Pure labels so the due chip and cadence wording are testable. */
export type DueTone='today'|'overdue'|'upcoming'|'none';
const ordinal=(day:string)=>{const [y,m,d]=day.slice(0,10).split('-').map(Number);return Date.UTC(y,m-1,d)/86_400_000;};
export function dueChip(next:string|null,today:string):{label:string;tone:DueTone}{
 if(!next)return {label:'Not scheduled',tone:'none'};
 const offset=ordinal(next)-ordinal(today);
 if(Number.isNaN(offset))return {label:'Not scheduled',tone:'none'};
 if(offset<0){const days=-offset;return {label:'Overdue · '+days+(days===1?' day':' days'),tone:'overdue'};}
 if(offset===0)return {label:'Due today',tone:'today'};
 return {label:'In '+offset+(offset===1?' day':' days'),tone:'upcoming'};
}
export function cadenceText(cadence:PracticeCadence):string{
 return cadence.kind==='fixed_days'?'Every '+formatInterval(cadence.days):'Adapts to your rating';
}
/** "Last practised today / yesterday / N days ago", never a raw timestamp. */
export function lastText(last:string|null,today:string):string{
 if(!last)return 'Not practised yet';
 const days=Math.round(ordinal(today)-ordinal(last));
 if(Number.isNaN(days))return 'Not practised yet';
 if(days<=0)return 'Last practised today';
 if(days===1)return 'Last practised yesterday';
 return 'Last practised '+days+' days ago';
}
export const ratingNames:Readonly<Record<1|2|3|4,string>>={1:"Couldn't recall",2:'Hard',3:'Good',4:'Easy'};
