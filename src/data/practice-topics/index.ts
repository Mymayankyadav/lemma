// N57.1 facade; N57.2 replaces the read-only live placeholder with RPC-backed actions.
import {getMode} from '../mode';
import type {PracticeTopicApi} from './contract';
import {emptyPracticeTopicApi} from './contract';
import {createDemoPracticeTopicApi} from './demo';
export type * from './contract';
let cached:PracticeTopicApi|null=null;
/** All v6 callers access the module through this mode-aware, test-injectable API. */
export function getPracticeTopicApi():PracticeTopicApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)
  cached=mode==='demo'?createDemoPracticeTopicApi():emptyPracticeTopicApi('live');
 return cached;
}
export function setPracticeTopicApiForTests(api:PracticeTopicApi|null):void{cached=api}
