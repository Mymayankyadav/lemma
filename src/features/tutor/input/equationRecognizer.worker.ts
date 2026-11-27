/**
 * N221 · the equation recogniser's worker: downloads Pix2Text MFR once (each file checked against its pinned SHA-256,
 * then cached), runs the encoder on the drawing and decodes LaTeX greedily with the decoder. See equationModel.ts.
 */
import {env, InferenceSession, Tensor} from 'onnxruntime-web/wasm';
import threadModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import {EQUATION_MODEL, EQUATION_MODEL_BYTES, EQUATION_MODEL_CACHE, equationModelUrl, type EquationModelFile} from './equationModel';
import {cleanLatex, decodeTokens, greedyDecode, vocabularyFrom} from './equationRecognition';
import {loadTutorModelWasm, MODEL_MANIFEST} from './modelAssets';

// The same verified onnxruntime-web WASM as Draw symbol and Equation Assist.
const TUTOR_RUNTIME = MODEL_MANIFEST.runtime;

class DownloadRequired extends Error {}
type LoadMode = 'prepare' | 'installed' | 'approved';
const permission = {prepare: 0, installed: 1, approved: 2};

export type EquationWorkerRequest =
  | {type: 'status'}
  /** N223: load the cached model now, so the first Read does not wait for it. */
  | {type: 'prepare'}
  | {type: 'recognize'; id: number; pixels: Float32Array; allowDownload: boolean};
export type EquationWorkerResponse =
  | {type: 'status'; cached: boolean}
  | {type: 'progress'; loaded: number; total: number}
  | {type: 'result'; id: number; latex: string}
  | {type: 'error'; id?: number; message: string; downloadRequired?: boolean};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EquationWorkerRequest>) => void) | null;
  postMessage: (message: EquationWorkerResponse) => void;
};
let model: Promise<Sessions> | undefined;
let modelMode: LoadMode = 'prepare';
let loaded = 0;
/** N223: only the newest read runs to the end; an older one stops at its next decoding step. */
let latest = 0;
const CANCELLED = 'Superseded by a newer reading.';

async function openCache() {
  try {return await self.caches?.open(EQUATION_MODEL_CACHE);} catch {return undefined;}
}

/** Read a response into exactly `file.bytes`, reporting progress, and check its SHA-256. */
async function readVerified(response: Response, file: EquationModelFile, report: boolean): Promise<Uint8Array> {
  if (!response.ok) throw new Error('The recognition model could not be downloaded (' + response.status + ').');
  const bytes = new Uint8Array(file.bytes);
  const reader = response.body?.getReader();
  let offset = 0;
  if (reader) {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      if (value.byteLength > bytes.byteLength - offset) {await reader.cancel(); throw new Error('The recognition model was not the expected file.');}
      bytes.set(value, offset);
      offset += value.byteLength;
      if (report) {loaded += value.byteLength; scope.postMessage({type: 'progress', loaded, total: EQUATION_MODEL_BYTES});}
    }
  } else {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > bytes.byteLength) throw new Error('The recognition model was not the expected file.');
    bytes.set(data);
    offset = data.byteLength;
  }
  if (offset !== file.bytes) throw new Error('The recognition model did not match its checksum.');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== file.sha256) throw new Error('The recognition model did not match its checksum.');
  return bytes;
}

async function fetchFile(file: EquationModelFile, cache: Cache | undefined, allowDownload: boolean): Promise<Uint8Array> {
  const url = equationModelUrl(file);
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {
      const bytes = await readVerified(cached, file, false);
      loaded += file.bytes;
      scope.postMessage({type: 'progress', loaded, total: EQUATION_MODEL_BYTES});
      return bytes;
    } catch { /* Never evict a user's cached file speculatively. Only verified replacement bytes are written. */ }
  }
  if (!allowDownload) throw new DownloadRequired('A verified copy of the equation reader needs to be downloaded.');
  const response = await fetch(url, {mode: 'cors', credentials: 'omit', redirect: 'follow'});
  const bytes = await readVerified(response, file, true);
  await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
  return bytes;
}

type Sessions = {encoder: InferenceSession; decoder: InferenceSession; vocabulary: string[]};

