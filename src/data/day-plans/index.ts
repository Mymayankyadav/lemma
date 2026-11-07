// N60.2 mode-aware day-plan facade. Screens use only this contract.
import {getMode} from '../mode';
import type {DayPlanApi} from './contract';
import {createDemoDayPlanApi} from './demo';
import {createLiveDayPlanApi} from './live';

export type * from './contract';
let cached:DayPlanApi|null=null;
export function getDayPlanApi():DayPlanApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoDayPlanApi():createLiveDayPlanApi();
 return cached;
}
/** Tests only: pass null to clear an injected adapter. */
export function setDayPlanApiForTests(api:DayPlanApi|null):void{cached=api;}
