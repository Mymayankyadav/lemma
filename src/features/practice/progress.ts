import type {PracticeTopicRecord} from '../../data/practice-topics/contract';

/** V03 (v7 UX audit r3): practice for one owner day, defined once so Today's target and Close the day's meter print
 *  the same "n of m". Done = active topics practised that day (in the owner's zone). Due = active topics whose next
 *  date is on or before that day and that were not practised on it: an overdue topic is still owed today. */
export function practiceProgress(topics:readonly Pick<PracticeTopicRecord,'archivedAt'|'nextDueDate'|'lastPracticedAt'>[],day:string,zone:string):{done:number;due:number}{
 const civil=(instant:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date(instant));
 let done=0,due=0;
 for(const topic of topics){
  if(topic.archivedAt!==null&&topic.archivedAt!==undefined)continue;
  const practised=topic.lastPracticedAt!==null&&civil(topic.lastPracticedAt)===day;
  if(practised)done++;
  else if(topic.nextDueDate!==null&&topic.nextDueDate<=day)due++;
 }
 return {done,due};
}
