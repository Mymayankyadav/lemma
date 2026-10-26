/* Lemma durable outbox processor (injected persistence and transport).
 * The app stores operations locally before calling flush(); no operation is
 * discarded due to a failed network request. */
const LemmaOutboxCore = (() => {
  const isStale = e => /stale_note_revision|stale_plan_revision/i.test(String(e?.message || e || ''));
  function validateOp(op) {
    if (!op || typeof op.id !== 'string' || !op.id || !['note','review','plan'].includes(op.kind))
      throw new Error('Invalid Lemma outbox operation');
    if (!op.requestId || typeof op.requestId !== 'string')
      throw new Error('Outbox requires a stable request ID');
  }
  class Processor {
    constructor(storage, transport, notify = () => {}) {
      this.storage = storage;
      this.transport = transport;
      this.notify = notify;
      this.busy = false;
      this.online = true;
    }
    async enqueue(operation) {
      const op = { state: 'pending', attempts: 0, enqueuedAt: Date.now(), ...operation };
      validateOp(op);
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
      if (this.busy) return { busy: true };
      this.busy = true;
      let sent = 0;
      try {
        const queue = (await this.storage.list()).sort((a, b) =>
          (a.enqueuedAt - b.enqueuedAt) || ((a.kind === 'note' ? 0 : 1) - (b.kind === 'note' ? 0 : 1)) || a.id.localeCompare(b.id));
        const blocked = new Set();
        for (const queued of queue) {
          const op = await this.storage.get(queued.id);
          if (!op) continue;
          validateOp(op);
          const key = op.kind === 'plan' ? 'plan:' + op.entityId : 'note:' + op.entityId;
          if (op.state === 'conflict') { blocked.add(key); continue; }
          if (op.state !== 'pending' || blocked.has(key)) continue;
          if (!this.online) break;
          try {
            const result = await this.transport.send(op);
            if (typeof this.storage.ack === 'function') await this.storage.ack(op, result);
            else await this.storage.delete(op.id);
            sent++;
            this.notify({ type: 'ack', id: op.id, result });
          } catch (err) {
            if (isStale(err)) {
              await this.storage.put({ ...op, state: 'conflict',
                lastError: String(err.message || err), attempts: op.attempts + 1 });
              blocked.add(key);
              this.notify({ type: 'conflict', id: op.id, entityId: op.entityId });
              continue;
            }
            if (/not_authenticated|jwt|unauthorized|permission denied/i.test(String(err.message || err))) {
              this.notify({ type: 'auth-required', id: op.id });
              break;
            }
            await this.storage.put({ ...op, attempts: op.attempts + 1,
              lastError: String(err.message || err) });
            this.notify({ type: 'retry', id: op.id });
            break;
          }
        }
        return { sent, remaining: (await this.pending()).length };
      } finally { this.busy = false; }
    }
  }
  return { Processor, isStale, validateOp };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaOutboxCore;
