import {MetaChip} from './Status';

/** "14:05" in the learner's time zone. */
export function asOfTime(at:number,zone?:string):string{
 const options:Intl.DateTimeFormatOptions={hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
 try{return new Intl.DateTimeFormat('en-GB',{...options,timeZone:zone}).format(new Date(at));}
 catch{return new Intl.DateTimeFormat('en-GB',options).format(new Date(at));}
}
/**
 * N151 · AN3: "as of 14:05" beside numbers that come from the saved copy rather than the server (see savedCopy.ts).
 * Nothing is shown while the numbers are fresh. The sync light in the header is a later item.
 */
export function AsOf({at,zone}:{at:number|null;zone?:string}){
 if(at===null)return null;
 const time=asOfTime(at,zone);
 return <span role="status" className="v7-as-of" title={'Working from your notebook: these numbers were saved at '+time+' and have not been refreshed from the server.'}>
  <MetaChip kind="saved"><span className="v7-sr-only">Working from your notebook · </span>as of {time}</MetaChip>
 </span>;
}
