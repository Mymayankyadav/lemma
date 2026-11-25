import {neuralCalibrationFingerprint, parseNeuralCalibration, type CalibrationRow} from '../calibration';
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
type PersistedManifest = Omit<NeuralManifest, 'calibration'> & {calibration?: unknown};
const manifests = import.meta.glob<PersistedManifest>('../../../../../public/models/typeahead/*/manifest.json', {import: 'default'});

export function neuralFileBytes(files: NeuralManifest['files']): number | undefined {
  const roles = [files.tokenizer, files.prefill, files.incremental, ...files.weights ? [files.weights] : []];
  const byPath = new Map<string, DecoderAssetFile>();
  for (const file of roles) {
    if (!file || typeof file.path !== 'string' || !/^[a-z0-9][a-z0-9_.-]*$/u.test(file.path) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f0-9]{64}$/u.test(file.sha256)) return undefined;
    const previous = byPath.get(file.path);
    if (previous && (previous.bytes !== file.bytes || previous.sha256 !== file.sha256)) return undefined;
    byPath.set(file.path, file);
  }
  return [...byPath.values()].reduce((sum, file) => sum + file.bytes, 0);
}

export async function neuralManifest(tier: NeuralTier): Promise<NeuralManifest | null> {
  const load = manifests['../../../../../public/models/typeahead/' + tier + '/manifest.json'];
  const model = await load?.();
  if (!model || model.version !== 2 || model.kind !== 'neural' ||
      model.context !== (tier === 'neural-v2' ? 512 : 1024) || model.layers < 1 || model.layers > 12 ||
      model.heads < 1 || model.heads > 12 || model.headDim < 1 || model.headDim > 128 ||
      model.vocabSize < 262 || model.vocabSize > 16384 ||
      !model.files || ![model.layers, model.heads, model.headDim, model.vocabSize].every(Number.isInteger)) return null;
  if (model.blendWeight !== undefined && (!Number.isFinite(model.blendWeight) || model.blendWeight < 0 || model.blendWeight > 1)) return null;
  const bytes = neuralFileBytes(model.files);
  if (bytes === undefined || bytes > (tier === 'neural-v2' ? 40 : 48) * 1024 * 1024 ||
      model.files.tokenizer.bytes > 4 * 1024 * 1024) return null;
  return {...model, calibration: parseNeuralCalibration(model.calibration, neuralCalibrationFingerprint(model.files))};
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
export function neuralColdTransfer(model: NeuralManifest, tier: NeuralTier, device: NeuralBackend) {
  const modelBytes = neuralFileBytes(model.files) ?? Infinity;
  const runtimeBytes = COLD_RUNTIME_BYTES[device], supportReserveBytes = 29 * MiB;
  return {modelBytes, runtimeBytes, supportReserveBytes, totalBytes: modelBytes + runtimeBytes + supportReserveBytes,
    limitBytes: (tier === 'neural-v2' ? 68 : 76) * MiB};
}

export function neuralFitsColdBudget(model: NeuralManifest, tier: NeuralTier, device: NeuralBackend): boolean {
  const {totalBytes, limitBytes} = neuralColdTransfer(model, tier, device);
  return totalBytes <= limitBytes;
}

export function selectNeuralBackend(model: NeuralManifest, tier: NeuralTier, gpuAvailable: boolean, supportsJspi: boolean,
  trial: boolean, strictTrial = false): NeuralBackend | undefined {
  const choices: readonly NeuralBackend[] = gpuAvailable
    ? supportsJspi ? ['webgpuJspi', 'webgpu', 'wasm'] : ['webgpu', 'wasm']
    : ['wasm'];
  return choices.find(device => (device !== 'wasm' || tier === 'neural-v2') && qualifiedNeuralTier(model, device, trial) &&
    (trial && !strictTrial || neuralFitsColdBudget(model, tier, device)));
}
