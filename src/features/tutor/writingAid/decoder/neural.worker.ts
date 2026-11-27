import {ANDROID_TIER, androidFp16Weights, installedAndroidPack, readInstalledFile, webModelInstall} from './androidPack';
import {ghostQualified, neuralCalibrationFingerprint} from '../calibration';
import type {InferenceSession, Tensor} from 'onnxruntime-web/wasm';
import {loadTutorModelWasm} from '../../input/modelAssets';
import {fetchVerifiedTypeaheadFile} from './assets';
import {neuralColdTransfer, neuralManifest, selectNeuralBackend, TYPEAHEAD_RUNTIME_VERSION,
  type NeuralBackend, type NeuralManifest, type NeuralTier} from './neuralManifest';
import {isNeuralBoundary, neuralWordPrompt, promptIds, readNeuralTokenizer, wordTrie, type NeuralPrompt, type NeuralTokenizer} from './neuralTokenizer';

export interface NeuralRequest {
  readonly id: number;
  readonly epoch: string;
  readonly prompt: NeuralPrompt;
  readonly prefix: string;
  readonly words: readonly string[];
  readonly deadline: number;
  readonly startedAt: number;
  readonly ghost: boolean;
  readonly probeGhost?: boolean;
  readonly trial?: boolean;
  readonly strictTrial?: boolean;
  readonly installedExperiment?: boolean;
}
export interface LabCase {labId: string; ids: number[]; stablePrefix?: number; previousIds?: number[]}
export interface LabResult {labId: string; top?: number[]; cachedTop?: number[]; retokenizedTop?: number[]; prefillMs?: number; decodeMs?: number; provider?: string; error?: string}
export interface NeuralReply {
  readonly id: number;
  readonly assetSha256?: string;
  readonly modelFingerprint?: string;
  readonly blendWeight?: number;
  readonly timing?: Readonly<{cold: boolean; provider?: string; admission?: Admission; attempted: number; scored: number;
    reusedPrefix: boolean; elapsedMs: number; late: boolean; strictTrial: boolean}>;
  readonly scores?: readonly (readonly [string, number])[];
  readonly continuation?: {text: string; logProbability: number};
  readonly ghostProbe?: readonly {text: string; logProbability: number; context: 'prefix' | 'boundary'; elapsedMs: number}[];
}

type Runtime = typeof import('onnxruntime-web/wasm');
interface ActiveModel {
  readonly manifest: NeuralManifest;
  readonly tokenizer: NeuralTokenizer;
  readonly runtime: Runtime;
  readonly prefill: InferenceSession;
  readonly incremental: InferenceSession;
  readonly pieces: readonly string[];
  readonly boundary: readonly number[];
  readonly provider: NeuralBackend;
  readonly modelFingerprint: string;
}
interface State {
  readonly ids: readonly number[];
  readonly tensors: InferenceSession.ReturnType;
  readonly logs: Float32Array;
}
type Admission = ReturnType<typeof neuralColdTransfer> &
  Readonly<{provider: NeuralBackend; result: 'selected' | 'cold-budget' | 'load-failed'}>;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LabCase | NeuralRequest | {reset: true} |
    {prepare: true; trial: boolean; strictTrial?: boolean; installedExperiment?: boolean}>) => void) | null;
  postMessage: (reply: NeuralReply | LabResult) => void;
};
let model: Promise<ActiveModel | undefined> | undefined;
let modelLoaded = false;
let admission: Admission | undefined;
let epoch = '';
let cached: State | undefined;
const wordScores = new Map<string, number>();
let latest: NeuralRequest | undefined;
let running = false;
let generation = 0;

