// N61.2.2.2: stable mode-aware owner API. Tests may inject a complete fake.
import {getMode} from '../mode';
import type {OverlapApi} from './contract';
import {createDemoOverlapApi} from './demo';
import {createLiveOverlapApi} from './live';
export type * from './contract';
let cached:OverlapApi|null=null;
export function getOverlapApi():OverlapApi{
  const mode=getMode();
  if(!cached||cached.mode!==mode)
    cached=mode==='demo'?createDemoOverlapApi():createLiveOverlapApi(true);
  return cached;
}
/** Tests only. Pass null to restore the active-mode adapter. */
export function setOverlapApiForTests(api:OverlapApi|null):void{cached=api;}
