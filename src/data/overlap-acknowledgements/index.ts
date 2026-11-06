// Mode-scoped v6 overlap acknowledgements. No live-to-demo fallback.
import {getMode} from '../mode';
import type {OverlapAcknowledgementApi} from './contract';
import {createDemoOverlapAcknowledgementApi} from './demo';
export type * from './contract';

const notYet=(method:string)=>async():Promise<never>=>{
  throw new Error('Live overlap acknowledgements require N61.2: '+method);
};
const live:OverlapAcknowledgementApi={
  mode:'live',
  listAcknowledgements:notYet('listAcknowledgements'),
  getAcknowledgement:notYet('getAcknowledgement'),
  findApplicableOverlap:notYet('findApplicableOverlap'),
  createAcknowledgement:notYet('createAcknowledgement'),
  updateAcknowledgement:notYet('updateAcknowledgement'),
  deleteAcknowledgement:notYet('deleteAcknowledgement'),
};
let current:OverlapAcknowledgementApi|null=null;
export function getOverlapAcknowledgementApi():OverlapAcknowledgementApi{
  const mode=getMode();
  if(!current||current.mode!==mode)
    current=mode==='demo'?createDemoOverlapAcknowledgementApi():live;
  return current;
}
/** Tests can inject a fake API; null resets mode resolution. */
export function setOverlapAcknowledgementApiForTests(api:OverlapAcknowledgementApi|null):void{
  current=api;
}
