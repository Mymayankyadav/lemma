// Stable study goals facade: owner-scoped live RPC and isolated demo records.
import {getMode} from '../mode';
import type {GoalApi} from './contract';
import {createDemoGoalApi} from './demo';
import {createLiveGoalApi} from './live';
export type * from './contract';
let cached:GoalApi|null=null;
export function getGoalApi():GoalApi {
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoGoalApi():createLiveGoalApi();
 return cached;
}
/** Tests only: inject an adapter, null clears the cache. */
export function setGoalApiForTests(api:GoalApi|null):void{cached=api}
