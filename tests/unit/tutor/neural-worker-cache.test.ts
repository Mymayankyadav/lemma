import {afterEach, expect, test, vi} from 'vitest';
import type {NeuralReply, NeuralRequest} from '../../../src/features/tutor/writingAid/decoder/neural.worker';
import {createNeuralClient} from '../../../src/features/tutor/writingAid/decoder/neuralClient';

const ort = vi.hoisted(() => ({prefill: vi.fn(), incremental: vi.fn()}));
const modelFiles = vi.hoisted(() => ({sharedGraphs: false, fetched: vi.fn()}));
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
  qualifiedNeuralTier: () => true,
  neuralColdTransfer: () => ({modelBytes: 3, runtimeBytes: 13_479_978, supportReserveBytes: 29 * 2**20,
    totalBytes: 13_479_981 + 29 * 2**20, limitBytes: 68 * 2**20}),
  neuralManifest: async () => ({
    context: 512, layers: 1, vocabSize: 262,
    files: {tokenizer: {path: 'tokenizer', sha256: 'tokens'}, prefill: {path: 'prefill', sha256: 'checked'},
      incremental: modelFiles.sharedGraphs ? {path: 'prefill', sha256: 'checked'} : {path: 'incremental', sha256: 'step'}},
  }),
}));
vi.mock('../../../src/features/tutor/writingAid/decoder/assets', () => ({
  fetchVerifiedTypeaheadFile: async (_tier: string, file: {path: string}) => {
    modelFiles.fetched(file.path);
    if (file.path !== 'tokenizer') return Uint8Array.of(file.path === 'prefill' ? 1 : 2);
    return new TextEncoder().encode(JSON.stringify({version: 1, algorithm: 'utf8-bpe', byteOffset: 6, merges: [],
      reserved: {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5}}));
  },
}));

function tensors(bestToken?: number) {
  const logits = new Float32Array(262);
  if (bestToken !== undefined) logits[bestToken] = 12;
  return {logits: {getData: async () => logits, dispose: vi.fn()},
    present_key_0: {dispose: vi.fn()}, present_value_0: {dispose: vi.fn()}};
}

async function worker(sharedGraphs = false) {
  vi.resetModules();
  modelFiles.sharedGraphs = sharedGraphs;
  modelFiles.fetched.mockClear();
  ort.prefill.mockReset().mockImplementation(async () => tensors());
  ort.incremental.mockReset().mockImplementation(async () => tensors());
  const replies: NeuralReply[] = [];
  const scope = {onmessage: undefined as ((event: {data: NeuralRequest | {reset: true}}) => void) | undefined,
    postMessage: (reply: NeuralReply) => {replies.push(reply);}};
  vi.stubGlobal('self', scope);
  vi.stubGlobal('navigator', {});
  await import('../../../src/features/tutor/writingAid/decoder/neural.worker');
  return {
    suggest(id: number, draft: string, epoch = 'turn', deadline = Date.now() + 1000,
      options?: Pick<NeuralRequest, 'ghost' | 'probeGhost'>) {
      scope.onmessage!({data: {id, epoch, deadline, prompt: {question: 'Exercise', aids: '', draft},
        prefix: '', words: [], startedAt: Date.now(), ghost: false, ...options}});
    },
    reset() {scope.onmessage!({data: {reset: true}});},
    async reply(id: number) {
      await vi.waitFor(() => expect(replies.some(reply => reply.id === id)).toBe(true));
      return replies.find(reply => reply.id === id)!;
    },
  };
}

test('coalesces concurrent graph roles that reference the same verified download', async () => {
  const decoder = await worker(true);
  decoder.suggest(1, 'Use ');
  expect((await decoder.reply(1)).modelFingerprint).toBe('checked:checked:tokens:-');
  expect(modelFiles.fetched.mock.calls.map(([path]) => path).sort()).toEqual(['prefill', 'tokenizer']);
  decoder.reset();
});

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

