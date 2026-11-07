// N83 mode-aware v6 run transport. Demo stays isolated from Supabase.
import {getMode} from '../../../data/mode';
import type {ReviewItem} from '../../../data/types';
import {startDurableRun,readDurableRun,resumeDurableRun,
 pauseDurableRun,unpauseDurableRun,advanceGradedRun,advanceStaleRun,
 type StartRunInput,type DurableRun} from './transport';
import {demoStart,demoRead,demoResume,demoGrade,demoSkip,
 demoPause,demoUnpause} from './demo';
export type {DurableRun};
export async function currentSettingsVersion():Promise<number>{
 if(getMode()==='demo')return 1;
 const c=(await import('../../../data/live/client')).liveClient();
 const result=await c.from('settings').select('version').maybeSingle();
 if(result.error||!result.data||!Number.isSafeInteger(result.data.version)||
  result.data.version<1)throw Error('Could not confirm current settings version');
 return result.data.version;
}
export async function cardVersion(id:string):Promise<number|null>{
 if(getMode()==='demo')return null;
 const c=(await import('../../../data/live/client')).liveClient();
 const result=await c.from('cards').select('version').eq('id',id).maybeSingle();
 if(result.error)throw Error(result.error.message);
 return result.data?Number(result.data.version):null;
}
export function startRun(input:StartRunInput,selected:ReviewItem[]):Promise<DurableRun>{
 return getMode()==='demo'?Promise.resolve(demoStart(input,selected)):startDurableRun(input);
}
export function getRun(id:string):Promise<DurableRun|null>{
 return getMode()==='demo'?Promise.resolve(demoRead(id)):readDurableRun(id);
}
export function resumeRun():Promise<DurableRun|null>{
 return getMode()==='demo'?Promise.resolve(demoResume()):resumeDurableRun();
}
export function pauseRun(r:DurableRun):Promise<DurableRun>{
 return getMode()==='demo'?Promise.resolve(demoPause(r.id,r.version)):
  pauseDurableRun(r.id,r.version);
}
export function unpauseRun(r:DurableRun):Promise<DurableRun>{
 return getMode()==='demo'?Promise.resolve(demoUnpause(r.id,r.version)):
  unpauseDurableRun(r.id,r.version);
}
export function advanceGrade(r:DurableRun,itemId:string,reviewId:number):Promise<DurableRun>{
 return getMode()==='demo'?Promise.resolve(demoGrade(r.id,r.version,itemId,reviewId)):
  advanceGradedRun(r.id,r.version,itemId,reviewId);
}
export function advanceSkip(r:DurableRun,itemId:string,reason:string):Promise<DurableRun>{
 return getMode()==='demo'?Promise.resolve(demoSkip(r.id,r.version,itemId,reason)):
  advanceStaleRun(r.id,r.version,itemId,reason);
}
