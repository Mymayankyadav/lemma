import {env, InferenceSession, Tensor} from 'onnxruntime-web/wasm';
import manifest from '../../../../public/models/equation-assist/autoeq-v1.4/manifest.json';
import {loadTutorModelWasm, loadVerifiedModelAsset, MODEL_MANIFEST} from '../../tutor/input/modelAssets';
import {decodeEquation} from './decode';
import {OrtStepper, type Vocabulary} from './upstreamDecoder.js';

type Request = {id: number; text: string};
export type AutoeqReply = {id: number; latex: string[] | null};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (reply: AutoeqReply) => void;
};
let pending: Request | undefined;
let latestId: number | undefined;
let busy = false;
let model: ReturnType<typeof loadModel> | undefined;

async function loadModel() {
  if (env.versions.web !== MODEL_MANIFEST.runtime.version) throw new Error('Mismatched ONNX runtime');
  const cache = import.meta.env.MODE === 'android' ? undefined
    : await self.caches?.open('lemma-equation-assist-' + manifest.revision).catch(() => undefined);
  const get = (file: typeof manifest.files.encoder) => loadVerifiedModelAsset(new URL(
    import.meta.env.BASE_URL + 'models/equation-assist/' + manifest.version + '/' + file.path, self.location.origin,
  ).href, file, cache);
  const [encoder, decoder, vocab, wasm] = await Promise.all([
    get(manifest.files.encoder), get(manifest.files.decoder), get(manifest.files.vocab), loadTutorModelWasm(),
  ]);
  env.wasm.numThreads = 1;
  env.wasm.proxy = false;
  env.wasm.wasmBinary = wasm;
  const options: InferenceSession.SessionOptions = {executionProviders: ['wasm'], graphOptimizationLevel: 'all'};
  const vocabulary = JSON.parse(new TextDecoder().decode(vocab)) as Vocabulary;
  try {
    const enc = await InferenceSession.create(encoder, options);
    try {
      const dec = await InferenceSession.create(decoder, options);
      return {
        stepper: new OrtStepper({Tensor}, enc, dec),
        vocabulary,
      };
    } catch (error) {
      await enc.release();
      throw error;
    }
  } finally {
    delete env.wasm.wasmBinary;
  }
}

async function drain() {
  if (busy) return;
  busy = true;
  try {
    while (pending) {
      const {id, text} = pending;
      pending = undefined;
      try {
        const {stepper, vocabulary} = await (model ??= loadModel().catch(error => {
          model = undefined;
          throw error;
        }));
        if (latestId !== id) continue;
        const candidates = await decodeEquation(stepper, vocabulary, text, () => latestId !== id);
        if (latestId === id) scope.postMessage({id, latex: candidates?.map(candidate => candidate.latex) ?? []});
      } catch {
        if (latestId === id) scope.postMessage({id, latex: null});
      }
    }
  } finally {
    busy = false;
  }
}

scope.onmessage = ({data}) => {
  if (typeof data?.text !== 'string' || data.text.length > 128 || !Number.isSafeInteger(data.id)) return;
  if (data.text === '') {
    if (latestId === data.id) {
      latestId = undefined;
      pending = undefined;
    }
    return;
  }
  latestId = data.id;
  pending = data;
  void drain();
};
