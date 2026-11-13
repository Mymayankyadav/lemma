import {isFlagOn} from '../../flags';
import './paper.css';

/** N157 · U4 S14 paper and sky (flag v7Paper): one choice per theme, kept on this device. */
export const PAPERS = ['plain', 'graph', 'dot', 'ruled'] as const;
export const SKIES = ['clear', 'stars'] as const;
export type Paper = typeof PAPERS[number];
export type Sky = typeof SKIES[number];
const PAPER_KEY = 'lemma.v7.paper', SKY_KEY = 'lemma.v7.sky';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {const value = localStorage.getItem(key) as T | null; return value && allowed.includes(value) ? value : fallback;} catch {return fallback;}
}
export const readPaper = () => read<Paper>(PAPER_KEY, PAPERS, 'plain');
export const readSky = () => read<Sky>(SKY_KEY, SKIES, 'clear');

/** Put the chosen paper and sky on <html> (the stylesheet draws them; Reduce effects turns them off). */
export function applyPaper(paper: Paper = readPaper(), sky: Sky = readSky()) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement, on = isFlagOn('v7Paper');
  if (on && paper !== 'plain') root.setAttribute('data-v7-paper', paper); else root.removeAttribute('data-v7-paper');
  if (on && sky !== 'clear') root.setAttribute('data-v7-sky', sky); else root.removeAttribute('data-v7-sky');
}
export function choosePaper(paper: Paper) {
  try {localStorage.setItem(PAPER_KEY, paper);} catch {/* this visit only */}
  applyPaper(paper, readSky());
}
export function chooseSky(sky: Sky) {
  try {localStorage.setItem(SKY_KEY, sky);} catch {/* this visit only */}
  applyPaper(readPaper(), sky);
}
