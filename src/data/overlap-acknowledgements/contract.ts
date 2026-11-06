// N61: An acknowledgement applies to exactly one recorded overlap, never to
// an unrelated conflict or newer versions of either participant.
import type { StudyReceipt } from '../study/contract';

export interface OverlapParticipant {
  kind: 'block' | 'entry';
  id: string;
  version: number;
}
export type OverlapDisposition =
  | { kind: 'keep_both' }
  | { kind: 'attribute_to'; participant: Pick<OverlapParticipant, 'kind'|'id'> };

export interface OverlapWindow {
  /** Inclusive start of the half-open overlap, as an ISO instant. */
  startsAt: string;
  /** Exclusive end of the half-open overlap, as an ISO instant. */
  endsAt: string;
}
export interface OverlapAcknowledgement extends OverlapWindow {
  id: string;
  participants: OverlapParticipant[];
  disposition: OverlapDisposition;
  reason: string|null;
  version: number;
  createdAt: string;
  updatedAt: string;
  source: 'app'|'mcp'|'worker';
}
export interface NewOverlapAcknowledgement extends OverlapWindow {
  participants: OverlapParticipant[];
  disposition: OverlapDisposition;
  reason?: string|null;
}
export type OverlapPatch = Partial<Pick<
  OverlapAcknowledgement,'participants'|'startsAt'|'endsAt'|'disposition'|'reason'
>>;
export interface OverlapQuery {
  limit?: number; // 1–50, default 20
  cursor?: string|null;
  /** Pass the current server-observed versions when checking validity. */
  currentParticipants?: OverlapParticipant[];
}
export interface OverlapView {
  acknowledgement: OverlapAcknowledgement;
  /** Unknown until versions are supplied; stale ones never suppress a conflict. */
  stale: boolean|null;
}
export interface OverlapPage {
  items: OverlapView[];
  total: number;
  nextCursor: string|null;
}
export interface OverlapAcknowledgementApi {
  readonly mode: 'demo'|'live';
  listAcknowledgements(query?: OverlapQuery): Promise<OverlapPage>;
  getAcknowledgement(id: string, currentParticipants?: OverlapParticipant[]): Promise<OverlapView|null>;
  /** Match exact participant identities, versions, and half-open window. */
  findApplicableOverlap(input: OverlapWindow&{participants:OverlapParticipant[]}):Promise<OverlapAcknowledgement|null>;
  createAcknowledgement(input: NewOverlapAcknowledgement):Promise<StudyReceipt<OverlapAcknowledgement>>;
  updateAcknowledgement(id: string, expectedVersion: number, patch: OverlapPatch):Promise<StudyReceipt<OverlapAcknowledgement>>;
  deleteAcknowledgement(id: string, expectedVersion: number):Promise<StudyReceipt<{id:string}>>;
}
