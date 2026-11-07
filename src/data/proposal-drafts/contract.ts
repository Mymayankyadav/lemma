// N63.1: typed proposal drafts. Live submit is one server command, not approval.
import type {StudyReceipt} from '../study/contract';
export type ProposalDraftStatus='draft'|'saved'|'submitted'|'discarded';
/** Proposal and target versions must both be checked at server submission. */
export interface ProposalBaseVersions {proposal:number;target:number}
export type ProposalEditPayload=Record<string,unknown>;
export interface ProposalDraftRecord {
 id:string;proposalId:string;targetId:string;
 baseVersions:ProposalBaseVersions;payload:ProposalEditPayload;
 draftVersion:number;status:ProposalDraftStatus;
 editedAt:string;createdAt:string;
}
export interface NewProposalDraft {
 proposalId:string;targetId:string;baseVersions:ProposalBaseVersions;
 payload:ProposalEditPayload;
}
export interface ProposalDraftQuery {
 status?:ProposalDraftStatus[];
 proposalId?:string;targetId?:string;
 limit?:number;cursor?:string|null;
}
export interface ProposalDraftPage {
 items:ProposalDraftRecord[];total:number;nextCursor:string|null;
}
export interface ProposalDraftConflict {
 kind:'draft_version'|'source_version';
 /** Current persisted draft, never silently replaced by a stale browser. */
 current:ProposalDraftRecord;
 baseVersions:ProposalBaseVersions;
 /** The attempted full payload, never merged by patch semantics. */
 attemptedPayload:ProposalEditPayload;
 currentSourceVersions?:ProposalBaseVersions;
}
export interface ProposalDraftApi {
 readonly mode:'demo'|'live';
 listDrafts(query?:ProposalDraftQuery):Promise<ProposalDraftPage>;
 getDraft(id:string):Promise<ProposalDraftRecord|null>;
 createDraft(input:NewProposalDraft):Promise<StudyReceipt<ProposalDraftRecord>>;
 /** Replace full edit payload, never a sparse patch; version compare is mandatory. */
 saveDraft(id:string,expectedDraftVersion:number,
  payload:ProposalEditPayload):Promise<StudyReceipt<ProposalDraftRecord>>;
 /** Submit via N49 command, rechecking both base versions before an edit. */
 submitDraft(id:string,expectedDraftVersion:number,
  expectedSources:ProposalBaseVersions):Promise<StudyReceipt<ProposalDraftRecord>>;
 discardDraft(id:string,expectedDraftVersion:number):
  Promise<StudyReceipt<ProposalDraftRecord>>;
}
export class ProposalDraftError extends Error {
 constructor(public readonly code:'invalid'|'conflict'|'not_found',message:string){
  super(message);this.name='ProposalDraftError';
 }
}
