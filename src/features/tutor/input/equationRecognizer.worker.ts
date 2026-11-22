/**
 * N221 · the equation recogniser's worker: downloads Pix2Text MFR once (each file checked against its pinned SHA-256,
 * then cached), runs the encoder on the drawing and decodes LaTeX greedily with the decoder. See equationModel.ts.
 */
import {env, InferenceSession, Tensor} from 'onnxruntime-web/wasm';
import {EQUATION_MODEL, EQUATION_MODEL_BYTES, EQUATION_MODEL_CACHE, equationModelUrl, type EquationModelFile} from './equationModel';
import {cleanLatex, decodeTokens, greedyDecode, vocabularyFrom} from './equationRecognition';
import {loadTutorModelWasm, MODEL_MANIFEST} from './modelAssets';

// The same verified onnxruntime-web WASM as Draw symbol and Equation Assist.
const TUTOR_RUNTIME = MODEL_MANIFEST.runtime;

export type EquationWorkerRequest =
  | {type: 'status'}
  | {type: 'recognize'; id: number; pixels: Float32Array};
export type EquationWorkerResponse =
  | {type: 'status'; cached: boolean}
  | {type: 'progress'; loaded: number; total: number}
  | {type: 'result'; id: number; latex: string}
  | {type: 'error'; id?: number; message: string};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EquationWorkerRequest>) => void) | null;
  postMessage: (message: EquationWorkerResponse) => void;
};
let model: Promise<{encoder: InferenceSession; decoder: InferenceSession; vocabulary: string[]}> | undefined;
let loaded = 0;

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
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (offset !== file.bytes || digest !== file.sha256) throw new Error('The recognition model did not match its checksum.');
  return bytes;
}

async function fetchFile(file: EquationModelFile, cache: Cache | undefined): Promise<Uint8Array> {
  const url = equationModelUrl(file);
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {
      const bytes = await readVerified(cached, file, false);
      loaded += file.bytes;
      scope.postMessage({type: 'progress', loaded, total: EQUATION_MODEL_BYTES});
      return bytes;
    } catch {await cache?.delete(url).catch(() => undefined);}
  }
  const response = await fetch(url, {mode: 'cors', credentials: 'omit', redirect: 'follow'});
  const bytes = await readVerified(response, file, true);
  await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
  return bytes;
}

function load() {
  return model ??= (async () => {
    loaded = 0;
    const cache = await openCache();
    const [wasm, tokenizer, encoderBytes, decoderBytes] = await Promise.all([loadTutorModelWasm(),
      fetchFile(EQUATION_MODEL.files.tokenizer, cache), fetchFile(EQUATION_MODEL.files.encoder, cache),
      fetchFile(EQUATION_MODEL.files.decoder, cache)]);
    const vocabulary = vocabularyFrom(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(tokenizer)));
    if (env.versions.web !== TUTOR_RUNTIME.version) throw new Error('Mismatched recognition runtime');
    env.wasm.numThreads = TUTOR_RUNTIME.threads;
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

async function recognize(pixels: Float32Array): Promise<string> {
  const {encoder, decoder, vocabulary} = await load();
  const size = EQUATION_MODEL.inputSize;
  const {[EQUATION_MODEL.encoder.output]: hidden} = await encoder.run({[EQUATION_MODEL.encoder.input]: new Tensor('float32', pixels, [1, 3, size, size])});
  const ids = await greedyDecode(async tokens => {
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
      const hits = await Promise.all(files.map(file => cache?.match(equationModelUrl(file)).catch(() => undefined)));
      scope.postMessage({type: 'status', cached: hits.every(Boolean)});
    });
  } else if (request.type === 'recognize') {
    recognize(request.pixels).then(latex => scope.postMessage({type: 'result', id: request.id, latex}),
      (error: unknown) => scope.postMessage({type: 'error', id: request.id,
        message: error instanceof Error ? error.message : 'Recognition failed.'}));
  }
};
