import fit from './menu-ranker.json';
import type {MenuEdit} from './menuEdit';

export type MenuSource = 'word' | 'bank' | 'personal' | 'symbol' | 'equation' | 'notation' | 'neural';
const sources: MenuSource[] = ['word', 'bank', 'personal', 'symbol', 'equation', 'notation', 'neural'];
export function menuFeatures(source: MenuSource, base: number, prefix: number, inserted: number) {
  return [Math.max(-24, Math.min(0, base)) / 8, Number(prefix > 0), Math.min(1, prefix / Math.max(1, inserted)),
    ...sources.map(value => Number(value === source))];
}
export function menuScore(base: number, adjustment: number, features: readonly number[], sha?: string) {
  const coefficients: readonly number[] = fit.coefficients;
  const correction = sha && sha === fit.ngramSha256 && coefficients.length === features.length
    ? features.reduce((sum, value, index) => sum + value * coefficients[index], 0) : 0;
  return base + correction + adjustment;
}
export type WordTrace = MenuEdit & {source: MenuSource; eligible: boolean};
