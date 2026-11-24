const ARMS = ['corrected-v1', 'expanded-kn', 'neural', 'tutor', 'personal'] as const;
export type TypeaheadArm = typeof ARMS[number];

export function resolveTypeaheadArm(search: string, overridesAllowed: boolean): TypeaheadArm {
  const arm = overridesAllowed ? new URLSearchParams(search).get('typeahead-arm') : null;
  return ARMS.find(value => value === arm) ?? 'personal';
}

const overridesAllowed = () => {
  const env = import.meta.env;
  return Boolean(env.DEV) || env.MODE === 'test' || env.VITE_ALLOW_FLAG_OVERRIDES === '1';
};

export function currentTypeaheadArm(): TypeaheadArm {
  return resolveTypeaheadArm(typeof window === 'undefined' ? '' : window.location.search,
    overridesAllowed());
}

export const usesExpandedNgram = (arm?: TypeaheadArm) => arm !== 'corrected-v1';
export const usesNeural = (arm?: TypeaheadArm) => arm !== 'corrected-v1' && arm !== 'expanded-kn';
export const usesTutorBias = (arm?: TypeaheadArm) => arm === undefined || arm === 'tutor' || arm === 'personal';
export const usesPersonalization = (arm?: TypeaheadArm) => arm === undefined || arm === 'personal';

export function typeaheadReplayEnabled(): boolean {
  if (typeof window === 'undefined' || !overridesAllowed()) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('typeahead-replay') === '1' || ARMS.some(arm => arm === params.get('typeahead-arm'));
}

/** A local replay can measure a parity-checked graph before it qualifies for product use. */
export function typeaheadGraphTrial(): boolean {
  if (typeof window === 'undefined' || !overridesAllowed()) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('typeahead-graph-trial') !== '1') return false;
  const arm = params.get('typeahead-arm');
  return arm === 'neural' || arm === 'tutor' || arm === 'personal';
}

/** A replay may bypass release qualification while keeping the production cold-transfer caps. */
export function typeaheadStrictGraphTrial(): boolean {
  return typeaheadGraphTrial() && new URLSearchParams(window.location.search).get('typeahead-strict-trial') === '1';
}

export function typeaheadFrozenProfile(): boolean {
  return typeaheadReplayEnabled() && new URLSearchParams(window.location.search).get('typeahead-frozen-profile') === '1';
}

export function typeaheadGhostProbe(): boolean {
  return typeaheadReplayEnabled() && typeaheadGraphTrial() &&
    new URLSearchParams(window.location.search).get('typeahead-ghost-probe') === '1';
}
