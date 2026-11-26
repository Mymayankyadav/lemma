const COMPONENTS = ['general', 'subject', 'question', 'draft', 'personal'] as const;
export type MixWeights = readonly [number, number, number, number, number];
interface MixtureWeights {
  readonly assetSha256: string;
  readonly subjectAssetSha256: ReadonlyMap<string, string>;
  readonly global: MixWeights;
  readonly subjects: ReadonlyMap<string, MixWeights>;
}

function weights(value: unknown): MixWeights | undefined {
  if (!Array.isArray(value) || value.length !== COMPONENTS.length ||
      value.some(item => !Number.isFinite(item) || item < 0 || item > 1) ||
      Math.abs(value.reduce((sum, item) => sum + item, 0) - 1) > 1e-6) return undefined;
  return value as unknown as MixWeights;
}

export function parseMixture(value: unknown): MixtureWeights | undefined {
  if (!value || typeof value !== 'object') return;
  const input = value as {version: unknown; captureVersion: unknown; status: unknown; assetSha256: unknown;
    subjectAssetSha256: unknown; components: unknown; global: unknown; subjects: unknown};
  const global = weights(input.global);
  const sha = /^[a-f0-9]{64}$/u;
  const subjectKey = /^[a-z0-9_-]{1,80}$/u;
  if (input.version !== 1 || input.captureVersion !== 'n238-mixture-v1' || input.status !== 'validated' ||
      typeof input.assetSha256 !== 'string' || !sha.test(input.assetSha256) ||
      !input.subjectAssetSha256 || typeof input.subjectAssetSha256 !== 'object' || Array.isArray(input.subjectAssetSha256) ||
      !Array.isArray(input.components) ||
      input.components.join(',') !== COMPONENTS.join(',') || !global || global[4] !== 0) return;
  const subjectAssetSha256 = new Map<string, string>();
  for (const [subject, digest] of Object.entries(input.subjectAssetSha256)) {
    if (!subjectKey.test(subject) || typeof digest !== 'string' || !sha.test(digest) || subjectAssetSha256.size >= 120) return;
    subjectAssetSha256.set(subject, digest);
  }
  const subjects = new Map<string, MixWeights>();
  if (input.subjects && typeof input.subjects === 'object') {
    for (const [subject, row] of Object.entries(input.subjects).slice(0, 120)) {
      const fit = weights(row);
      if (fit && fit[4] === 0 && subjectKey.test(subject)) subjects.set(subject, fit);
    }
  }
  return {assetSha256: input.assetSha256, subjectAssetSha256, global, subjects};
}

const artifacts = import.meta.glob('../../../../../public/models/typeahead/*/mixture.json', {import: 'default'});
let model: MixtureWeights | undefined;
let loading: Promise<void> | undefined;
export function loadTypeaheadMixture(): Promise<void> {
  return loading ??= Promise.resolve(artifacts['../../../../../public/models/typeahead/ngram-v2/mixture.json']?.())
    .then(data => {model = parseMixture(data);}).catch(() => undefined);
}

export function subjectWeights(assetSha256: string | undefined, subject?: string, subjectSha?: string): MixWeights | undefined {
  if (!model || model.assetSha256 !== assetSha256 || (subject && model.subjectAssetSha256.get(subject) !== subjectSha)) return undefined;
  return (subject ? model.subjects.get(subject) : undefined) ?? model.global;
}