async function load(tier: NeuralTier, manifest: NeuralManifest, device: NeuralBackend): Promise<ActiveModel> {
  const gpu = device !== 'wasm';
  const downloads = new Map<string, Promise<Uint8Array>>();
  const loadFile = (file: typeof manifest.files.prefill) => {
    const current = downloads.get(file.path);
    if (current) return current;
    const verified = tier === ANDROID_TIER ? readInstalledFile(file) : fetchVerifiedTypeaheadFile(tier, file, 48 * 1024 * 1024);
    downloads.set(file.path, verified);
    return verified;
  };
  const runtime = await (device === 'webgpuJspi' ? import('onnxruntime-web/jspi') :
    gpu ? import('onnxruntime-web/webgpu') : import('onnxruntime-web/wasm'));
  if (runtime.env.versions.web !== TYPEAHEAD_RUNTIME_VERSION) throw new Error('Typeahead runtime version needs a new byte report');
  const [wasm, tokenizerData, prefill, incremental, weights] = await Promise.all([
    gpu ? undefined : loadTutorModelWasm(),
    loadFile(manifest.files.tokenizer), loadFile(manifest.files.prefill), loadFile(manifest.files.incremental),
    manifest.files.weights && loadFile(manifest.files.weights),
  ]);
  const tokenizer = readNeuralTokenizer(JSON.parse(new TextDecoder().decode(tokenizerData)));
  if (tokenizer.size !== manifest.vocabSize) throw new Error('Tokenizer vocabulary differs from graph');
  runtime.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
  runtime.env.wasm.proxy = false;
  if (wasm) runtime.env.wasm.wasmBinary = wasm;
  const preferredOutputLocation: InferenceSession.SessionOptions['preferredOutputLocation'] = gpu ? {
    logits: 'cpu',
    ...Object.fromEntries(Array.from({length: manifest.layers}, (_, layer) =>
      [['present_key_' + layer, 'gpu-buffer'], ['present_value_' + layer, 'gpu-buffer']] as const).flat()),
  } : undefined;
  const options: InferenceSession.SessionOptions = {executionProviders: [gpu ? 'webgpu' : 'wasm'], preferredOutputLocation,
    externalData: weights && manifest.files.weights ? [{path: manifest.files.weights.path, data: weights}] : undefined};
  let first: InferenceSession | undefined;
  try {
    first = await runtime.InferenceSession.create(prefill, options);
    const second = await runtime.InferenceSession.create(incremental, options);
    const pieces = Array.from({length: tokenizer.size}, (_, id) => tokenizer.piece(id));
    const boundary = pieces.flatMap((piece, id) => isNeuralBoundary(id, piece) ? [id] : []);
    return {manifest, tokenizer, runtime, prefill: first, incremental: second, pieces, boundary, provider: device,
      modelFingerprint: neuralCalibrationFingerprint(manifest.files)};
  } catch (error) {
    await first?.release();
    throw error;
  } finally {delete runtime.env.wasm.wasmBinary;}
}

async function available(trial = false, strictTrial = false, installedExperiment = false): Promise<ActiveModel | undefined> {
  const installed = await installedAndroidPack();
  if (installedExperiment && !installed) return;
  // The installed web experiment saves its verified WASM runtime with the model. Use it on every
  // launch so going offline never replaces a working install with a fresh GPU download.
  const useOfflineWasm = installedExperiment && webModelInstall;
  const gpu = useOfflineWasm ? undefined : (navigator as Navigator & {gpu?: {requestAdapter: () => Promise<{features?: {has(name: string): boolean}; info?: {isFallbackAdapter?: boolean}} | null>}}).gpu;
  const adapter = await Promise.race([gpu?.requestAdapter().catch(() => null), new Promise<null>(resolve => setTimeout(() => resolve(null), 300))]);
  const gpuAvailable = Boolean(adapter && (trial && !strictTrial || adapter.info?.isFallbackAdapter !== true));
  const jspi = typeof WebAssembly !== 'undefined' && 'Suspending' in WebAssembly && 'promising' in WebAssembly;
  const tiers: NeuralTier[] = installedExperiment ? [ANDROID_TIER] : ['neural-large-v2', 'neural-v2'];
  if (installed && !installedExperiment) tiers.unshift(ANDROID_TIER);
  for (const tier of tiers) {
    const manifest = await neuralManifest(tier);
    if (!manifest) continue;
    const eligibleGpu = gpuAvailable && (tier !== ANDROID_TIER || adapter?.info?.isFallbackAdapter !== true && adapter?.features?.has('shader-f16') === true);
    const device = selectNeuralBackend(manifest, tier, eligibleGpu, jspi, trial || installedExperiment, strictTrial || tier === ANDROID_TIER);
    if (!device) {
      const blocked = trial && strictTrial && selectNeuralBackend(manifest, tier, gpuAvailable, jspi, trial);
      if (blocked && !admission) admission = {provider: blocked, result: 'cold-budget', ...neuralColdTransfer(manifest, tier, blocked)};
      continue;
    }
    const transfer = neuralColdTransfer(manifest, tier, device);
    admission = {provider: device, result: 'selected', ...transfer};
    // A failing backend returns to the n-gram. Stacking a second cold
    // download after failure could exceed the same installation budget.
    return load(tier, manifest, device).catch(() => {
      admission = {provider: device, result: 'load-failed', ...transfer};
      return undefined;
    });
  }
}

function logSoftmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (const value of logits) if (value > max) max = value;
  if (!Number.isFinite(max)) throw new Error('Invalid neural logits');
  const total = Math.log(logits.reduce((sum, value) => sum + Math.exp(value - max), 0)) + max;
  if (!Number.isFinite(total)) throw new Error('Invalid neural distribution');
  return logits.map(value => value - total);
}

// Ordinary deadline expiry is not a graph failure: retain the last committed exact-prefix cache.
class ExpiredSlate {
  constructor(readonly reply: NeuralReply) {}
}

async function infer(model: ActiveModel, ids: readonly number[], prior?: State, beforeRun?: () => void): Promise<State> {
  const remaining = prior ? ids.slice(prior.ids.length) : ids;
  const feeds: Record<string, Tensor> = {};
  if (prior) for (let layer = 0; layer < model.manifest.layers; layer++) {
    for (const type of ['key', 'value']) {
      const tensor = prior.tensors['present_' + type + '_' + layer];
      if (!tensor) throw new Error('Incomplete cached attention state');
      feeds['past_' + type + '_' + layer] = tensor as Tensor;
    }
  }
  feeds.input_ids = new model.runtime.Tensor('int64', BigInt64Array.from(remaining, BigInt), [1, remaining.length]);
  let tensors: InferenceSession.ReturnType | undefined;
  try {
    beforeRun?.(); // Tokenization, trie traversal and even feed construction may have consumed the budget.
    tensors = await (prior ? model.incremental : model.prefill).run(feeds);
    const {logits: output, ...attention} = tensors;
    const logits = await output.getData();
    if (!(logits instanceof Float32Array) || logits.length !== model.tokenizer.size) throw new Error('Bad neural output');
    const logs = logSoftmax(logits);
    output.dispose();
    return {ids, tensors: attention, logs};
  } catch (error) {
    for (const tensor of Object.values(tensors ?? {})) tensor.dispose();
    throw error;
  } finally {feeds.input_ids.dispose();}
}

function dispose(state?: State): void {
  for (const tensor of Object.values(state?.tensors ?? {})) tensor.dispose();
}

async function stateFor(model: ActiveModel, ids: readonly number[], current: () => boolean,
  prior: State | undefined, dropStale?: () => void, beforeRun?: () => void): Promise<State> {
  let state = prior;
  if (!state || state.ids.length > ids.length || !state.ids.every((id, index) => ids[index] === id)) {
    return infer(model, ids, undefined, () => {
      beforeRun?.(); // Do not evict a useful prefix for an edit that expired while its tokens were prepared.
      dropStale?.();
      beforeRun?.(); // Disposing old GPU tensors can itself take time.
    }); // Earlier edits and rollover prefill absolute positions.
  }
  let owned = false;
  try {
    for (let end = state.ids.length + 1; end <= ids.length && current(); end++) {
      const updated = await infer(model, ids.slice(0, end), state, beforeRun);
      if (owned) dispose(state);
      state = updated;
      owned = true;
    }
    return state;
  } catch (error) {
    if (owned) dispose(state);
    throw error;
  }
}

function boundaryLog(model: ActiveModel, state: State): number {
  return Math.log(model.boundary.reduce((total, id) => total + Math.exp(state.logs[id]), 0));
}

