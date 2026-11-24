import type {CalibrationRow} from '../calibration';
import type {DecoderAssetFile} from './assets';

export type NeuralBackend = 'wasm' | 'webgpu' | 'webgpuJspi';
export type NeuralTier = 'neural-v2' | 'neural-large-v2';
export interface NeuralManifest {
  readonly version: 2;
  readonly kind: 'neural';
  readonly context: number;
  readonly layers: number;
  readonly heads: number;
  readonly headDim: number;
  readonly vocabSize: number;
  readonly files: Readonly<{tokenizer: DecoderAssetFile; prefill: DecoderAssetFile; incremental: DecoderAssetFile; weights?: DecoderAssetFile}>;
  readonly blendWeight?: number;
  readonly calibration?: readonly CalibrationRow[];
  readonly qualification?: Readonly<{parity?: boolean; replay?: boolean; wasm?: boolean; webgpu?: boolean; webgpuJspi?: boolean}>;
}
const manifests = import.meta.glob<NeuralManifest>('../../../../../public/models/typeahead/*/manifest.json', {import: 'default'});

export async function neuralManifest(tier: NeuralTier): Promise<NeuralManifest | null> {
  const load = manifests['../../../../../public/models/typeahead/' + tier + '/manifest.json'];
  const model = await load?.();
  if (!model || model.version !== 2 || model.kind !== 'neural' ||
      model.context !== (tier === 'neural-v2' ? 512 : 1024) || model.layers < 1 || model.layers > 12 ||
      model.heads < 1 || model.heads > 12 || model.headDim < 1 || model.headDim > 128 ||
      model.vocabSize < 262 || model.vocabSize > 16384 ||
      !model.files || ![model.layers, model.heads, model.headDim, model.vocabSize].every(Number.isInteger)) return null;
  if (model.blendWeight !== undefined && (!Number.isFinite(model.blendWeight) || model.blendWeight < 0 || model.blendWeight > 1)) return null;
  const files = [model.files.tokenizer, model.files.prefill, model.files.incremental, ...model.files.weights ? [model.files.weights] : []];
  if (files.some(file => !file || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f\d]{64}$/u.test(file.sha256))) return null;
  const uniqueAssets = new Map(files.map(file => [file.sha256, file.bytes]));
  const sum = [...uniqueAssets.values()].reduce((total, bytes) => total + bytes, 0);
  if (sum > (tier === 'neural-v2' ? 40 : 48) * 1024 * 1024 || model.files.tokenizer.bytes > 4 * 1024 * 1024) return null;
  return model;
}

export function qualifiedNeuralTier(model: NeuralManifest | null, device: NeuralBackend, trial = false): boolean {
  return model?.qualification?.parity === true && (trial || model.qualification.replay === true && model.qualification[device] === true);
}


const MiB = 1024 * 1024;
export const TYPEAHEAD_RUNTIME_VERSION = '1.27.0';
const COLD_RUNTIME_BYTES: Record<NeuralBackend, number> = {
  wasm: 13_479_978,
  webgpu: 24_254_953,
  webgpuJspi: 15_046_878,
};

/** Charge the selected backend as a cold download and reserve the n-gram/subject/equation budget. */
export function neuralFitsColdBudget(model: NeuralManifest, tier: NeuralTier, device: NeuralBackend): boolean {
  const files = Object.values(model.files).filter((file): file is DecoderAssetFile => Boolean(file));
  const assets = [...new Map(files.map(file => [file.sha256, file.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0);
  const limit = (tier === 'neural-v2' ? 68 : 76) * MiB;
  return assets + COLD_RUNTIME_BYTES[device] + 29 * MiB <= limit;
}

export function selectNeuralBackend(model: NeuralManifest, tier: NeuralTier, gpuAvailable: boolean, supportsJspi: boolean,
  trial: boolean): NeuralBackend | undefined {
  const choices: readonly NeuralBackend[] = gpuAvailable
    ? supportsJspi ? ['webgpuJspi', 'webgpu', 'wasm'] : ['webgpu', 'wasm']
    : ['wasm'];
  return choices.find(device => (device !== 'wasm' || tier === 'neural-v2') && qualifiedNeuralTier(model, device, trial) &&
    (trial || neuralFitsColdBudget(model, tier, device)));
}
