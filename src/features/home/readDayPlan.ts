import {getDayPlanApi} from '../../data/day-plans';
import type {DayPlanRecord} from '../../data/day-plans/contract';

/** Read the unique plan for this day without fetching its items or calendar. */
export async function readDayPlan(date:string):Promise<DayPlanRecord|null>{
 const api=getDayPlanApi();const plans:DayPlanRecord[]=[];const cursors=new Set<string>();
 let cursor:string|null=null;let total:number|null=null;
 for(let i=0;i<100;i++){
  const page=await api.listPlans({from:date,through:date,limit:50,cursor});
  if(page.items.length>50||!Number.isSafeInteger(page.total)||page.total<0)
   throw Error('Invalid day-plan page');
  if(total!==null&&page.total!==total)throw Error('Day-plan total changed');
  total=page.total;plans.push(...page.items);
  if(!page.nextCursor)break;
  if(cursors.has(page.nextCursor))throw Error('Repeated day-plan cursor');
  cursors.add(page.nextCursor);cursor=page.nextCursor;
  if(i===99)throw Error('Day-plan pagination safety bound');
 }
 if(plans.length!==total||plans.some(p=>p.planDate!==date)||plans.length>1)
  throw Error('Inconsistent owner day-plan date');
 return plans[0]??null;
}