test('keeps an uncalibrated continuation restricted to an explicit replay probe', async () => {
  const decoder = await worker();
  decoder.suggest(1, 'Use ', 'turn', Date.now() + 1000, {ghost: true});
  const ordinary = await decoder.reply(1);
  expect(ordinary.ghostProbe).toBeUndefined();
  expect(ordinary.continuation).toBeUndefined();
  expect(ort.prefill).toHaveBeenCalledTimes(1);
  ort.prefill.mockResolvedValueOnce(tensors('t'.charCodeAt(0) + 6));
  for (const char of 'here ') ort.incremental.mockResolvedValueOnce(tensors(char.charCodeAt(0) + 6));
  ort.incremental.mockResolvedValueOnce(tensors(2));
  decoder.suggest(2, 'Use ', 'turn', Date.now() + 1000, {ghost: true, probeGhost: true});
  const diagnostic = await decoder.reply(2);
  expect(diagnostic.continuation).toBeUndefined();
  expect(diagnostic.ghostProbe?.map(candidate => candidate.text)).toEqual(['there ']);
  expect(diagnostic.modelFingerprint).toBe('checked:step:tokens:-');
  decoder.reset();
});

test.each(['late', 'reset'] as const)('discards a %s probe even if its first boundary was computed earlier', async change => {
  const decoder = await worker();
  let now = 100;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  ort.prefill.mockResolvedValueOnce(tensors()).mockResolvedValueOnce(tensors('t'.charCodeAt(0) + 6));
  for (const char of 'here ') ort.incremental.mockResolvedValueOnce(tensors(char.charCodeAt(0) + 6));
  const final = tensors(2);
  let finish!: () => void;
  ort.incremental.mockImplementationOnce(() => new Promise(resolve => {finish = () => resolve(final);}));
  decoder.suggest(1, 'Use ', 'turn', 160, {ghost: true, probeGhost: true});
  await vi.waitFor(() => expect(ort.incremental).toHaveBeenCalledTimes(6));
  if (change === 'reset') decoder.reset();
  else now = 170;
  finish();
  const discarded = await decoder.reply(1);
  expect(discarded.timing?.late).toBe(change === 'late');
  expect(discarded.continuation).toBeUndefined();
  expect(discarded.ghostProbe).toBeUndefined();
  expect(final.present_key_0.dispose).toHaveBeenCalledTimes(1);
  decoder.reset();
});

test('distinguishes stale and late arrivals from a delivered neural score', async () => {
  let instance: TestWorker;
  class TestWorker {
    onmessage?: (message: {data: NeuralReply}) => void;
    constructor() {instance = this;}
    postMessage() {}
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  let now = 100;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const mark = vi.spyOn(performance, 'mark');
  const client = (await createNeuralClient(true, true))!;
  const request = {epoch: 'same-turn', prefix: 'def', words: ['definition'], startedAt: 100,
    deadline: 160, ghost: false, prompt: {question: '', aids: '', draft: 'State the def'}};
  const deliver = (id: number) => {
    const reply: NeuralReply = {id, scores: [['definition', -3]], modelFingerprint: 'verified-bundle',
      timing: {cold: false, attempted: 1, scored: 1, reusedPrefix: true, elapsedMs: 10, late: false, strictTrial: true}};
    instance!.onmessage!({data: reply});
  };
  const expired = client.predict(request);
  now = 170;
  deliver(1);
  expect(await expired).toBeUndefined();
  expect(mark).toHaveBeenLastCalledWith('lemma.typeahead.neural.coverage', {detail: expect.objectContaining({
    matchedPending: true, arrivedBeforeDeadline: false,
  })});
  const live = client.predict({...request, startedAt: 170, deadline: 230});
  deliver(1);
  expect(mark).toHaveBeenLastCalledWith('lemma.typeahead.neural.coverage', {detail: expect.objectContaining({
    matchedPending: false, arrivedBeforeDeadline: false,
  })});
  deliver(2);
  expect((await live)?.scores).toEqual([['definition', -3]]);
  expect(mark).toHaveBeenLastCalledWith('lemma.typeahead.neural.coverage', {detail: expect.objectContaining({
    matchedPending: true, arrivedBeforeDeadline: true,
  })});
  client.close();
});
