// N160 (area 28): the app side of "chat controls the connected app". The server
// stores short-lived commands for one registered device; this contract is all the
// app needs: announce itself, fetch what is waiting, report each stage.
export type DeviceCommandKind='open'|'timer';
export interface DeviceCommand{
 id:string;kind:DeviceCommandKind;payload:Record<string,unknown>;expiresAt:string;
}
export type DeviceStage='delivered'|'applied'|'rejected';
export interface DeviceCommandApi{
 readonly mode:'live'|'demo';
 /** One row per browser or phone, found again by its own key. Null where there is no account (demo). */
 register(input:{key:string;label:string;platform:'web'|'android'}):Promise<{id:string}|null>;
 /** Commands waiting for this device, oldest first; expired ones are closed by the server. */
 pending(deviceId:string):Promise<DeviceCommand[]>;
 report(id:string,stage:DeviceStage,reason?:string):Promise<void>;
 /** Live delivery: calls back when this device's commands change. Returns the unsubscribe. */
 subscribe(deviceId:string,onChange:()=>void):()=>void;
}
