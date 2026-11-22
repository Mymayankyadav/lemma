import type {DecoderCandidate} from './lexicon';
import {isDecoderPrefix, readDecoderCandidates, type DecoderQuery} from './protocol';

export type DecoderWorker = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
export interface WritingDecoderClient {
  query(prefix: string, signal?: AbortSignal): Promise<readonly DecoderCandidate[] | undefined>;
  dispose(): void;
}
interface Pending {
  prefix: string;
  resolve: (value: readonly DecoderCandidate[] | undefined) => void;
  timer: ReturnType<typeof setTimeout>;
  cancel: () => void;
  signal?: AbortSignal;
}

/** One lazy worker per mounted editor; failure is sticky until that editor is remounted. */
export function createWritingDecoderClient(options: {
  createWorker?: () => DecoderWorker; timeoutMs?: number;
} = {}): WritingDecoderClient {
  const createWorker = options.createWorker ?? (() => new Worker(new URL('./writingDecoder.worker.ts', import.meta.url), {type: 'module'}));
  const pending = new Map<number, Pending>();
  const timeoutMs = options.timeoutMs ?? 8000;
  let worker: DecoderWorker | undefined, failed = false, nextId = 0;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  function finishStartup() {
    if (startupTimer !== undefined) clearTimeout(startupTimer);
    startupTimer = undefined;
  }
  function finish(id: number, value?: readonly DecoderCandidate[]) {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    clearTimeout(item.timer);
    item.signal?.removeEventListener('abort', item.cancel);
    item.resolve(value);
  }
  function stop() {
    failed = true;
    finishStartup();
    if (worker) {
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      worker.terminate(); worker = undefined;
    }
    for (const id of pending.keys()) finish(id);
  }
  function start() {
    if (worker) return worker;
    const created = createWorker();
    worker = created;
    // Unlike a request timer, startup remains bounded after its latest query is cancelled.
    // This also covers a stalled module or CacheStorage read before the network deadline starts.
    startupTimer = setTimeout(stop, timeoutMs);
    created.onerror = () => stop();
    created.onmessageerror = () => stop();
    created.onmessage = event => {
      const reply: unknown = event.data;
      if (!reply || typeof reply !== 'object' || !('id' in reply) || typeof reply.id !== 'number' ||
          !Number.isSafeInteger(reply.id) || reply.id < 1 || reply.id > nextId) {stop(); return;}
      // Loading failure belongs to the worker, even when the triggering editor revision was retired.
      if ('type' in reply && reply.type === 'unavailable') {stop(); return;}
      if (!('type' in reply) || reply.type !== 'result' || !('prefix' in reply) || !isDecoderPrefix(reply.prefix) ||
          !('candidates' in reply)) {stop(); return;}
      const candidates = readDecoderCandidates(reply.candidates, reply.prefix);
      if (!candidates) {stop(); return;}
      finishStartup();
      const item = pending.get(reply.id);
      if (!item) return; // A valid retired reply proves readiness, but cannot supply a visible proposal.
      if (reply.prefix !== item.prefix) {stop(); return;}
      finish(reply.id, candidates);
    };
    return created;
  }
  return {
    query(prefix, signal) {
      if (failed || signal?.aborted || !isDecoderPrefix(prefix)) return Promise.resolve(undefined);
      // Only the latest request in this editor can become visible. Bound work while typing/loading.
      for (const id of pending.keys()) finish(id);
      return new Promise(resolve => {
        const id = ++nextId;
        const cancel = () => finish(id);
        const timer = setTimeout(stop, timeoutMs);
        pending.set(id, {prefix, resolve, cancel, timer, signal});
        signal?.addEventListener('abort', cancel, {once: true});
        try {start().postMessage({type: 'query', id, prefix} satisfies DecoderQuery);}
        catch {stop();}
      });
    },
    dispose: stop,
  };
}
