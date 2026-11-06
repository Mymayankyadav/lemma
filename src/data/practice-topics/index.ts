import {getMode} from '../mode';
import {StudyNotImplemented} from '../study/contract';
import type {PracticeTopicApi} from './contract';
import {createDemoPracticeTopicApi} from './demo';
export type * from './contract';

const unsupported=(name:string)=>async():Promise<never>=>{throw new StudyNotImplemented('live',name)};
/** The live RPC adapter is added by N57.2; never write demo data in live mode. */
const live:PracticeTopicApi={
  mode:'live',listTopics:unsupported('listTopics'),getTopic:unsupported('getTopic'),
  listEvents:unsupported('listEvents'),createTopic:unsupported('createTopic'),
  updateTopic:unsupported('updateTopic'),archiveTopic:unsupported('archiveTopic'),
  restoreTopic:unsupported('restoreTopic'),deleteTopic:unsupported('deleteTopic'),
  recordPractice:unsupported('recordPractice'),voidPracticeEvent:unsupported('voidPracticeEvent')
};
let instance:PracticeTopicApi|null=null;
export function getPracticeTopicApi():PracticeTopicApi{
  const mode=getMode();
  if(!instance||instance.mode!==mode)
    instance=mode==='demo'?createDemoPracticeTopicApi():live;
  return instance;
}
/** Replace the adapter in tests, or reset with null. */
export function setPracticeTopicApiForTests(api:PracticeTopicApi|null){instance=api;}
