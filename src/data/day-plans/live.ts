// N60.2 live adapter is not ready. Never pretend a mutation succeeded.
import type {DayPlanApi} from './contract';
const pending=(name:string):never=>{throw Error('N60.2 live day-plan '+name+' requires owner-RLS RPC integration')};
export function createLiveDayPlanApi():DayPlanApi{
 return {mode:'live',
  listPlans:async()=>pending('listPlans'),
  getPlan:async()=>pending('getPlan'),
  listItems:async()=>pending('listItems'),
  createPlan:async()=>pending('createPlan'),
  updatePlan:async()=>pending('updatePlan'),
  previewPlan:async()=>pending('previewPlan'),
  commitPlan:async()=>pending('commitPlan'),
  closePlan:async()=>pending('closePlan'),
  reopenPlan:async()=>pending('reopenPlan'),
 };
}
