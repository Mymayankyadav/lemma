import fit from './menu-ranker.json';
import actionFit from './menu-action-ranker.json';
import type {MenuEdit} from './menuEdit';
import {usesMenuTutorPriority, type MenuTrial} from './menuTrial';

export type MenuSource = 'word' | 'bank' | 'personal' | 'symbol' | 'equation' | 'notation' | 'neural'
  | 'question' | 'paragraph' | 'literal' | 'declared' | 'phrase';
const sources: MenuSource[] = ['word', 'bank', 'personal', 'symbol', 'equation', 'notation', 'neural'];
const trialSources: MenuSource[] = ['question', 'paragraph', 'literal', 'declared'];
export function menuFeatures(source: MenuSource, base: number, prefix: number, inserted: number) {
  const legacy = source === 'literal' || source === 'phrase' ? 'bank' : source === 'declared' ? 'symbol' :
    source === 'question' || source === 'paragraph' ? 'word' : source;
  return [Math.max(-24, Math.min(0, base)) / 8, Number(prefix > 0), Math.min(1, prefix / Math.max(1, inserted)),
    ...sources.map(value => Number(value === legacy))];
}
export function menuScore(base: number, adjustment: number, features: readonly number[], sha?: string) {
  const coefficients: readonly number[] = fit.coefficients;
  const correction = sha && sha === fit.ngramSha256 && coefficients.length === features.length
    ? features.reduce((sum, value, index) => sum + value * coefficients[index], 0) : 0;
  return base + correction + adjustment;
}
export type WordTrace = MenuEdit & {source: MenuSource; eligible: boolean;
  reason?: 'grammar' | 'range' | 'duplicate' | 'eligibility'};

interface ActionFeatures {
  readonly source: MenuSource;
  readonly base: number;
  readonly edit: MenuEdit;
  readonly previous: boolean;
  readonly draft: string;
  readonly recurrence?: readonly [number, number];
  readonly rightGain?: number;
  readonly mode: 'prose' | 'equation';
}

export function actionFeatures({source, base, edit, previous, draft, recurrence, rightGain, mode}: ActionFeatures): number[] {
  const typed = draft.slice(edit.start, edit.end);
  const started = typed.length > 0;
  const actions = [...edit.insert].length - [...typed].length - 1;
  const boundedSaved = Math.max(-1, Math.min(12, actions)) / 12;
  return [...menuFeatures(source, base, typed.length, edit.insert.length),
    ...trialSources.map(value => Number(source === value)),
    Math.min(1, typed.length / 8), started ? 0 : boundedSaved, started ? boundedSaved : 0,
    Math.min(4, recurrence?.[0] ?? 0) / 4, Math.min(4, recurrence?.[1] ?? 0) / 4,
    Number(/[,.!?:;…]\s*$/u.test(edit.insert)), Number(/^\s*[,;:.!?…]/u.test(draft.slice(edit.end))),
    Number(mode === 'equation'), Number(previous), Math.max(-4, Math.min(4, rightGain ?? 0)) / 4];
}

export function actionMenuScore(neutral: number, signed: number, features: readonly number[], trial: MenuTrial,
  sha: string | undefined, tutorGroup: string): number {
  if (trial === 'm1' || trial === 'm1-neutral') return neutral + (usesMenuTutorPriority(trial) ? signed : 0);
  const coefficients: readonly number[] = actionFit.coefficients;
  if (sha !== actionFit.ngramSha256 || coefficients.length !== features.length - 1) return neutral;
  const learned = coefficients.reduce((sum, weight, index) => sum + weight * features[index], 0);
  const right = trial === 'm2-right' ? actionFit.rightWeight * features[features.length - 1] : 0;
  const tutorWeights: Readonly<Record<string, number>> = actionFit.tutorWeights;
  const tutor = trial === 'm2-tutor' ? Math.max(0, Math.min(1, tutorWeights[tutorGroup] ?? 0)) * signed : 0;
  return neutral + learned + right + tutor;
}
