// N63.2 mode-aware proposal-draft facade; no browser-owned identity inputs.
import {getMode} from '../mode';
import type {ProposalDraftApi} from './contract';
import {createDemoProposalDraftApi} from './demo';
import {createLiveProposalDraftApi} from './live';
export type * from './contract';
let cached:ProposalDraftApi|null=null;
export function getProposalDraftApi():ProposalDraftApi{
 const mode=getMode();
 if(!cached||cached.mode!==mode)cached=mode==='demo'
  ?createDemoProposalDraftApi():createLiveProposalDraftApi();
 return cached;
}
/** Tests only: null restores dynamic adapter selection. */
export function setProposalDraftApiForTests(value:ProposalDraftApi|null):void{
 cached=value;
}
