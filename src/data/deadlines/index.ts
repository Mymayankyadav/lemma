// N56.1: stable module facade. N56.2 replaces the live placeholder with
// the owner-RLS and deadline_command RPC adapter without changing screens.
import {getMode} from '../mode';
import type {DeadlineApi} from './contract';
import {createDemoDeadlineApi} from './demo';
import {createLiveDeadlineApi} from './live';
export type * from './contract';
let cached:DeadlineApi|null=null;
export function getDeadlineApi():DeadlineApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoDeadlineApi():createLiveDeadlineApi();
 return cached;
}
/** Tests only: provide a fake module; null resets the cache. */
export function setDeadlineApiForTests(api:DeadlineApi|null):void{cached=api}
