/**
 * N160 (area 28): runs what chat sent to this device. Every command goes through the
 * functions the app's own buttons call (routes, the study API), reports `delivered`
 * before it acts and `applied` or `rejected` (with a reason) after, and never runs
 * once it has expired. Permission prompts stay on the device: nothing here asks
 * for or grants an operating-system permission.
 */
import type {DeviceCommand,DeviceCommandApi} from '../data/device-commands/contract';
import type {StudyApi} from '../data/study/contract';

export const SCREEN_ROUTES:Record<string,string>={
 today:'/',paths:'/projects',review:'/review',calendar:'/calendar',tasks:'/tasks',progress:'/insights',
 log:'/log',focus:'/focus',inbox:'/proposals',settings:'/settings',atlas:'/atlas',cards:'/cards'};
export type Outcome={status:'applied'}|{status:'rejected';reason:string};
export interface RunDeps{
 navigate:(to:string)=>void;
 study:Pick<StudyApi,'activeStudyEntry'|'startStudyEntry'|'pauseStudyEntry'|'resumeStudyEntry'|'breakStudyEntry'|'nextPhase'|'saveStudyEntry'|'discardStudyEntry'>;
 /** Resolve a record the route needs more than an id for. Null when it is not on this account. */
 locate:{path(id:string):Promise<string|null>;checkpoint(id:string):Promise<string|null>};
 changed?:()=>void;
 now?:()=>number;
}
const rejected=(reason:string):Outcome=>({status:'rejected',reason:reason.slice(0,200)});

export async function runDeviceCommand(cmd:DeviceCommand,deps:RunDeps):Promise<Outcome>{
 if((deps.now?.()??Date.now())>=Date.parse(cmd.expiresAt))return rejected('The command expired before this device ran it');
 try{
  if(cmd.kind==='open'){
   const screen=cmd.payload.screen,record=cmd.payload.record as {type?:string;id?:string}|undefined;
   if(typeof screen==='string'){
    const route=SCREEN_ROUTES[screen];
    if(!route)return rejected('This app has no screen called '+screen);
    deps.navigate(route);return {status:'applied'};
   }
   if(record&&typeof record.id==='string'){
    if(record.type==='task'){deps.navigate('/tasks');return {status:'applied'};}
    const route=record.type==='path'?await deps.locate.path(record.id):record.type==='checkpoint'?await deps.locate.checkpoint(record.id):null;
    if(!route)return rejected('That '+(record.type??'record')+' is not on this account');
    deps.navigate(route);return {status:'applied'};
   }
   return rejected('Nothing to open');
  }
  if(cmd.kind==='timer'){
   const action=cmd.payload.action,study=deps.study,active=await study.activeStudyEntry();
   if(action==='start'){
    if(active)return rejected('A timer is already running');
    const intent=typeof cmd.payload.intent==='string'&&cmd.payload.intent.trim()?cmd.payload.intent.trim():'Study from chat';
    await study.startStudyEntry({intent,source:'timer'});
    deps.changed?.();return {status:'applied'};
   }
   if(!active)return rejected('No timer is running');
   const id=active.id,version=active.version;
   if(action==='pause'){if(active.status==='paused')return rejected('The timer is already paused');await study.pauseStudyEntry(id,version);}
   else if(action==='resume'){if(active.status==='running')return rejected('The timer is already running');await study.resumeStudyEntry(id,version);}
   else if(action==='break')await study.breakStudyEntry(id,version);
   else if(action==='next_phase')await study.nextPhase(id,version);
   else if(action==='save')await study.saveStudyEntry(id,version);
   else if(action==='discard')await study.discardStudyEntry(id,version);
   else return rejected('Unknown timer action');
   deps.changed?.();return {status:'applied'};
  }
  return rejected('Unknown command');
 }catch(error){
  return rejected(error instanceof Error&&error.message?error.message:'The device could not run it');
 }
}

/** Fetch, mark delivered, run, report. A failed report is retried by the next fetch only for commands still waiting. */
export async function drainDeviceCommands(api:DeviceCommandApi,deviceId:string,deps:RunDeps):Promise<number>{
 const waiting=await api.pending(deviceId);
 let ran=0;
 for(const cmd of waiting){
  await api.report(cmd.id,'delivered');
  const outcome=await runDeviceCommand(cmd,deps);
  await api.report(cmd.id,outcome.status,outcome.status==='rejected'?outcome.reason:undefined);
  ran++;
 }
 return ran;
}

export function deviceKey(storage:Pick<Storage,'getItem'|'setItem'>=localStorage):string{
 try{
  const stored=storage.getItem('lemma.deviceKey');
  if(stored&&/^[A-Za-z0-9-]{8,64}$/.test(stored))return stored;
  const fresh=crypto.randomUUID();storage.setItem('lemma.deviceKey',fresh);return fresh;
 }catch{return crypto.randomUUID()}
}

/** Registers this device, drains once, then on live changes and every 5 s while visible. Returns the stop function. */
export function startDeviceCommandRunner(api:DeviceCommandApi,deps:RunDeps,
 info:{key:string;label:string;platform:'web'|'android'},opts:{pollMs?:number}={}):()=>void{
 let stopped=false,busy=false,unsubscribe=()=>undefined as void,timer:number|undefined,deviceId:string|null=null;
 const drain=async()=>{
  if(stopped||busy||!deviceId||document.visibilityState==='hidden')return;
  busy=true;
  try{await drainDeviceCommands(api,deviceId,deps)}catch{/* offline or signed out: the next tick tries again */}finally{busy=false}
 };
 api.register(info).then(device=>{
  if(stopped||!device)return;
  deviceId=device.id;
  unsubscribe=api.subscribe(device.id,()=>{void drain()});
  void drain();
  timer=window.setInterval(()=>{void drain()},opts.pollMs??5000);
 }).catch(()=>undefined);
 return ()=>{stopped=true;unsubscribe();if(timer!==undefined)window.clearInterval(timer)};
}
