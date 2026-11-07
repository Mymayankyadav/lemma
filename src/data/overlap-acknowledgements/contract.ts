// N61.1: typed, owner-bound overlap acknowledgement data contract.
// N61.2 supplies isolated demo persistence and the owner-RLS live RPC.
import type {StudyReceipt} from '../study/contract';

export type OverlapParticipantKind='block'|'entry';
export type OverlapDisposition='keep_both'|'attribute_to';
export interface OverlapParticipant {
  kind:OverlapParticipantKind;
  id:string;
  version:number;
}
export type OverlapChoice=Pick<OverlapParticipant,'kind'|'id'>;

export interface NewOverlapAcknowledgement {
  participants:OverlapParticipant[];
  /** Absolute instants, not civil dates. */
  startsAt:string;
  endsAt:string;
  reason?:string|null;
  disposition:OverlapDisposition;
  attributedTo?:OverlapChoice|null;
}
export type OverlapPatch=Partial<NewOverlapAcknowledgement>;
export interface ValidatedOverlap {
  participants:OverlapParticipant[];
  startsAt:string;
  endsAt:string;
  reason:string|null;
  disposition:OverlapDisposition;
  attributedTo:OverlapChoice|null;
}
export interface OverlapAcknowledgement extends ValidatedOverlap {
  id:string;
  version:number;
  source:'app'|'mcp'|'worker';
  createdAt:string;
  updatedAt:string;
  /** Derived from current versions of all owner-visible participants. */
  stale:boolean;
}
export interface OverlapQuery {
  from?:string;
  to?:string;
  stale?:boolean;
  limit?:number;
  cursor?:string|null;
}
export interface OverlapPage<T> {
  items:T[];
  total:number;
  nextCursor:string|null;
}
export interface OverlapApi {
  readonly mode:'demo'|'live';
  listAcknowledgements(query?:OverlapQuery):Promise<OverlapPage<OverlapAcknowledgement>>;
  getAcknowledgement(id:string):Promise<OverlapAcknowledgement|null>;
  createAcknowledgement(input:NewOverlapAcknowledgement):Promise<StudyReceipt<OverlapAcknowledgement>>;
  updateAcknowledgement(id:string,expectedVersion:number,patch:OverlapPatch):Promise<StudyReceipt<OverlapAcknowledgement>>;
  deleteAcknowledgement(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
}
export class OverlapError extends Error {
  constructor(public readonly code:'invalid'|'conflict'|'not_found',message:string){
    super(message);this.name='OverlapError';
  }
}
