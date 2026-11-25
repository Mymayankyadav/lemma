import type {WritingAidPool} from '../engine';
import type {WritingAidModel} from '../learning';
import type {WritingAidRequest} from '../policy';
import {snapshotKeyTouches} from './ngramSpatial';
import type {ComponentReply, NgramReply, NgramRequest} from './ngram.worker';

const STARTUP_TIMEOUT_MS = 18_000;
const REQUEST_TIMEOUT_MS = 500;

type Diagnostics = Readonly<{dropped: number; failures: number; timeouts: number; requests: number}>;
type Reply = {pool: WritingAidPool; computeMs: number; elapsedMs: number; assetSha256?: string;
  subjectAssetSha256?: string} | null | 'unavailable';
type Waiter = {request: NgramRequest; resolve: (reply: Reply) => void; cancelled?: boolean; startedAt: number};

export interface NgramClient {
  predict: (request: WritingAidRequest, model?: WritingAidModel) => Promise<Reply>;
  components: (word: string, request: WritingAidRequest) => Promise<ComponentReply | undefined>;
  cancel: () => void;
  close: () => void;
  diagnostics: () => Diagnostics;
}

export function createNgramClient(): NgramClient | undefined {
  if (typeof Worker === 'undefined') return;
  let worker: Worker;
  try {worker = new Worker(new URL('./ngram.worker.ts', import.meta.url), {type: 'module'});}
  catch {return;}
  let id = 0, unavailable = false, warm = false;
  const stats = {dropped: 0, failures: 0, timeouts: 0, requests: 0};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Waiter | undefined, queued: Waiter | undefined;
  let componentId = 0;
  const componentWaiters = new Map<number, (reply?: ComponentReply) => void>();
  function close() {
    if (unavailable) return;
    unavailable = true;
    clearTimeout(timer);
    worker.terminate();
    for (const resolve of componentWaiters.values()) resolve();
    componentWaiters.clear();
    active?.resolve('unavailable');
    queued?.resolve('unavailable');
    active = undefined;
    queued = undefined;
  }
  function fail() {
    if (!unavailable) stats.failures++;
    close();
  }
  function send() {
    if (active || !queued || unavailable) return;
    active = queued;
    queued = undefined;
    stats.requests++;
    timer = setTimeout(() => {stats.timeouts++; fail();}, warm ? REQUEST_TIMEOUT_MS : STARTUP_TIMEOUT_MS);
    try {worker.postMessage(active.request);}
    catch {fail();}
  }
  worker.addEventListener('error', fail);
  worker.addEventListener('messageerror', fail);
  worker.addEventListener('message', ({data}: MessageEvent<NgramReply | ComponentReply>) => {
    if ('componentId' in data) {
      componentWaiters.get(data.componentId)?.(data);
      return;
    }
    if (!active || active.request.id !== data.id) return;
    clearTimeout(timer);
    const waiter = active;
    active = undefined;
    if ('failed' in data) {waiter.resolve('unavailable'); fail(); return;}
    warm = true;
    if (!waiter.cancelled) {
      const snapshot = waiter.request.request;
      waiter.resolve({pool: {
        trace: data.pool.trace, words: data.pool.words.map(fields => ({...fields, snapshot})),
        edit: data.pool.edit.map(fields => ({...fields, snapshot})),
        ghost: data.pool.ghost.map(fields => ({...fields, snapshot})),
      }, computeMs: data.computeMs, elapsedMs: performance.now() - waiter.startedAt, assetSha256: data.assetSha256,
      subjectAssetSha256: data.subjectAssetSha256});
    }
    send();
  });
  return {
    predict(request, model) {
      if (unavailable) return Promise.resolve('unavailable');
      return new Promise(resolve => {
        if (queued) {stats.dropped++; queued.resolve(null);}
        queued = {startedAt: performance.now(), request: {id: ++id, request, model, touches: snapshotKeyTouches(request.cursor.text, request.cursor.end)}, resolve};
        send();
      });
    },
    components(word, request) {
      if (unavailable || componentWaiters.size >= 8) return Promise.resolve(undefined);
      const next = ++componentId;
      return new Promise(resolve => {
        const finish = (reply?: ComponentReply) => {
          componentWaiters.delete(next);
          clearTimeout(timer);
          resolve(reply);
        };
        const timer = setTimeout(finish, 300);
        componentWaiters.set(next, finish);
        worker.postMessage({componentId: next, word, revision: request.target.editorRevision, cursorEnd: request.cursor.end});
      });
    },
    cancel() {
      if (queued) {stats.dropped++; queued.resolve(null); queued = undefined;}
      if (active && !active.cancelled) {stats.dropped++; active.cancelled = true; active.resolve(null);}
    },
    close,
    diagnostics: () => ({...stats}),
  };
}
