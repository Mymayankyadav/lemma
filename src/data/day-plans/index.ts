// Stable mode-aware N60.2 day-plan contract.
import {getMode} from '../mode';
import type {DayPlanApi} from './contract';
import {createDemoDayPlanApi} from './demo';
import {createLiveDayPlanApi} from './live';
export type * from './contract';
let cached:DayPlanApi|null=null;
export function getDayPlanApi():DayPlanApi {
 const mode=getMode();
 if(!cached||cached.mode!==mode)cached=mode==='demo'?createDemoDayPlanApi():createLiveDayPlanApi();
 return cached;
}
export function setDayPlanApiForTests(api:DayPlanApi|null):void{cached=api}
