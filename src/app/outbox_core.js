/* Lemma portable offline mutation processor.
 * Pure dependency-injected module: works in browser with IndexedDB adapter and
 * in tests with an in-memory adapter. No vendor credentials in this file.
 * Operations are durable before flush() is called, and never discarded on error.
 */
const LemmaOutboxCore = (() => {
  // New IndexedDB operations have a transaction-allocated monotonic sequence.
  // Timestamp/UUID ordering is only a compatibility fallback for old queues.
  const compare = (a, b) => Number.isSafeInteger(a.sequence) && Number.isSafeInteger(b.sequence)
    ? a.sequence - b.sequence
    : (a.enqueuedAt - b.enqueuedAt) || a.id.localeCompare(b.id);
  function isStale(error) {
    return /stale_note_revision|stale_plan_revision/i.test(String(error?.message || error || ''));
  }
  function validateOp(op) {
    if (!op || typeof op.id !== 'string' || !op.id || !['note','review','retraction','plan'].includes(op.kind)) {
      throw new Error('Invalid Lemma outbox operation');
    }
    if (!op.requestId || typeof op.requestId !== 'string') throw new Error('Outbox requires a stable request ID');
  }
  class Processor {
    constructor(storage, transport, notify = () => {}) {
      this.storage = storage;
      this.transport = transport;
      this.notify = notify;
      this.busy = false;
      this.online = true;
      this.stopped = false;
    }
    async enqueue(operation) {
      const op = { state: 'pending', attempts: 0, enqueuedAt: Date.now(), ...operation };
      validateOp(op);
      // Adapter must durably commit this write before resolving.
      await this.storage.put(op);
      this.notify({ type: 'queued', id: op.id });
      return op;
    }
    async pending() {
      return (await this.storage.list()).filter(x => x.state === 'pending' || x.state === 'conflict');
    }
    async resume(opId) {
      const op = await this.storage.get(opId);
      if (op && op.state === 'conflict') {
        op.state = 'pending';
        await this.storage.put(op);
      }
    }
    async flush() {
      if (this.stopped) return { stopped: true };
      if (this.busy) return { busy: true };
      this.busy = true;
      let sent = 0;
      try {
        // Preserve enqueue order: a review must not be sent before its note exists.
        const queue = (await this.storage.list()).sort(compare);
        const blocked = new Set();
        for (const queued of queue) {
          // A preceding note commit may have durably rebased this item.
          const op = await this.storage.get(queued.id);
          if (!op) continue;
          validateOp(op);
          const key = op.kind === 'plan' ? 'plan:' + op.entityId : 'note:' + op.entityId;
          if (op.state === 'conflict') { blocked.add(key); continue; }
          if (op.state !== 'pending' || blocked.has(key)) continue;
          if (!this.online || this.stopped) break;
          try {
            // Persist before the request: a timeout does not prove the server
            // rejected it, so Undo must never simply remove this operation.
            if (typeof this.storage.markAttempt === 'function') {
              await this.storage.markAttempt(op.id);
              op.attempted = true;
            }
            if (this.stopped) break;
            const result = await this.transport.send(op);
            // The server accepted the operation. A delete failure must not cause
            // a duplicate effect: retrying uses the SAME requestId.
            if (typeof this.storage.ack === 'function') await this.storage.ack(op, result);
            else await this.storage.delete(op.id);
            sent++;
            this.notify({ type: 'ack', id: op.id, result });
          } catch (err) {
            if (isStale(err)) {
              await this.storage.put({ ...op, state: 'conflict', lastError: String(err.message || err), attempts: op.attempts + 1 });
              blocked.add(key);
              this.notify({ type: 'conflict', id: op.id, entityId: op.entityId });
              continue; // Other unrelated notes may still sync.
            }
            if (/not_authenticated|jwt|unauthorized|permission denied/i.test(String(err.message || err))) {
              this.notify({ type: 'auth-required', id: op.id });
              break;
            }
            await this.storage.put({ ...op, attempts: op.attempts + 1, lastError: String(err.message || err) });
            this.notify({ type: 'retry', id: op.id });
            break; // Connection or server fault: stop for this attempt; never busy-loop.
          }
        }
        return { sent, remaining: (await this.pending()).length };
      } finally { this.busy = false; }
    }
  }
  return { Processor, isStale, validateOp, compare };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaOutboxCore;

