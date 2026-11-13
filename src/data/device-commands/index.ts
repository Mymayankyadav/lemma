// Mode-aware facade. Demo never imports the live SDK.
import {getMode} from '../mode';
import type {DeviceCommandApi} from './contract';
import {createDemoDeviceCommandApi} from './demo';
import {createLiveDeviceCommandApi} from './live';

export type * from './contract';
let cached:DeviceCommandApi|null=null;
export function getDeviceCommandApi():DeviceCommandApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)cached=mode==='demo'?createDemoDeviceCommandApi():createLiveDeviceCommandApi();
 return cached;
}
export function setDeviceCommandApiForTests(api:DeviceCommandApi|null):void{cached=api}
