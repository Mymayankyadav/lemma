import {getMode} from '../mode';
import type {StudyGoalApi} from './contract';
import {createDemoStudyGoalApi} from './demo';
import {createLiveStudyGoalApi} from './live';
export type * from './contract';
let cached:StudyGoalApi|null=null;
export function getStudyGoalApi():StudyGoalApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)cached=mode==='demo'?createDemoStudyGoalApi():createLiveStudyGoalApi();
 return cached;
}
export function setStudyGoalApiForTests(api:StudyGoalApi|null):void{cached=api;}
