import type {ReviewItem} from '../../data/types';

/** Reminder rounds are independent of the ordinary saved daily quota. */
export function boundedReminderItems(items:readonly ReviewItem[],count:number):ReviewItem[]{
 if(!Number.isInteger(count)||count<1||count>50)throw new RangeError('Reminder count must be 1–50');
 const seen=new Set<string>();
 return items.filter(item=>{
  if(seen.has(item.cardId))return false;
  seen.add(item.cardId);
  return true;
 }).slice(0,count);
}
