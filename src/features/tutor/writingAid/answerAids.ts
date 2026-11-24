/**
 * N234 · the tutor's answer aids as the suggestion engine uses them (behind the tutorAnswerAids flag).
 *
 *  - terms and symbols join the question's own words and variables (the decoder's context), so they rank higher and count as
 *    terms the learner may restate;
 *  - wording phrases are offered one word at a time while the learner writes them, at the `scaffold` level only;
 *  - withheld terms are never suggested, at any prefix and at any level.
 *
 * The level the tutor sets is a ceiling that fades with the learner's mastery (effectiveAidLevel). Nothing here applies a
 * suggestion: the learner taps, as with every other suggestion.
 */
import {effectiveAidLevel, type AnswerAidLevel, type TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';

export interface ActiveAid {
  readonly level: AnswerAidLevel;
  readonly wording: readonly string[];
  readonly terms: readonly string[];
  readonly symbols: readonly string[];
  readonly withhold: readonly string[];
}

let active: ActiveAid | null = null;
let withheld = new Set<string>();
/** Words too common to withhold on their own, when they only appear inside a longer withheld phrase. */
const COMMON = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'by', 'with', 'that', 'this', 'it']);

/** The aids to use for the next answer, faded by mastery (0 to 1); null clears them. */
export function setAnswerAid(aid: TutorAnswerAid | null, mastery?: number): void {
  if (!aid) {active = null; withheld = new Set(); return;}
  active = {level: effectiveAidLevel(aid.level, mastery), wording: aid.wording, terms: aid.terms, symbols: aid.symbols, withhold: aid.withhold};
  withheld = new Set(aid.withhold.flatMap(term => {
    const words = term.toLowerCase().split(/[\s-]+/).filter(Boolean);
    return words.length === 1 ? words : words.filter(word => word.length > 3 && !COMMON.has(word));
  }));
}
export const activeAnswerAid = (): ActiveAid | null => active;

/** Texts for the decoder's context: the terms and symbols, unless the aids have faded away. */
export function answerAidContext(): string[] {
  return active && active.level !== 'none' ? [...active.terms, ...active.symbols] : [];
}

/** A withheld term is never offered, whatever has been typed. */
export const isWithheld = (word: string): boolean => withheld.size > 0 && withheld.has(word.toLowerCase());

const norm = (token: string) => token.toLowerCase().replace(/[.,;:!?]+$/u, '');
const BREAK = /[.!?]\s+|\n\s*/gu;

export interface BankWord {readonly word: string; readonly score: number}

/**
 * The next word of a tutor's wording phrase, for the text before the caret (`before`) and the letters typed of the word
 * (`prefix`). A phrase continues when the sentence's last k words are its first k (k = 0 starts one), and k is at least 2
 * or the whole sentence so far, so a common word alone does not start a phrase. The best of several phrases comes first.
 */
export function bankSuggestions(before: string, prefix: string): BankWord[] {
  if (!active || active.level !== 'scaffold' || !active.wording.length) return [];
  let start = 0;
  for (const match of before.matchAll(BREAK)) start = match.index! + match[0].length;
  const typed = before.slice(start).split(/\s+/u).filter(Boolean).map(norm);
  const found = new Map<string, number>();
  for (const phrase of active.wording) {
    const words = phrase.split(/\s+/u).filter(Boolean);
    for (let k = 0; k < words.length && k <= typed.length; k++) {
      if (k === 0 ? typed.length > 0 : !(k >= 2 || k === typed.length) || !words.slice(0, k).every((word, i) => norm(word) === typed[typed.length - k + i])) continue;
      const next = words[k];
      if (prefix && !next.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      if (isWithheld(norm(next))) continue;
      const score = k === 0 ? Math.log(.2) : Math.log(Math.min(.9, .4 + .15 * k));
      found.set(next, Math.max(found.get(next) ?? -Infinity, score));
    }
  }
  return [...found].map(([word, score]) => ({word, score})).sort((a, b) => b.score - a.score);
}
