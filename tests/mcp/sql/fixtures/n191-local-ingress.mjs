// Integration-only server candidate; no network, deployed RPC, or grant changes.
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';

export async function checkLocalIngress(db, {owner, other, project, precedingReceiptId, operationId}) {
  const {ingestEvidence} = await tsImport('../../../../src/lib/evidence/ingress.ts', import.meta.url);
  const {replayEvidence} = await tsImport('../../../../src/lib/evidence/replay.ts', import.meta.url);
  const occurredAt = '2020-01-01T10:00:00Z', reportedAt = '2020-01-02T10:00:00Z';
  const initialVersion = (await db.query('select version from public.projects where user_id=$1 and id=$2',
    [owner, project])).rows[0].version;
  const input = {
    operationId: operationId(11), targetId: project, expectedVersion: initialVersion,
    event: {kind: 'record', eventId: 'n191-event', lineageId: 'n191-lineage', revision: 1,
      occurredAt, reportedAt, payload: {score: 1}},
  };

  // In a service adapter this closure is bound to the verified auth context, not JSON.
  function store(actor, {failBeforeReceipt = false} = {}) {
    return {
      transact: run => db.transaction(async tx => {
        const rows = async (sql, values = []) => (await tx.query(sql, values)).rows;
        const lock = key => rows('select pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
        let acceptedAt;
        return run({
          async authorize(target) {
            const found = await rows('select 1 from public.projects where user_id=$1 and id=$2', [actor, target]);
            return found.length ? {ownerId: actor, source: 'n191-fixture'} : null;
          },
          lockOperation: (uid, op) => lock(uid + ':' + op),
          async readReceipt(uid, op) {
            const first = (await rows('select resource,result from public.command_receipts where user_id=$1 and operation_id=$2',
              [uid, op]))[0];
            return first ? {resource: first.resource, requestIdentity: first.result._request,
              outcome: first.result.outcome} : null;
          },
          async lockEvidence(scope, id, lineage) {
            for (const key of [JSON.stringify(['n191-event', scope.ownerId, id]),
              JSON.stringify(['n191-lineage', scope.ownerId, scope.source, lineage])].sort()) {
              await lock(key);
            }
          },
          async readEvent(uid, id) {
            const row = (await rows(`select project_id as "targetId",ctx->'n191Fixture' as event
              from public.evidence where user_id=$1 and ctx->'n191Fixture'->>'eventId'=$2`, [uid, id]))[0];
            return row ?? null;
          },
          async readLineage(scope, lineage, revision) {
            const row = (await rows(`select ctx->'n191Fixture' as event from public.evidence
              where user_id=$1 and ctx->'n191Fixture'->>'source'=$2 and
                ctx->'n191Fixture'->>'lineageId'=$3 and ctx->'n191Fixture'->>'revision'=$4`,
            [scope.ownerId, scope.source, lineage, String(revision)]))[0];
            return row?.event ?? null;
          },
          async assertWriteAllowed(scope, target, expected, event) {
            const row = (await rows('select version from public.projects where user_id=$1 and id=$2 for update',
              [scope.ownerId, target]))[0];
            if (row?.version !== expected) throw Error('stale target');
            if (event.kind !== 'record' || ![0, 1].includes(event.payload?.score)) {
              throw Error('unsupported fixture event');
            }
            acceptedAt = (await rows(`select to_char(clock_timestamp() at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at`))[0].at;
          },
          acceptedAt: () => acceptedAt,
          async append(target, event) {
            // A namespaced fixture payload preserves the unshipped event fields
            // without DDL. It is not the production evidence-column mapping.
            await rows(`insert into public.evidence(user_id,project_id,occurred_at,level,outcome,origin,ctx)
              values ($1,$2,$3,'recall',$4,'user',$5::jsonb)`,
            [event.ownerId, target, event.occurredAt, event.payload.score ? 'pass' : 'fail',
              JSON.stringify({n191Fixture: event})]);
          },
          async saveReceipt(uid, op, saved) {
            if (failBeforeReceipt) throw Error('injected receipt failure');
            await rows(`insert into public.command_receipts(user_id,operation_id,resource,result)
              values ($1,$2,$3,$4::jsonb)`, [uid, op, saved.resource,
              JSON.stringify({_request: saved.requestIdentity, outcome: saved.outcome})]);
          },
        });
      }),
    };
  }

  const facts = async () => (await db.query(`select ctx->'n191Fixture' as event from public.evidence
    where user_id=$1 and ctx ? 'n191Fixture'`, [owner])).rows.map(row => row.event);
  const journal = async () => (await db.query(`select count(*)::int n from public.action_changes c
    join public.actions a on a.no=c.action_no where a.user_id=$1 and c.table_name='evidence'`, [owner])).rows[0].n;
  const before = await journal();
  const [accepted, retry] = await Promise.all([ingestEvidence(store(owner), input), ingestEvidence(store(owner), input)]);
  assert.deepEqual(retry, accepted);
  assert.equal((await facts()).length, 1);
  assert.equal(await journal(), before + 1);
  const duplicateNewOperation = await ingestEvidence(store(owner), {...input, operationId: operationId(12)});
  assert.equal(duplicateNewOperation.knownAt, accepted.knownAt);
  assert.equal((await facts()).length, 1);
  assert.equal(await journal(), before + 1);
  assert.equal(replayEvidence(owner, await facts(), reportedAt).active.length, 0);
  assert.equal(replayEvidence(owner, await facts(), accepted.knownAt).active.length, 1);
  await assert.rejects(ingestEvidence(store(other), input), /not-authorized/);
  await assert.rejects(ingestEvidence(store(owner), {...input, operationId: precedingReceiptId}), /operation-conflict/);
  await assert.rejects(ingestEvidence(store(owner), {...input, event: {...input.event, payload: {score: 0}}}),
    /operation-conflict/);
  await assert.rejects(ingestEvidence(store(owner), {...input, operationId: operationId(13), expectedVersion: initialVersion + 1}),
    /stale target/);
  const failing = {...input, operationId: operationId(14),
    event: {...input.event, eventId: 'rollback-event', lineageId: 'rollback-lineage'}};
  await assert.rejects(ingestEvidence(store(owner, {failBeforeReceipt: true}), failing), /injected receipt failure/);
  assert.equal((await facts()).length, 1);
  assert.equal(await journal(), before + 1);
  assert.equal((await db.query('select count(*)::int n from public.command_receipts where user_id=$1 and operation_id=$2',
    [owner, failing.operationId])).rows[0].n, 0);
  console.log('N191 local server adapter: repeat delivery, authorization, cutoff and atomic rollback passed');
}
