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
import {aidEntryKey, effectiveAidLevel, type AidEntryKind, type AidHint, type AidRole, type TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';

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

function matchesPhraseTail(literal: string, sentence: string, before: string, suffix: boolean): boolean {
  const matches = (tail: string) => tail === literal || suffix && tail.endsWith(' ' + literal);
  if (matches(sentence)) return true;
  // A configured prefix can itself contain punctuation such as “Dr.”, which splits the sentence tail.
  return /[.!?](?: |$)/u.test(literal) && matches(normalized(before));
}

export function normalizeAidScopePrefix(kind: AidEntryKind, value: string): string {
  return kind === 'symbol' ? value.trim().replace(/\s+/gu, ' ') : normalized(value);
}

/** Conditions the neural model on applicable aid text independently of signed priority. */
export function neuralAidPrompt({aid, subject, step, prefix}: Pick<AidRankingContext, 'aid' | 'subject' | 'step' | 'prefix'>,
  includeRanking: boolean): string {
  if (!aid || aid.level === 'none') return '';
  const entries = new Map<string, string>();
  function add(kind: AidEntryKind, entry: string) {
    const key = aidEntryKey(kind, entry.trim());
    if (!entries.has(key)) entries.set(key, entry);
  }
  for (const term of aid.terms ?? []) add(normalized(term).includes(' ') ? 'phrase' : 'word', term);
  for (const symbol of aid.symbols ?? []) add('symbol', symbol);
  for (const hint of (includeRanking ? aid.ranking?.hints : undefined) ?? []) {
    const scope = hint.scope;
    if ((hint.role !== 'given' && hint.role !== 'neutral') ||
        (scope?.subject && scope.subject !== subject) || (scope?.step && scope.step !== step) ||
        (scope?.mode && scope.mode !== 'prose') || scope?.phraseStates?.length) continue;
    if (scope?.prefixes?.length) {
      const typed = normalizeAidScopePrefix(hint.kind, prefix);
      if (!scope.prefixes.some(value => typed.startsWith(normalizeAidScopePrefix(hint.kind, value)))) continue;
    }
    add(hint.kind, hint.entry);
  }
  return [...entries.values()].join(' ');
}

type ScopeSpecificity = readonly [axes: number, matchLength: number];

function compareSpecificity(a: ScopeSpecificity, b: ScopeSpecificity): number {
  return a[0] - b[0] || a[1] - b[1];
}

export function aidScopeSpecificity(hint: AidHint, context: AidRankingContext, sentence?: string): ScopeSpecificity | undefined {
  const scope = hint.scope;
  if (!scope) return [0, 0];
  if (scope.subject !== undefined && scope.subject !== context.subject || scope.step !== undefined && scope.step !== context.step ||
      scope.mode !== undefined && scope.mode !== context.mode) return undefined;
  let prefixMatch = 0;
  if (scope.prefixes?.length) {
    const typed = normalizeAidScopePrefix(hint.kind, context.prefix);
    for (const value of scope.prefixes) {
      const expected = normalizeAidScopePrefix(hint.kind, value);
      if (typed.startsWith(expected)) prefixMatch = Math.max(prefixMatch, expected.length);
    }
    if (!prefixMatch) return undefined;
  }
  let phraseMatch = 0;
  if (scope.phraseStates?.length) {
    const tail = sentence ?? normalized(sentenceTail(context.before));
    for (const value of scope.phraseStates) {
      const phrase = normalized(value);
      if (matchesPhraseTail(phrase, tail, context.before, true)) phraseMatch = Math.max(phraseMatch, phrase.length);
    }
    if (!phraseMatch) return undefined;
  }
  // More matching axes take precedence. With tied axes, a longer match is narrower.
  const axes = Number(scope.subject !== undefined) + Number(scope.step !== undefined) +
    Number(scope.mode !== undefined) + Number(Boolean(prefixMatch)) + Number(Boolean(phraseMatch));
  return [axes, prefixMatch + phraseMatch];
}

export function tutorHint(context: AidRankingContext, insertion: string): {adjustment: number; role?: AidRole} {
  const {aid, before} = context;
  if (!aid?.ranking) return {adjustment: 0};
  const faded = effectiveAidLevel(aid.level, context.mastery) === 'none';
  const sentence = normalized(sentenceTail(before));
  const entries = new Map<string, {specificity: ScopeSpecificity; values: Set<number>; role: AidRole; strength: number}>();
  let restrictive: AidRole | undefined;
  for (const hint of aid.ranking.hints ?? []) {
    const specificity = aidScopeSpecificity(hint, context, sentence);
    if (specificity === undefined) continue;
    const equal = hint.kind === 'symbol' ? (a: string, b: string) => a.trim() === b.trim()
      : (a: string, b: string) => normalized(a) === normalized(b);
    const targets = [hint.entry, ...hint.aliases ?? []];
    const exact = targets.some(value => equal(value, insertion));
    const strength = exact ? 1 : hint.kind === 'phrase'
      ? Math.max(...targets.map(value => phraseStepWeight(value, sentence, before, insertion))) : 0;
    if (!strength) continue;
    if ((hint.role === 'alternative' || hint.role === 'goal') && (!restrictive || roleOrder[hint.role] > roleOrder[restrictive])) restrictive = hint.role;
    if (hint.kind === 'phrase' && exact && targets.some(value => matchesPhraseTail(normalized(value), sentence, before, true))) continue;
    const key = aidEntryKey(hint.kind, hint.entry);
    const saved = entries.get(key);
    const order = saved ? compareSpecificity(specificity, saved.specificity) : 1;
    if (!saved || order > 0) {
      entries.set(key, {specificity, values: new Set([bias[hint.priority]]), role: hint.role, strength});
    } else if (order === 0) {
      saved.values.add(bias[hint.priority]);
      if (roleOrder[hint.role] > roleOrder[saved.role]) saved.role = hint.role;
    }
  }
  const matched = [...entries.values()];
  // Nested phrases or coincident aliases share the best applicable evidence.
  // Tied, contradictory hints cancel even when their entry IDs differ.
  const maximum = matched.reduce<ScopeSpecificity>((current, {specificity}) =>
    compareSpecificity(specificity, current) > 0 ? specificity : current, [0, 0]);
  const best = matched.filter(entry => compareSpecificity(entry.specificity, maximum) === 0);
  const signed = best.map(entry => [...entry.values].reduce((sum, priority) => sum + priority, 0) * entry.strength);
  const adjustment = Math.log(2) * ((Math.max(0, ...signed) + Math.min(0, ...signed)));
  const role = restrictive ?? best.reduce<AidRole | undefined>((selected, entry) =>
    !selected || roleOrder[entry.role] > roleOrder[selected] ? entry.role : selected, undefined);
  return faded ? {adjustment: 0, role: restrictive} : {adjustment, role};
}

/** The telescoping prefix potential allocates log(2) over a complete phrase. */
function phraseStepWeight(value: string, sentence: string, before: string, insertion: string): number {
  const words = normalized(value).split(' ');
  if (matchesPhraseTail(words.join(' '), sentence, before, true)) return 0;
  for (let progress = words.length - 1; progress >= 1; progress--) {
    const prefix = words.slice(0, progress).join(' ');
    if (matchesPhraseTail(prefix, sentence, before, progress >= 2)) {
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
    if (matchesPhraseTail(complete, sentence, before, true)) continue;
    for (let progress = words.length - 1; progress >= 0; progress--) {
      const left = normalizedWords.slice(0, progress).join(' ');
      const text = words[progress];
      const allowed = progress === 0 ? Boolean(prefix) && !sentence : matchesPhraseTail(left, sentence, before, progress >= 2);
      if (!allowed || !normalized(text).startsWith(normalized(prefix)) || normalized(text) === normalized(prefix)) continue;
      const key = normalized(text);
      if ((result.get(key)?.progress ?? -1) < progress) result.set(key, {phrase, text, progress});
      break;
    }
  }
  return [...result.values()];
}
