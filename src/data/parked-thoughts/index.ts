// Mode-aware parked-thought facade. Demo never imports the live SDK.
import {getMode} from '../mode';
import type {ThoughtApi} from './contract';
import {createDemoThoughtApi} from './demo';
import {createLiveThoughtApi} from './live';

export type * from './contract';
let cached:ThoughtApi|null=null;
export function getThoughtApi():ThoughtApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoThoughtApi():createLiveThoughtApi();
 return cached;
}
export function setThoughtApiForTests(api:ThoughtApi|null):void{cached=api}
