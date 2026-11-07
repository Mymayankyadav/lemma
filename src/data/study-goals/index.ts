// Stable study goals facade. N59.2 wires owner-RLS live RPC without changing screens.
import {getMode} from '../mode';
import type {GoalApi} from './contract';
import {emptyGoalApi} from './contract';
import {createDemoGoalApi} from './demo';
export type * from './contract';
let cached:GoalApi|null=null;
export function getGoalApi():GoalApi {
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoGoalApi():emptyGoalApi('live');
 return cached;
}
/** Tests only: inject an adapter, null clears the cache. */
export function setGoalApiForTests(api:GoalApi|null):void{cached=api}
