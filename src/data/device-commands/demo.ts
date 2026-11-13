import type {DeviceCommandApi} from './contract';
/** Demo has no account and no chat: nothing registers and nothing arrives. */
export function createDemoDeviceCommandApi():DeviceCommandApi{
 return {mode:'demo',register:async()=>null,pending:async()=>[],report:async()=>undefined,subscribe:()=>()=>undefined};
}
