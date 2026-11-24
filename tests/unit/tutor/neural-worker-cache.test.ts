import {afterEach, expect, test, vi} from 'vitest';
import type {NeuralReply, NeuralRequest} from '../../../src/features/tutor/writingAid/decoder/neural.worker';

const ort = vi.hoisted(() => ({prefill: vi.fn(), incremental: vi.fn()}));
vi.mock('onnxruntime-web/wasm', () => ({
  env: {versions: {web: '1.27.0'}, wasm: {}},
  Tensor: class Tensor {
    dispose() {}
  },
  InferenceSession: {create: async (graph: Uint8Array) => ({run: graph[0] === 1 ? ort.prefill : ort.incremental})},
}));
vi.mock('../../../src/features/tutor/input/modelAssets', () => ({loadTutorModelWasm: async () => undefined}));
vi.mock('../../../src/features/tutor/writingAid/decoder/neuralManifest', () => ({
  TYPEAHEAD_RUNTIME_VERSION: '1.27.0',
  selectNeuralBackend: () => 'wasm',
  neuralManifest: async () => ({
    context: 512, layers: 1, vocabSize: 262,
    files: {tokenizer: {path: 'tokenizer'}, prefill: {path: 'prefill', sha256: 'checked'}, incremental: {path: 'incremental'}},
  }),
}));
vi.mock('../../../src/features/tutor/writingAid/decoder/assets', () => ({
  fetchVerifiedTypeaheadFile: async (_tier: string, file: {path: string}) => {
    if (file.path !== 'tokenizer') return Uint8Array.of(file.path === 'prefill' ? 1 : 2);
    return new TextEncoder().encode(JSON.stringify({version: 1, algorithm: 'utf8-bpe', byteOffset: 6, merges: [],
      reserved: {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5}}));
  },
}));

function tensors() {
  return {logits: {getData: async () => new Float32Array(262), dispose: vi.fn()},
    present_key_0: {dispose: vi.fn()}, present_value_0: {dispose: vi.fn()}};
}

async function worker() {
  vi.resetModules();
  ort.prefill.mockReset().mockImplementation(async () => tensors());
  ort.incremental.mockReset().mockImplementation(async () => tensors());
  const replies: NeuralReply[] = [];
  const scope = {onmessage: undefined as ((event: {data: NeuralRequest | {reset: true}}) => void) | undefined,
    postMessage: (reply: NeuralReply) => {replies.push(reply);}};
  vi.stubGlobal('self', scope);
  vi.stubGlobal('navigator', {});
  await import('../../../src/features/tutor/writingAid/decoder/neural.worker');
  return {
    suggest(id: number, draft: string, epoch = 'turn', deadline = Date.now() + 1000) {
      scope.onmessage!({data: {id, epoch, deadline, prompt: {question: 'Exercise', aids: '', draft},
        prefix: '', words: [], startedAt: Date.now(), ghost: false}});
    },
    reset() {scope.onmessage!({data: {reset: true}});},
    async reply(id: number) {
      await vi.waitFor(() => expect(replies.some(reply => reply.id === id)).toBe(true));
      return replies.find(reply => reply.id === id)!;
    },
  };
}

function delayedPrefill() {
  const cached = tensors();
  let finish!: (value: typeof cached) => void;
  ort.prefill.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  return {cached, finish: () => finish(cached)};
}

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

test('retains late prefill for the next identical token prefix without emitting a late result', async () => {
  const decoder = await worker(), pending = delayedPrefill();
  let now = 100;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  decoder.suggest(1, 'Use ', 'turn', 160);
  await vi.waitFor(() => expect(ort.prefill).toHaveBeenCalledTimes(1));
  now = 170;
  pending.finish();
  const late = await decoder.reply(1);
  expect(late.timing?.late).toBe(true);
  expect(late.scores).toBeUndefined();
  expect(pending.cached.present_key_0.dispose).not.toHaveBeenCalled();
  decoder.suggest(2, 'Use a ');
  expect((await decoder.reply(2)).timing?.reusedPrefix).toBe(true);
  expect(ort.prefill).toHaveBeenCalledTimes(1);
  expect(ort.incremental).toHaveBeenCalledTimes(2);
  decoder.suggest(3, 'Edit ');
  expect((await decoder.reply(3)).timing?.reusedPrefix).toBe(false);
  expect(ort.prefill).toHaveBeenCalledTimes(2);
  expect(pending.cached.present_key_0.dispose).toHaveBeenCalledTimes(1);
  decoder.reset();
});

test.each(['same', 'other', 'reset'] as const)('handles a %s request while prefill is suspended', async change => {
  const decoder = await worker(), pending = delayedPrefill();
  decoder.suggest(1, 'Use ');
  await vi.waitFor(() => expect(ort.prefill).toHaveBeenCalledTimes(1));
  if (change === 'reset') decoder.reset();
  decoder.suggest(2, 'Use ', change === 'other' ? 'new-turn' : 'turn');
  pending.finish();
  expect((await decoder.reply(1)).scores).toBeUndefined();
  expect((await decoder.reply(2)).timing?.reusedPrefix).toBe(change === 'same');
  expect(ort.prefill).toHaveBeenCalledTimes(change === 'same' ? 1 : 2);
  expect(pending.cached.present_key_0.dispose).toHaveBeenCalledTimes(change === 'same' ? 0 : 1);
  decoder.reset();
  expect(pending.cached.present_key_0.dispose).toHaveBeenCalledTimes(1);
});
