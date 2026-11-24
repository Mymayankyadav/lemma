import type {CalibrationRow} from '../calibration';
import type {DecoderAssetFile} from './assets';

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
  readonly qualification?: Readonly<{parity?: boolean; replay?: boolean; wasm?: boolean; webgpu?: boolean}>;
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

export function qualifiedNeuralTier(model: NeuralManifest | null, device: 'wasm' | 'webgpu', trial = false): boolean {
  return model?.qualification?.parity === true && (trial || model.qualification.replay === true && model.qualification[device] === true);
}
