import {ghostQualified} from '../calibration';
import type {InferenceSession, Tensor} from 'onnxruntime-web/wasm';
import {loadTutorModelWasm} from '../../input/modelAssets';
import {fetchVerifiedTypeaheadFile} from './assets';
import {neuralManifest, selectNeuralBackend, TYPEAHEAD_RUNTIME_VERSION, type NeuralBackend, type NeuralManifest, type NeuralTier} from './neuralManifest';
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
  readonly trial?: boolean;
}
export interface NeuralReply {
  readonly id: number;
  readonly assetSha256?: string;
  readonly blendWeight?: number;
  readonly timing?: Readonly<{cold: boolean; provider?: string; attempted: number; scored: number; reusedPrefix: boolean; elapsedMs: number; late: boolean}>;
  readonly scores?: readonly (readonly [string, number])[];
  readonly continuation?: {text: string; logProbability: number};
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
}
interface State {
  readonly ids: readonly number[];
  readonly tensors: InferenceSession.ReturnType;
  readonly logs: Float32Array;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<NeuralRequest | {reset: true} | {prepare: true; trial: boolean}>) => void) | null;
  postMessage: (reply: NeuralReply) => void;
};
let model: Promise<ActiveModel | undefined> | undefined;
let modelLoaded = false;
let epoch = '';
let cached: State | undefined;
const wordScores = new Map<string, number>();
let latest: NeuralRequest | undefined;
let running = false;
let generation = 0;

async function load(tier: NeuralTier, manifest: NeuralManifest, device: NeuralBackend): Promise<ActiveModel> {
  const gpu = device !== 'wasm';
  const loadFile = (file: typeof manifest.files.prefill) => fetchVerifiedTypeaheadFile(tier, file, 48 * 1024 * 1024);
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
    return {manifest, tokenizer, runtime, prefill: first, incremental: second, pieces, boundary, provider: device};
  } catch (error) {
    await first?.release();
    throw error;
  } finally {delete runtime.env.wasm.wasmBinary;}
}

async function available(trial = false): Promise<ActiveModel | undefined> {
  const gpu = (navigator as Navigator & {gpu?: {requestAdapter: () => Promise<{info?: {isFallbackAdapter?: boolean}} | null>}}).gpu;
  const adapter = await Promise.race([gpu?.requestAdapter().catch(() => null), new Promise<null>(resolve => setTimeout(() => resolve(null), 300))]);
  const gpuAvailable = Boolean(adapter && (trial || adapter.info?.isFallbackAdapter !== true));
  const jspi = typeof WebAssembly !== 'undefined' && 'Suspending' in WebAssembly && 'promising' in WebAssembly;
  for (const tier of ['neural-large-v2', 'neural-v2'] as const) {
    const manifest = await neuralManifest(tier);
    const device = manifest && selectNeuralBackend(manifest, tier, gpuAvailable, jspi, trial);
    if (!manifest || !device) continue;
    // A failing backend returns to the n-gram. Stacking a second cold
    // download after failure could exceed the same installation budget.
    return load(tier, manifest, device).catch(() => undefined);
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

async function infer(model: ActiveModel, ids: readonly number[], prior?: State): Promise<State> {
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

async function stateFor(model: ActiveModel, ids: readonly number[], current: () => boolean): Promise<State> {
  let state = cached;
  if (!state || state.ids.length > ids.length || !state.ids.every((id, index) => ids[index] === id)) {
    dispose(state);
    cached = undefined;
    return infer(model, ids); // Earlier edits and rollover prefill absolute positions.
  }
  let owned = false;
  try {
    for (let end = state.ids.length + 1; end <= ids.length && current(); end++) {
      const updated = await infer(model, ids.slice(0, end), state);
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
    ({cold, provider, attempted, scored, reusedPrefix, elapsedMs: performance.now() - started, late: Date.now() > request.deadline});
  const currentGeneration = generation;
  const current = () => !latest && generation === currentGeneration && Date.now() <= request.deadline;
  const active = await prepare(request.trial);
  provider = active?.provider;
  if (!active || !current()) return {id, timing: timing()};
  if (epoch !== request.epoch) {epoch = request.epoch; dispose(cached); cached = undefined; wordScores.clear();}
  const stable = neuralWordPrompt(prompt, prefix);
  // Leave room for complete candidate words before absolute-position rollover.
  const ids = promptIds(active.tokenizer, stable, active.manifest.context - 36);
  reusedPrefix = Boolean(cached?.ids.every((token, index) => token === ids[index]));
  const state = await stateFor(active, ids, current);
  if (!current() || state.ids.length !== ids.length) {
    if (state !== cached) dispose(state);
    return {id, timing: timing()};
  }
  if (state !== cached) {dispose(cached); wordScores.clear();}
  cached = state;

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
  const ghostTime = request.ghost && active.manifest.calibration?.length ? 18 : 0;
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
          const state = await infer(active!, [...parent.ids, token], parent);
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
  if (request.ghost && active.manifest.calibration?.length && current()) {
    const ghostIds = promptIds(active.tokenizer, prompt, active.manifest.context - 16);
    let text = '', score = 0, stateAt = await infer(active, ghostIds);
    try {
      while (current() && stateAt.ids.length < active.manifest.context && text.length < 32) {
        let best = 0;
        for (let i = 1; i < stateAt.logs.length; i++) if (stateAt.logs[i] > stateAt.logs[best]) best = i;
        const piece = active.pieces[best];
        if (!piece || !/^[\p{L}\p{M} ,.;:!?'-]+$/u.test(piece) || text.length + piece.length > 32) break;
        text += piece;
        score += stateAt.logs[best];
        if (/\s$/u.test(text) && ghostQualified(active.manifest.calibration, score, text.length, prefix ? 'prefix' : 'boundary',
          Date.now() - request.startedAt)) {
          continuation = {text, logProbability: score};
          break;
        }
        const updated = await infer(active, [...stateAt.ids, best], stateAt);
        if (stateAt !== cached) dispose(stateAt);
        stateAt = updated;
      }
    } finally {if (stateAt !== cached) dispose(stateAt);}
  }
  return {id, scores, continuation, assetSha256: active.manifest.files.prefill.sha256, blendWeight: active.manifest.blendWeight,
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
      catch {dispose(cached); cached = undefined; scope.postMessage({id: request.id});}
    }
  } finally {
    running = false;
    if (!epoch) {dispose(cached); cached = undefined;}
  }
}

function prepare(trial?: boolean): Promise<ActiveModel | undefined> {
  return model ??= available(trial).then(active => {modelLoaded = Boolean(active); return active;});
}

scope.onmessage = event => {
  const message = event.data;
  if ('prepare' in message) {void prepare(message.trial); return;}
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
