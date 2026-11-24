/**
 * N234 · the tutor's answer aids as the suggestion engine uses them (behind the tutorAnswerAids flag).
 *
 *  - question occurrences, tutor terms, and ranking hints enter separate features;
 *  - wording phrases are offered one word at a time while the learner writes them, at the `scaffold` level only;
 *  - withheld terms are never suggested, at any prefix and at any level.
 *
 * The level the tutor sets is a ceiling that fades with the learner's mastery (effectiveAidLevel). Nothing here applies a
 * suggestion: the learner taps, as with every other suggestion.
 */
import {aidEntryKey, effectiveAidLevel, type AidRole, type TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';

const BREAK = /[.!?]\s+|\n\s*/gu;

export interface AidRankingContext {
  readonly aid?: TutorAnswerAid | null;
  readonly mastery?: number;
  readonly subject?: string;
  readonly step?: string;
  readonly mode: 'prose' | 'equation';
  readonly before: string;
  readonly prefix: string;
}

const bias = {prefer: 1, neutral: 0, deemphasize: -1} as const;
const roleOrder = {neutral: 0, given: 1, learner: 2, alternative: 3, goal: 4} as const;

function sentenceTail(before: string): string {
  const breaks = [...before.matchAll(BREAK)];
  const last = breaks.at(-1);
  return before.slice(last ? last.index + last[0].length : 0).trim();
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

export function tutorHint(context: AidRankingContext, insertion: string): {adjustment: number; role?: AidRole} {
  const {aid, mode, subject, step, before, prefix} = context;
  if (!aid?.ranking) return {adjustment: 0};
  const faded = effectiveAidLevel(aid.level, context.mastery) === 'none';
  const sentence = normalized(sentenceTail(before));
  const entries = new Map<string, {specificity: number; values: Set<number>; role: AidRole; strength: number}>();
  let restrictive: AidRole | undefined;
  for (const hint of aid.ranking.hints ?? []) {
    const scope = hint.scope ?? {};
    if (scope.subject !== undefined && scope.subject !== subject || scope.step !== undefined && scope.step !== step ||
        scope.mode !== undefined && scope.mode !== mode) continue;
    const prefixMatch = scope.prefixes?.reduce((longest, value) => normalized(prefix).startsWith(normalized(value))
      ? Math.max(longest, normalized(value).length) : longest, 0) ?? 0;
    const phraseMatch = scope.phraseStates?.reduce((longest, value) => sentence === normalized(value) || sentence.endsWith(' ' + normalized(value))
      ? Math.max(longest, normalized(value).length) : longest, 0) ?? 0;
    if (scope.prefixes?.length && !prefixMatch || scope.phraseStates?.length && !phraseMatch) continue;
    const equal = hint.kind === 'symbol' ? (a: string, b: string) => a.trim() === b.trim()
      : (a: string, b: string) => normalized(a) === normalized(b);
    const targets = [hint.entry, ...hint.aliases ?? []];
    const exact = targets.some(value => equal(value, insertion));
    const strength = exact ? 1 : hint.kind === 'phrase'
      ? Math.max(...targets.map(value => phraseStepWeight(value, sentence, insertion))) : 0;
    if (!strength) continue;
    if ((hint.role === 'alternative' || hint.role === 'goal') && (!restrictive || roleOrder[hint.role] > roleOrder[restrictive])) restrictive = hint.role;
    // The number of applicable axes takes precedence over prefix/phrase
    // length. Among equal axes, a longer matching condition narrows the scope.
    const axes = Number(scope.subject !== undefined) + Number(scope.step !== undefined) +
      Number(scope.mode !== undefined) + Number(Boolean(prefixMatch)) + Number(Boolean(phraseMatch));
    const specificity = 256 * axes + prefixMatch + phraseMatch;
    const key = aidEntryKey(hint.kind, hint.entry);
    const saved = entries.get(key);
    if (!saved || specificity > saved.specificity) {
      entries.set(key, {specificity, values: new Set([bias[hint.priority]]), role: hint.role, strength});
    } else if (specificity === saved.specificity) {
      saved.values.add(bias[hint.priority]);
      if (roleOrder[hint.role] > roleOrder[saved.role]) saved.role = hint.role;
    }
  }
  const matched = [...entries.values()];
  // Nested phrases or coincident aliases share the best applicable evidence.
  // Tied, contradictory hints cancel even when their entry IDs differ.
  const maximum = Math.max(-Infinity, ...matched.map(entry => entry.specificity));
  const best = matched.filter(entry => entry.specificity === maximum);
  const signed = best.map(entry => [...entry.values].reduce((sum, priority) => sum + priority, 0) * entry.strength);
  const adjustment = Math.log(2) * ((Math.max(0, ...signed) + Math.min(0, ...signed)));
  const role = restrictive ?? best.reduce<AidRole | undefined>((selected, entry) =>
    !selected || roleOrder[entry.role] > roleOrder[selected] ? entry.role : selected, undefined);
  return faded ? {adjustment: 0, role: restrictive} : {adjustment, role};
}

/** The telescoping prefix potential allocates log(2) over a complete phrase. */
function phraseStepWeight(value: string, sentence: string, insertion: string): number {
  const words = normalized(value).split(' ');
  if (sentence === words.join(' ') || sentence.endsWith(' ' + words.join(' '))) return 0;
  for (let progress = words.length - 1; progress >= 1; progress--) {
    const prefix = words.slice(0, progress).join(' ');
    if (sentence === prefix || progress >= 2 && sentence.endsWith(' ' + prefix)) {
      return normalized(insertion) === words[progress] ? 1 / words.length : 0;
    }
  }
  return !sentence && normalized(insertion) === words[0] ? 1 / words.length : 0;
}

export interface WordingCandidate {
  readonly phrase: string;
  readonly text: string;
  readonly progress: number;
}

export function contextualWording(context: AidRankingContext): WordingCandidate[] {
  const {before, prefix, aid, mastery} = context;
  if (!aid || effectiveAidLevel(aid.level, mastery) !== 'scaffold') return [];
  const sentence = normalized(sentenceTail(before));
  const result = new Map<string, WordingCandidate>();
  for (const phrase of aid.wording) {
    const words = phrase.trim().split(/\s+/u);
    const normalizedWords = words.map(normalized);
    const complete = normalizedWords.join(' ');
    if (sentence === complete || sentence.endsWith(' ' + complete)) continue;
    for (let progress = words.length - 1; progress >= 0; progress--) {
      const left = normalizedWords.slice(0, progress).join(' ');
      const text = words[progress];
      const allowed = progress === 0 ? Boolean(prefix) && !sentence : sentence === left || progress >= 2 && sentence.endsWith(' ' + left);
      if (!allowed || !normalized(text).startsWith(normalized(prefix)) || normalized(text) === normalized(prefix)) continue;
      const key = normalized(text);
      if ((result.get(key)?.progress ?? -1) < progress) result.set(key, {phrase, text, progress});
      break;
    }
  }
  return [...result.values()];
}