async function suggest(request: NeuralRequest): Promise<NeuralReply> {
  const {id, prompt, prefix} = request;
  const started = performance.now();
  const cold = !modelLoaded;
  let provider: string | undefined;
  let reusedPrefix = false, attempted = 0;
  const timing = (scored = 0): NonNullable<NeuralReply['timing']> =>
    ({cold, provider, admission, attempted, scored, reusedPrefix, elapsedMs: performance.now() - started,
      late: Date.now() > request.deadline, strictTrial: Boolean(request.strictTrial)});
  const currentGeneration = generation;
  const sameGeneration = () => generation === currentGeneration;
  const sameEpoch = () => sameGeneration() && epoch === request.epoch && (!latest || latest.epoch === epoch);
  const current = () => !latest && sameGeneration() && Date.now() <= request.deadline;
  const beforeRun = () => {if (!current()) throw new ExpiredSlate({id, timing: timing()});};
  const active = await prepare(request.trial, request.strictTrial, request.installedExperiment);
  provider = active?.provider;
  if (!active || latest || !sameGeneration()) return {id, timing: timing()};
  if (epoch !== request.epoch) {epoch = request.epoch; dispose(cached); cached = undefined; wordScores.clear();}
  // A request can expire behind cold startup or the previous non-interruptible graph.
  // Keep already-started same-epoch prefill reusable, but never start another graph for a dead slate.
  if (!current()) return {id, timing: timing()};
  const stable = neuralWordPrompt(prompt, prefix);
  // Leave room for complete candidate words before absolute-position rollover.
  const ids = promptIds(active.tokenizer, stable, active.manifest.context - 36);
  reusedPrefix = Boolean(cached?.ids.every((token, index) => token === ids[index]));
  const state = await stateFor(active, ids, current, cached, () => {dispose(cached); cached = undefined;}, beforeRun);
  // One completed prefix can warm the next edit even after this slate's
  // deadline. stateFor checks the exact tokens again before reusing it.
  if (!sameEpoch()) {
    if (state !== cached) dispose(state);
    return {id, timing: timing()};
  }
  if (state !== cached) {dispose(cached); wordScores.clear();}
  cached = state;
  if (!current() || state.ids.length !== ids.length) return {id, timing: timing()};

  const extras = [...state.logs.keys()].filter(index => /^[\p{L}\p{M}]{2,32}$/u.test(active.pieces[index]) &&
    active.pieces[index].toLowerCase().startsWith(prefix.toLowerCase()))
    .sort((a, b) => state.logs[b] - state.logs[a]).slice(0, 8).map(index => active.pieces[index]);
  const words = [...new Set([...request.words.slice(0, 48), ...extras])];
  attempted = words.length;
  const scores: [string, number][] = words.flatMap(word => {
    const score = wordScores.get(word);
    return score !== undefined && word.toLowerCase().startsWith(prefix.toLowerCase()) && word.toLowerCase() !== prefix.toLowerCase()
      ? [[word, score]] : [];
  });
  const trie = wordTrie(active.tokenizer, words.filter(word => !wordScores.has(word)), prefix, active.manifest.context - ids.length);
  // Sharing branches avoids repeat calls. Prefer short complete word
  // events among otherwise similar paths when the edit deadline is close.
  let graphMs = 0;
  const depths = new WeakMap<ReturnType<typeof wordTrie>, number>();
  function depth(node: ReturnType<typeof wordTrie>): number {
    if (node.words.length) return 0;
    const saved = depths.get(node);
    if (saved !== undefined) return saved;
    const result = 1 + Math.min(...[...node.edges.values()].map(depth));
    depths.set(node, result);
    return result;
  }
  const calibration = active.manifest.calibration;
  const evaluateGhost = request.ghost && Boolean(calibration?.length || request.probeGhost);
  const ghostTime = evaluateGhost ? 18 : 0;
  async function walk(node: ReturnType<typeof wordTrie>, parent: State, score: number, owned = false): Promise<void> {
    try {
      while (current()) {
        if (node.words.length) {
          const total = score + boundaryLog(active!, parent);
          for (const word of node.words) {
            if (wordScores.size >= 128) wordScores.delete(wordScores.keys().next().value!);
            wordScores.set(word, total);
            scores.push([word, total]);
          }
        }
        const edges = [...node.edges.entries()].sort(([left, leftNode], [right, rightNode]) =>
          parent.logs[right] - parent.logs[left] - .35 * (depth(rightNode) - depth(leftNode)));
        const affordable = () => current() && Date.now() + graphMs + ghostTime + 2 <= request.deadline;
        async function branch(token: number) {
          const start = performance.now();
          const state = await infer(active!, [...parent.ids, token], parent, beforeRun);
          const elapsed = performance.now() - start;
          graphMs = graphMs ? .7 * graphMs + .3 * elapsed : elapsed;
          return state;
        }
        if (edges.length === 1 && affordable()) {
          const [token, child] = edges[0];
          const next = await branch(token);
          score += parent.logs[token];
          if (owned) dispose(parent);
          parent = next;
          owned = true;
          node = child;
          continue;
        }
        for (const [token, child] of edges) {
          if (!affordable()) break;
          const next = await branch(token);
          await walk(child, next, score + parent.logs[token], true);
        }
        break;
      }
    } finally {if (owned) dispose(parent);}
  }
  await walk(trie, state, 0);
  let continuation: NeuralReply['continuation'];
  const ghostProbe: NonNullable<NeuralReply['ghostProbe']>[number][] = [];
  if (evaluateGhost && current()) {
    const ghostIds = promptIds(active.tokenizer, prompt, active.manifest.context - 16);
    const context = prefix ? 'prefix' : 'boundary';
    let text = '', score = 0, stateAt = await infer(active, ghostIds, undefined, beforeRun);
    try {
      while (current() && stateAt.ids.length < active.manifest.context && text.length < 32) {
        let best = 0;
        for (let i = 1; i < stateAt.logs.length; i++) if (stateAt.logs[i] > stateAt.logs[best]) best = i;
        const piece = active.pieces[best];
        if (!piece || !/^[\p{L}\p{M} ,.;:!?'-]+$/u.test(piece) || text.length + piece.length > 32) break;
        text += piece;
        score += stateAt.logs[best];
        if (text.length >= 5 && /\s$/u.test(text)) {
          const elapsedMs = Date.now() - request.startedAt;
          if (request.probeGhost && ghostProbe.length < 12) ghostProbe.push({text, logProbability: score, context, elapsedMs});
          if (!request.probeGhost && calibration && ghostQualified(calibration, score, text.length, context, elapsedMs)) {
            continuation = {text, logProbability: score};
            break;
          }
        }
        const updated = await infer(active, [...stateAt.ids, best], stateAt, beforeRun);
        if (stateAt !== cached) dispose(stateAt);
        stateAt = updated;
      }
    } finally {if (stateAt !== cached) dispose(stateAt);}
  }
  if (!current()) return {id, timing: timing(scores.length)};
  return {id, scores, continuation, ghostProbe: request.probeGhost ? ghostProbe : undefined,
    modelFingerprint: active.modelFingerprint,
    assetSha256: active.manifest.files.prefill.sha256, blendWeight: active.manifest.blendWeight,
    timing: timing(scores.length)};
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (latest) {
      const request = latest;
      latest = undefined;
      try {scope.postMessage(await suggest(request));}
      catch (error) {
        if (error instanceof ExpiredSlate) scope.postMessage(error.reply);
        else {dispose(cached); cached = undefined; scope.postMessage({id: request.id});}
      }
    }
  } finally {
    running = false;
    if (!epoch) {dispose(cached); cached = undefined;}
  }
}

function prepare(trial?: boolean, strictTrial?: boolean, installedExperiment?: boolean): Promise<ActiveModel | undefined> {
  return model ??= available(trial, strictTrial, installedExperiment).then(active => {modelLoaded = Boolean(active); return active;});
}

let labEnabled = false;
async function verifyLabCase(test: LabCase) {
  const active = await prepare();
  const {ids} = test;
  if (!labEnabled || active?.manifest.files.weights?.sha256 !== androidFp16Weights ||
      !Array.isArray(ids) || !ids.length || ids.length > 512 || ids.some(id => !Number.isInteger(id) || id < 0 || id >= active.manifest.vocabSize)) {
    throw new Error('Unqualified lab input or model');
  }
  const top = (state: State) => {
    if (!state.logs.every(Number.isFinite)) throw new Error('Non-finite logits');
    return Array.from(state.logs.keys()).sort((a,b) => state.logs[b] - state.logs[a] || a-b).slice(0,3);
  };
  let full: State | undefined, prefix: State | undefined, tail: State | undefined;
  try {
    const start = performance.now();
    full = await infer(active, ids);
    const prefillMs = performance.now() - start;
    const result: LabResult = {labId: test.labId, top: top(full), prefillMs, provider: active.provider};
    if (ids.length > 1) {
      const length = ids.length - 1;
      prefix = await infer(active, ids.slice(0,length));
      const t = performance.now();
      tail = await stateFor(active, ids, () => true, prefix);
      result.decodeMs = performance.now() - t;
      result.cachedTop = top(tail);
    }
    if (test.previousIds) {
      if (!test.previousIds.length || test.previousIds.length > 512 || test.previousIds.some(id => !Number.isInteger(id) || id < 0 || id >= active.manifest.vocabSize)) throw new Error('Invalid prior context');
      const previous = await infer(active, test.previousIds);
      try {
        const revised = await stateFor(active, ids, () => true, previous);
        try {result.retokenizedTop = top(revised);} finally {if (revised !== previous) dispose(revised);}
      } finally {dispose(previous);}
    }
    return result;
  } finally {dispose(full); dispose(prefix); dispose(tail);}
}

scope.onmessage = event => {
  const message = event.data;
  if ('labId' in message) {
    if (labEnabled) void verifyLabCase(message).then(reply => scope.postMessage(reply))
      .catch(() => scope.postMessage({labId: message.labId, error: 'FP16 parity case failed'}));
    return;
  }
  if ('prepare' in message) {
    labEnabled = Boolean(message.trial && message.strictTrial);
    void prepare(message.trial, message.strictTrial, message.installedExperiment);
    return;
  }
  if ('reset' in message) {
    generation++;
    wordScores.clear();
    if (!running) {dispose(cached); cached = undefined;}
    latest = undefined;
    epoch = '';
    return;
  }
  if (latest) scope.postMessage({id: latest.id});
  latest = message;
  void drain();
};
