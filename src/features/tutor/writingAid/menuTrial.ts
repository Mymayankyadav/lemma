const MENU_TRIALS = ['m1', 'm1-neutral', 'm2', 'm2-tutor', 'm2-right'] as const;
export type MenuTrial = typeof MENU_TRIALS[number];

const parseMenuTrial = (value: unknown): MenuTrial | undefined => MENU_TRIALS.find(trial => value === trial);

export function resolveMenuTrial(search: string, overridesAllowed: boolean, expanded: boolean): MenuTrial | undefined {
  if (!overridesAllowed || !expanded) return;
  return parseMenuTrial(new URLSearchParams(search).get('typeahead-menu'));
}

export function currentMenuTrial(expanded: boolean): MenuTrial | undefined {
  const env = import.meta.env;
  return resolveMenuTrial(typeof window === 'undefined' ? '' : window.location.search,
    Boolean(env.DEV) || env.MODE === 'test' || env.VITE_ALLOW_FLAG_OVERRIDES === '1', expanded);
}

export const usesMenuTutorPriority = (trial?: MenuTrial): boolean =>
  trial === undefined || trial === 'm1' || trial === 'm2-tutor';
