import {describe, expect, it} from 'vitest';
import {ingestEvidence, type EvidenceIngressStore, type EvidenceIngressTx, type EvidenceSubmission} from '../../../src/lib/evidence/ingress';
import {replayEvidence, type EvidenceEvent} from '../../../src/lib/evidence/replay';

const at = (day: number) => `2026-11-${day}T09:00:00Z`;
const submit: EvidenceSubmission = {
  operationId: '2c2867b2-18b3-43ab-a98a-dbb2f33872d0', targetId: 'target-a', expectedVersion: 1,
  event: {kind: 'record', eventId: 'event-1', lineageId: 'lineage-1', revision: 1,
    occurredAt: at(17), reportedAt: at(18), payload: {score: 1}},
};
const otherOperation = 'ec8e3ae3-3e82-4c83-8901-7a4d33575bdd';
type Row = {event: EvidenceEvent; targetId: string};
type Saved = NonNullable<Awaited<ReturnType<EvidenceIngressTx['readReceipt']>>>;

function fake() {
  let events: Row[] = [], receipts = new Map<string, Saved>();
  let queue = Promise.resolve();
  const state = {owner: 'owner-a', version: 1, now: at(19), rejectSave: false, authorizations: 0};
  const store: EvidenceIngressStore = {
    transact<T>(run: (tx: EvidenceIngressTx) => Promise<T>): Promise<T> {
      const result = queue.then(async () => {
        const pendingEvents = [...events], pendingReceipts = new Map(receipts);
        const tx: EvidenceIngressTx = {
          authorize: async target => {
            state.authorizations++;
            return target === state.owner.replace('owner', 'target')
              ? {ownerId: state.owner, source: 'trusted-service'} : null;
          },
          lockOperation: async () => {}, lockEvidence: async () => {},
          readReceipt: async (owner, id) => pendingReceipts.get(owner + ':' + id) ?? null,
          readEvent: async (owner, id) => pendingEvents.find(e =>
            e.event.ownerId === owner && e.event.eventId === id) ?? null,
          readLineage: async (scope, id, revision) => pendingEvents.find(({event: e}) =>
            e.ownerId === scope.ownerId && e.source === scope.source &&
            e.lineageId === id && e.revision === revision)?.event ?? null,
          assertWriteAllowed: async (_scope, _target, version) => {
            if (version !== state.version) throw Error('stale target');
          },
          acceptedAt: () => state.now,
          append: async (targetId, event) => { pendingEvents.push({event, targetId}); },
          saveReceipt: async (owner, id, receipt) => {
            if (state.rejectSave) throw Error('receipt write failed');
            pendingReceipts.set(owner + ':' + id, receipt);
          },
        };
        const value = await run(tx);
        events = pendingEvents;
        receipts = pendingReceipts;
        return value;
      });
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
  return {store, state, events: () => events.map(e => e.event), receipts: () => receipts.size};
}

describe('evidence ingress reference transaction', () => {
  it('reuses the exact durable result before mutable version checks but after owner authorization', async () => {
    const db = fake();
    const [a, b] = await Promise.all([ingestEvidence(db.store, submit), ingestEvidence(db.store, submit)]);
    db.state.version = 2;
    expect(await ingestEvidence(db.store, submit)).toEqual(a);
    expect(a).toEqual(b);
    expect(db.receipts()).toBe(1);
    expect(db.events()).toHaveLength(1);
    expect(db.state.authorizations).toBe(3);
    db.state.owner = 'owner-b';
    await expect(ingestEvidence(db.store, submit)).rejects.toThrow('not-authorized');
  });

  it('uses the authenticated owner and authoritative clock, not extra body fields', async () => {
    const db = fake();
    const spoofed = {...submit, event: {...submit.event, ownerId: 'owner-b', source: 'client',
      knownAt: at(17)}};
    const receipt = await ingestEvidence(db.store, spoofed);
    const laterDuplicate = {...submit, operationId: otherOperation};
    db.state.now = at(20);
    expect(await ingestEvidence(db.store, laterDuplicate)).toEqual({...receipt, operationId: otherOperation});
    const events = db.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({source: 'trusted-service', ownerId: 'owner-a', knownAt: at(19)});
    expect(replayEvidence('owner-a', events, at(18)).active).toEqual([]);
    expect(replayEvidence('owner-a', events, at(19)).active).toHaveLength(1);
  });

  it('separates operation reuse, immutable event reuse and conflicting revisions', async () => {
    const db = fake();
    await ingestEvidence(db.store, submit);
    const changed = {...submit, event: {...submit.event, kind: 'record' as const, payload: {score: 0}}};
    await expect(ingestEvidence(db.store, changed)).rejects.toThrow('operation-conflict');
    await expect(ingestEvidence(db.store, {...changed, operationId: otherOperation})).rejects.toThrow('event-id-conflict');
    await expect(ingestEvidence(db.store, {...submit, operationId: otherOperation,
      event: {...submit.event, eventId: 'new-event'}})).rejects.toThrow('revision-conflict');
    expect(db.events()).toHaveLength(1);
    expect(db.receipts()).toBe(1);
  });

  it('leaves no event or receipt on stale versions or an aborted transaction', async () => {
    const db = fake();
    db.state.version = 2;
    await expect(ingestEvidence(db.store, submit)).rejects.toThrow('stale target');
    db.state.version = 1;
    db.state.rejectSave = true;
    await expect(ingestEvidence(db.store, submit)).rejects.toThrow('receipt write failed');
    expect(db.events()).toEqual([]);
    expect(db.receipts()).toBe(0);
  });
});
