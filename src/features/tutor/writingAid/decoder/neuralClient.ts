import {neuralManifest, qualifiedNeuralTier} from './neuralManifest';
import type {NeuralReply, NeuralRequest} from './neural.worker';

export interface NeuralClient {
  predict(request: Omit<NeuralRequest, 'id'>): Promise<NeuralReply | undefined>;
  reset(): void;
  close(): void;
}

export async function createNeuralClient(trial = false, strictTrial = false): Promise<NeuralClient | undefined> {
  if (typeof Worker === 'undefined') return undefined;
  const [primary, large] = await Promise.all([neuralManifest('neural-v2'), neuralManifest('neural-large-v2')]);
  if (!qualifiedNeuralTier(primary, 'wasm', trial) && !qualifiedNeuralTier(primary, 'webgpu', trial) && !qualifiedNeuralTier(large, 'webgpu', trial) &&
      !qualifiedNeuralTier(primary, 'webgpuJspi', trial) && !qualifiedNeuralTier(large, 'webgpuJspi', trial)) return undefined;
  const worker = new Worker(new URL('./neural.worker.ts', import.meta.url), {type: 'module'});
  let id = 0;
  let pending: {id: number; started: number; deadline: number; timer: ReturnType<typeof setTimeout>; finish: (reply?: NeuralReply) => void} | undefined;
  function finish(reply?: NeuralReply) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const resolve = pending.finish;
    const name = reply?.scores?.length || reply?.continuation ? 'lemma.typeahead.neural.scored' : 'lemma.typeahead.neural.dropped';
    performance.measure(name, {start: pending.started, end: performance.now(), detail: {assetSha256: reply?.assetSha256}});
    // Keep an in-memory rolling window for browser measurements.
    const samples = performance.getEntriesByName(name, 'measure');
    if (samples.length > 256) performance.clearMeasures(name);
    pending = undefined;
    resolve(reply);
  }
  worker.onmessage = (event: MessageEvent<NeuralReply>) => {
    const reply = event.data;
    const pendingReply = pending?.id === reply.id ? pending : undefined;
    const arrivedBeforeDeadline = Boolean(pendingReply && Date.now() <= pendingReply.deadline);
    if (reply.timing) {
      performance.mark('lemma.typeahead.neural.coverage', {detail: {...reply.timing, assetSha256: reply.assetSha256,
        modelFingerprint: reply.modelFingerprint, matchedPending: Boolean(pendingReply), arrivedBeforeDeadline,
        hasContinuation: Boolean(reply.continuation)}});
      if (performance.getEntriesByName('lemma.typeahead.neural.coverage').length > 256) {
        performance.clearMarks('lemma.typeahead.neural.coverage');
      }
    }
    if (pendingReply) finish(arrivedBeforeDeadline ? reply : undefined);
  };
  worker.onerror = () => finish();
  worker.postMessage({prepare: true, trial, strictTrial});
  return {
    predict(request) {
      finish();
      const next = ++id;
      return new Promise(resolve => {
        pending = {id: next, started: performance.now(), deadline: request.deadline, finish: resolve,
          timer: setTimeout(() => finish(), Math.max(0, request.deadline - Date.now()))};
        worker.postMessage({...request, trial, strictTrial, id: next} satisfies NeuralRequest);
      });
    },
    reset() {finish(); worker.postMessage({reset: true});},
    close() {finish(); worker.terminate();},
  };
}
