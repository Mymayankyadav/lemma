// N60.2: selected data mode; tests may inject a single explicit adapter.
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
export function setDayPlanApiForTests(api:DayPlanApi|null):void{cached=api}
