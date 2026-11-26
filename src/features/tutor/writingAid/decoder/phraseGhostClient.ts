import type {WritingAidRequest} from '../policy';
import type {PhraseGhostReply, PhraseGhostRequest} from './phraseGhost.worker';

export type PhraseGhostWorkerOutcome = PhraseGhostReply | 'expired' | 'superseded' | 'unavailable';
interface Work {
  request: PhraseGhostRequest;
  settle: (outcome: PhraseGhostWorkerOutcome) => void;
  done: boolean;
}

export function createPhraseGhostClient() {
  if (typeof Worker === 'undefined') return;
  let worker: Worker;
  try {worker = new Worker(new URL('./phraseGhost.worker.ts', import.meta.url), {type: 'module'});}
  catch {return;}
  let closed = false, id = 0;
  let active: Work | undefined, queued: Work | undefined;
  function send() {
    if (closed || active || !queued) return;
    const work = queued;
    queued = undefined;
    if (work.done) return;
    active = work;
    try {worker.postMessage(work.request);}
    catch {close();}
  }
  function close() {
    closed = true;
    worker.terminate();
    active?.settle('unavailable');
    queued?.settle('unavailable');
    active = queued = undefined;
  }
  worker.addEventListener('error', close);
  worker.addEventListener('messageerror', close);
  worker.addEventListener('message', ({data}: MessageEvent<PhraseGhostReply>) => {
    if (active?.request.id !== data.id) return;
    active.settle(data);
    active = undefined;
    send();
  });
  return {
    close,
    predict(snapshot: WritingAidRequest, deadline: number) {
      let cancel = () => {};
      const reply = new Promise<PhraseGhostWorkerOutcome>(resolve => {
        if (closed) {resolve('unavailable'); return;}
        const remaining = deadline - (performance.timeOrigin + performance.now());
        if (remaining <= 0) {resolve('expired'); return;}
        const work: Work = {request: {id: ++id, snapshot, deadline}, done: false,
          settle(outcome) {
            if (work.done) return;
            clearTimeout(timer);
            work.done = true;
            resolve(outcome);
          },
        };
        const timer = setTimeout(() => work.settle('expired'), remaining);
        cancel = () => work.settle('superseded');
        queued?.settle('superseded');
        queued = work;
        send();
      });
      return {reply, cancel: () => cancel()};
    },
  };
}
