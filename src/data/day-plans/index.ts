// N60.2: mode-aware day-plan facade, with explicit test injection.
import {getMode} from '../mode';
import type {DayPlanApi} from './contract';
import {createDemoDayPlanApi} from './demo';
import {createLiveDayPlanApi} from './live';
import {getStudyApi} from '../study';
export type * from './contract';
let cached:DayPlanApi|null=null;
export function getDayPlanApi():DayPlanApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoDayPlanApi(undefined,getStudyApi()):createLiveDayPlanApi();
 return cached;
}
export function setDayPlanApiForTests(api:DayPlanApi|null):void{cached=api}
