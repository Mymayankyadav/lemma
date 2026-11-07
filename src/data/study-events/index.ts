// N64.2: stable study-event facade, demo by mode without importing Supabase SDK.
import {getMode} from '../mode';
import type {StudyEventApi} from './contract';
import {createDemoStudyEventApi} from './demo';
import {createLiveStudyEventApi} from './live';

export type * from './contract';
let cached:StudyEventApi|null=null;
export function getStudyEventApi():StudyEventApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoStudyEventApi():createLiveStudyEventApi();
 return cached;
}
/** Tests only: provide a fake API; pass null to restore mode selection. */
export function setStudyEventApiForTests(api:StudyEventApi|null):void{cached=api}
