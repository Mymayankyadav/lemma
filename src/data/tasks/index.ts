// The task API for the current data mode. Screens call getTaskApi(); adapters live in demo.ts and live.ts.
import {getDemoProfile,getMode} from '../mode';
import {authGeneration,authOwner} from '../authBoundary';
import type { TaskApi,TaskRecord } from './contract';
import { createDemoTaskApi } from './demo';
import { createLiveTaskApi } from './live';

export type * from './contract';
type TaskChange={kind:'created';record:TaskRecord}|{kind:'deleted';id:string};
const listeners=new Set<(change:TaskChange)=>void>();
export function onTaskChange(listener:(change:TaskChange)=>void){
 listeners.add(listener);return ()=>{listeners.delete(listener);};
}
function taskScope(){
 return getMode()==='demo'?'demo:'+getDemoProfile():'live:'+authGeneration()+':'+authOwner();
}
function observe(api:TaskApi):TaskApi{
 function publish(owner:string,change:TaskChange){
  if(owner===taskScope())for(const listener of listeners)listener(change);
 }
 return {...api,
  async createTask(input){
   const owner=taskScope();
   const saved=await api.createTask(input);
   publish(owner,{kind:'created',record:saved.record});
   return saved;
  },
  async restoreDeletedTask(task,actionNo){
   const owner=taskScope();
   if(!api.restoreDeletedTask)throw new Error('Task restoration unavailable');
   const record=await api.restoreDeletedTask(task,actionNo);
   publish(owner,{kind:'created',record});
   return record;
  },
  async deleteTask(id,version){
   const owner=taskScope();
   const saved=await api.deleteTask(id,version);
   publish(owner,{kind:'deleted',id:saved.record.id});
   return saved;
  },
 };
}
let cached: TaskApi | null = null;
export function getTaskApi(): TaskApi {
 const mode = getMode();
 if (!cached || cached.mode !== mode) cached = observe(mode === 'demo' ? createDemoTaskApi() : createLiveTaskApi());
 return cached;
}
/** Tests only: use a fake adapter (pass null to reset). */
export function setTaskApiForTests(api: TaskApi | null): void { cached = api; }