function load(mode: LoadMode): Promise<Sessions> {
  if (model) {
    // An explicit Read may arrive during speculative verification. Share the successful result, or retry
    // interactively once if that cache-only attempt failed; never start a second pair of sessions in parallel.
    return permission[mode] > permission[modelMode] ? model.catch(() => load(mode)) : model;
  }
  modelMode = mode;
  return model = (async () => {
    loaded = 0;
    const cache = await openCache();
    // First verify the cached runtime. Don't hydrate 118 MB of cached weights when
    // speculation cannot build a session. A user-triggered read preserves the parallel asset load.
    const cachedWasm = mode === 'prepare' ? await loadTutorModelWasm(true) : undefined;
    const allowDownload = mode === 'approved';
    const files = [fetchFile(EQUATION_MODEL.files.tokenizer, cache, allowDownload), fetchFile(EQUATION_MODEL.files.encoder, cache, allowDownload),
      fetchFile(EQUATION_MODEL.files.decoder, cache, allowDownload)] as const;
    const [wasm, tokenizer, encoderBytes, decoderBytes] = await Promise.all([cachedWasm ?? loadTutorModelWasm(), ...files]);
    const vocabulary = vocabularyFrom(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(tokenizer)));
    if (env.versions.web !== TUTOR_RUNTIME.version) throw new Error('Mismatched recognition runtime');
    // N223: every core when the page is cross-origin isolated (WASM threads need SharedArrayBuffer); otherwise one.
    env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : TUTOR_RUNTIME.threads;
    // The worker entry is bundled with the application. Its URL is NOT the Emscripten pthread entry:
    // spawning that file again leaves session creation waiting forever. Give ORT its own packaged module.
    if (env.wasm.numThreads > 1) env.wasm.wasmPaths = {mjs: new URL(threadModuleUrl, self.location.href).href};
    env.wasm.proxy = false;
    env.wasm.wasmBinary = wasm;
    try {
      const encoder = await InferenceSession.create(encoderBytes, {executionProviders: ['wasm']});
      const decoder = await InferenceSession.create(decoderBytes, {executionProviders: ['wasm']});
      const {encoder: e, decoder: d} = EQUATION_MODEL;
      if (encoder.inputNames[0] !== e.input || encoder.outputNames[0] !== e.output ||
          !decoder.inputNames.includes(d.ids) || !decoder.inputNames.includes(d.hidden) || decoder.outputNames[0] !== d.output) {
        throw new Error('Mismatched recognition model');
      }
      return {encoder, decoder, vocabulary};
    } finally {delete env.wasm.wasmBinary;}
  })().catch(error => {model = undefined; throw error;});
}

async function recognize(id: number, pixels: Float32Array, allowDownload: boolean): Promise<string> {
  const {encoder, decoder, vocabulary} = await load(allowDownload ? 'approved' : 'installed');
  if (id !== latest) throw new Error(CANCELLED);
  const size = EQUATION_MODEL.inputSize;
  const {[EQUATION_MODEL.encoder.output]: hidden} = await encoder.run({[EQUATION_MODEL.encoder.input]: new Tensor('float32', pixels, [1, 3, size, size])});
  const ids = await greedyDecode(async tokens => {
    if (id !== latest) throw new Error(CANCELLED);
    const input = new Tensor('int64', BigInt64Array.from(tokens, BigInt), [1, tokens.length]);
    const {[EQUATION_MODEL.decoder.output]: logits} = await decoder.run({[EQUATION_MODEL.decoder.ids]: input, [EQUATION_MODEL.decoder.hidden]: hidden});
    const data = logits.data as Float32Array, vocab = EQUATION_MODEL.vocabSize;
    return data.slice((tokens.length - 1) * vocab, tokens.length * vocab);
  });
  return cleanLatex(decodeTokens(ids, vocabulary));
}

scope.onmessage = event => {
  const request = event.data;
  if (request.type === 'status') {
    void openCache().then(async cache => {
      const files = Object.values(EQUATION_MODEL.files);
      // A status probe needs only the keys. Don't open three unused response bodies (~118 MB).
      const keys = await cache?.keys().catch(() => []);
      const urls = new Set(keys?.map(request => request.url));
      scope.postMessage({type: 'status', cached: files.every(file => urls.has(equationModelUrl(file)))});
    });
  } else if (request.type === 'prepare') {
    void load('prepare').catch(() => undefined);
  } else if (request.type === 'recognize') {
    latest = request.id;
    recognize(request.id, request.pixels, request.allowDownload).then(latex => scope.postMessage({type: 'result', id: request.id, latex}),
      (error: unknown) => scope.postMessage({type: 'error', id: request.id,
        message: error instanceof Error ? error.message : 'Recognition failed.', downloadRequired: error instanceof DownloadRequired}));
  }
};
