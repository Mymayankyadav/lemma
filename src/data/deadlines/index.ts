import {getMode} from '../mode';
import type {DeadlineApi} from './contract';
import {createDemoDeadlineApi} from './demo';
import {createLiveDeadlineApi} from './live';

export type * from './contract';
let cached:DeadlineApi|null=null;
export function getDeadlineApi():DeadlineApi {
 const mode=getMode();
 if(!cached||cached.mode!==mode)cached=mode==='demo'?createDemoDeadlineApi():createLiveDeadlineApi();
 return cached;
}
/** Test-only injection (null resets). */
export function setDeadlineApiForTests(api:DeadlineApi|null):void {cached=api;}
