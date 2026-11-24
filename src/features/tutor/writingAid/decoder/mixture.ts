const COMPONENTS = ['general', 'subject', 'question', 'draft', 'personal'] as const;
export type MixWeights = readonly [number, number, number, number, number];
interface MixtureWeights {
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
  const input = value as {version: unknown; components: unknown; global: unknown; subjects: unknown};
  const global = weights(input.global);
  if (input.version !== 1 || !Array.isArray(input.components) ||
      input.components.join(',') !== COMPONENTS.join(',') || !global) return;
  const subjects = new Map<string, MixWeights>();
  if (input.subjects && typeof input.subjects === 'object') {
    for (const [subject, row] of Object.entries(input.subjects).slice(0, 120)) {
      const fit = weights(row);
      if (fit && /^[a-z0-9_-]{1,80}$/u.test(subject)) subjects.set(subject, fit);
    }
  }
  return {global, subjects};
}

const artifacts = import.meta.glob('../../../../../public/models/typeahead/*/mixture.json', {import: 'default'});
let model: MixtureWeights | undefined;
let loading: Promise<void> | undefined;
export function loadTypeaheadMixture(): Promise<void> {
  return loading ??= Promise.resolve(artifacts['../../../../../public/models/typeahead/ngram-v2/mixture.json']?.())
    .then(data => {model = parseMixture(data);}).catch(() => undefined);
}

export function subjectWeights(subject?: string): MixWeights | undefined {
  return (subject ? model?.subjects.get(subject) : undefined) ?? model?.global;
}
