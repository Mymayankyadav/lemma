import {getDemoProfile,getMode} from '../mode';
import type {GoalApi} from './contract';
import {createDemoGoalApi} from './demo';
import {createLiveGoalApi} from './live';
export type * from './contract';
let cached:{api:GoalApi;firstUse:boolean}|null=null;
let testApi:GoalApi|null=null;
export function getGoalApi():GoalApi {
 const mode=getMode();
 if(testApi?.mode===mode)return testApi;
 const firstUse=mode==='demo'&&getDemoProfile()==='first-use';
 if(!cached||cached.api.mode!==mode||cached.firstUse!==firstUse)
  cached={api:mode==='demo'?createDemoGoalApi(firstUse):createLiveGoalApi(),firstUse};
 return cached.api;
}
/** Tests only: inject an adapter, null clears the cache. */
export function setGoalApiForTests(api:GoalApi|null):void{testApi=api;cached=null;}
