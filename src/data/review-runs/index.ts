// N62.2: stable mode-aware facade for durable review runs.
import {getMode} from '../mode';
import type {ReviewRunApi} from './contract';
import {createDemoReviewRunApi} from './demo';
import {createLiveReviewRunApi} from './live';

export type * from './contract';
let cached:ReviewRunApi|null=null;
export function getReviewRunApi():ReviewRunApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoReviewRunApi():createLiveReviewRunApi();
 return cached;
}
/** Test-only override; null resets the current adapter. */
export function setReviewRunApiForTests(api:ReviewRunApi|null):void{cached=api}
