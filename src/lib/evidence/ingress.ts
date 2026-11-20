import {deduplicateEvidence, EvidenceReplayError, sameEvidenceJson, type EvidenceEvent, type EvidenceJson} from './replay';

type EvidenceDraft = Readonly<{
  eventId: string;
  lineageId: string;
  revision: number;
  occurredAt: string;
  reportedAt: string;
}> & (Readonly<{kind: 'record'; payload: EvidenceJson}> | Readonly<{kind: 'void'}>);

export type EvidenceSubmission = Readonly<{
  operationId: string;
  /** Owner-scoped trusted target lookup, not proof of access or assessment. */
  targetId: string;
  expectedVersion: number;
  event: EvidenceDraft;
}>;

type Scope = Readonly<{ownerId: string; source: string}>;
export type EvidenceReceipt = Readonly<{operationId: string; eventId: string; knownAt: string}>;
type SavedReceipt = Readonly<{resource: string; requestIdentity?: EvidenceJson; outcome: EvidenceReceipt}>;
type AcceptedReceipt = Required<SavedReceipt>;

export type EvidenceIngressTx = {
  /** Use the authenticated actor in this transaction, checking current target/grant access. */
  authorize(targetId: string): Promise<Scope | null>;
  /** Owner-wide operation namespace; read after this lock. */
  lockOperation(ownerId: string, operationId: string): Promise<void>;
  readReceipt(ownerId: string, operationId: string): Promise<SavedReceipt | null>;
  /** Serialize event IDs AND source/lineage revisions across different operations. */
  lockEvidence(scope: Scope, eventId: string, lineageId: string): Promise<void>;
  readEvent(ownerId: string, eventId: string): Promise<{event: EvidenceEvent; targetId: string} | null>;
  readLineage(scope: Scope, lineageId: string, revision: number): Promise<EvidenceEvent | null>;
  /** Check mutable protected links, scope and version under lock before minting knownAt. */
  assertWriteAllowed(scope: Scope, targetId: string, expectedVersion: number, event: EvidenceDraft): Promise<void>;
  acceptedAt(): string;
  append(targetId: string, event: EvidenceEvent): Promise<void>;
  saveReceipt(ownerId: string, operationId: string, receipt: AcceptedReceipt): Promise<void>;
};

/** The production implementation is one server RPC/transaction; rejection must roll
 * back both the append (and its journal) and the receipt. No browser callback adapter. */
export type EvidenceIngressStore = {
  transact<T>(run: (tx: EvidenceIngressTx) => Promise<T>): Promise<T>;
};

const resource = 'evidence';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EvidenceIngressError extends Error {
  constructor(readonly code: 'invalid-command' | 'not-authorized' | 'operation-conflict') {
    super(code);
    this.name = 'EvidenceIngressError';
  }
}

function normalizeDraft(event: EvidenceDraft): EvidenceDraft {
  const {eventId, lineageId, revision, occurredAt, reportedAt} = event;
  const base = {eventId, lineageId, revision, occurredAt, reportedAt};
  if (event.kind === 'record') return {...base, kind: 'record', payload: event.payload};
  if (event.kind === 'void') return {...base, kind: 'void'};
  throw new EvidenceIngressError('invalid-command');
}

/** Pure coordination seam over an explicitly transactional, trusted service port.
 * Never use source, owner or knownAt from the request, including on retries. */
export async function ingestEvidence(store: EvidenceIngressStore, submission: EvidenceSubmission): Promise<EvidenceReceipt> {
  const {operationId: rawId, targetId, expectedVersion} = submission;
  if (typeof rawId !== 'string' || !uuid.test(rawId) || typeof targetId !== 'string' || !targetId.trim() ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new EvidenceIngressError('invalid-command');
  }
  const operationId = rawId.toLowerCase();
  // Snapshot the already-decoded request before awaits so caller edits cannot change identity.
  const event = structuredClone(normalizeDraft(submission.event));
  if (typeof event.eventId !== 'string' || !event.eventId.trim() ||
      typeof event.lineageId !== 'string' || !event.lineageId.trim()) {
    throw new EvidenceIngressError('invalid-command');
  }
  return store.transact(async tx => {
    const scope = await tx.authorize(targetId);
    if (!scope) throw new EvidenceIngressError('not-authorized');
    const {ownerId, source} = scope;
    const requestIdentity: EvidenceJson = {schemaVersion: 1, resource, operationId,
      targetId, expectedVersion, source, event};
    await tx.lockOperation(ownerId, operationId);
    const prior = await tx.readReceipt(ownerId, operationId);
    if (prior) {
      if (prior.resource !== resource || prior.requestIdentity === undefined ||
          !sameEvidenceJson(prior.requestIdentity, requestIdentity)) {
        throw new EvidenceIngressError('operation-conflict');
      }
      return prior.outcome;
    }

    await tx.lockEvidence(scope, event.eventId, event.lineageId);
    const existing = await tx.readEvent(ownerId, event.eventId);
    if (existing && existing.targetId !== targetId) throw new EvidenceReplayError('event-id-conflict');
    await tx.assertWriteAllowed(scope, targetId, expectedVersion, event);
    const input = {...event, ownerId, source, knownAt: existing?.event.knownAt ?? tx.acceptedAt()};
    const atRevision = await tx.readLineage(scope, event.lineageId, event.revision);
    deduplicateEvidence(ownerId, [input, ...(existing ? [existing.event] : []), ...(atRevision ? [atRevision] : [])]);
    if (!existing) await tx.append(targetId, input);
    const outcome = {operationId, eventId: input.eventId, knownAt: input.knownAt};
    await tx.saveReceipt(ownerId, operationId, {resource, requestIdentity, outcome});
    return outcome;
  });
}
