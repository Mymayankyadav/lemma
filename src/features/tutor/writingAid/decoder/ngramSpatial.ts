/**
 * N221 · a small keyboard decoder: an n-gram language model with a spatial (touch) model, in plain code.
 *
 * score(word) = log P(word | previous word, conversation) + Σ log P(touch_i | letter_i)
 *
 * - Unigrams: the complete lexicon (unigram-v2, 114,780 words): N219's licensed v1 (AOSP LatinIME frequencies, SCOWL
 *   spellings, mathlib4 ranks) plus every accepted word of the same AOSP dictionary.
 * - Bigrams: the existing mathlib4 bigram table, Dirichlet-smoothed towards the unigram (μ = 2000).
 * - Cache: words of the tutor's question, the checkpoint and the learner's own draft (Kuhn & De Mori's cache model),
 *   mixed in at 10%, so the terms of the current question rank higher.
 * - Spatial: each tap is a Gaussian around its key's centre (σ ≈ half a key), so a tap near a neighbouring key can
 *   still decode to the word the learner meant. Taps without a recorded point count as the centre of the typed key.
 *
 * Candidates come from a beam over the letters near each tap, completed by the lexicon. The writing aid's policy
 * (learner choice, protected proof words, strict mode) still decides what is shown; nothing is applied automatically.
 */
import compactRanks from '../vendor/compact-ranks.json';
import wordAssets from '../vendor/word-assets.json';
import {createDecoderLexicon, searchDecoderLexicon, type DecoderLexicon, type DecoderLexiconIndex} from './lexicon';
import {usesExpandedNgram, type TypeaheadArm} from '../replayArm';
import {loadTypeaheadMixture, subjectWeights} from './mixture';
import {isFlagOn} from '../../../../flags';
import {activeSubjectNgram, EOS, generalNgram, historyIds, historyLog, historyNext, loadExpandedNgram, loadLatexModel, loadNgram, MATH_TOKEN,
  typeaheadNgramFingerprint, UNK, type NgramModel} from './kn';

export interface KeyTouch {
  /** Horizontal position in key pitches from the left edge of the letter rows (q's centre is 0.5). */
  readonly x: number;
  /** Vertical position in rows from the top of the letter rows (row 1's centre is 0.5). */
  readonly y: number;
}

export interface DecodedWord {
  readonly word: string;
  readonly score: number;
  /** The word does not start with the typed letters: the touch model replaced at least one of them. */
  readonly correction: boolean;
  readonly risk?: 'logic';
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY = new Map<string, KeyTouch>(ROWS.flatMap((row, y) => [...row].map((letter, x) =>
  [letter, {x: x + .5 + y * .5 + (y === 2 ? .5 : 0), y: y + .5}] as const)));
const SIGMA_X = .45, SIGMA_Y = .5;
/** Natural-log units per AOSP frequency step (f is a log-scaled 0–255 frequency). */
const LAMBDA = .065;
const MU = 2000;
const CACHE_WEIGHT = .1;
const BEAM = 12;
const NEAR = -6;
const PER_PREFIX = 24;
/** When the typed letters already begin real words, a correction must beat their completions by this much. */
const CORRECTION_COST = 3;
/** One swapped, missing or extra letter (teh → the, functon → function, thhe → the), beyond what the taps explain. */
const EDIT_COST = 4;
/** A typed word that is itself a real word is only corrected when the correction is this much likelier. */
const REAL_WORD_MARGIN = 4;

/** log P(touch | letter): a Gaussian around the key's centre. */
export function spatialLog(touch: KeyTouch, letter: string): number {
  const key = KEY.get(letter);
  if (!key) return -Infinity;
  const dx = (touch.x - key.x) / SIGMA_X, dy = (touch.y - key.y) / SIGMA_Y;
  return -(dx * dx + dy * dy) / 2;
}

/** The centre of a letter's key, for letters typed without a recorded tap. */
export function keyCentre(letter: string): KeyTouch | undefined {
  return KEY.get(letter.toLowerCase());
}

interface Model {
  index: DecoderLexiconIndex;
  frequency: Map<string, number>;
  risky: Set<string>;
  logZ: number;
}

let model: Model | null = null;
let loading: Promise<void> | null = null;
const unigramCount: Record<string, number> = compactRanks.unigram;
const bigramCount = new Map<string, Map<string, number>>();
for (const [pair, count] of Object.entries(compactRanks.bigram as Record<string, number>)) {
  const [previous, next] = pair.split(' ');
  if (!previous || !next) continue;
  const row = bigramCount.get(previous) ?? new Map<string, number>();
  row.set(next, (row.get(next) ?? 0) + count);
  bigramCount.set(previous, row);
}
for (const [previous, list] of Object.entries(wordAssets.next as Record<string, string[]>)) {
  const row = bigramCount.get(previous) ?? new Map<string, number>();
  const bonus = Math.round((unigramCount[previous] ?? 1000) * .02) + 20;
  for (const next of list) row.set(next, (row.get(next) ?? 0) + bonus);
  bigramCount.set(previous, row);
}
const previousTotal = (previous: string) => unigramCount[previous] ??
  [...bigramCount.get(previous)?.values() ?? []].reduce((sum, count) => sum + count, 0);

/** Use a parsed lexicon (tests, or after loading). `null` turns the decoder off. */
export function setDecoderLexicon(lexicon: DecoderLexicon | null): void {
  loading = null;
  if (!lexicon) {model = null; return;}
  const frequency = new Map<string, number>(), risky = new Set<string>();
  let z = 0;
  for (const entry of lexicon.entries) {
    frequency.set(entry.word, entry.frequency);
    if (entry.riskTags) risky.add(entry.word);
    z += Math.exp(LAMBDA * (entry.frequency - 255));
  }
  // AOSP's frequency for the article "a"; the lexicon keeps words of two letters or more.
  if (!frequency.has('a')) {frequency.set('a', 208); z += Math.exp(LAMBDA * (208 - 255));}
  model = {index: createDecoderLexicon(lexicon), frequency, risky, logZ: Math.log(z)};
}

/** Load the verified complete lexicon once. A failure leaves the writing aid as it was. */
export function prepareWritingDecoder(): Promise<void> {
  if (model) return Promise.resolve();
  return loading ??= import('./completeLexicon').then(({loadCompleteLexicon}) => loadCompleteLexicon())
    .then(lexicon => {if (!model) setDecoderLexicon(lexicon);})
    .catch(() => {loading = null;});
}

export function writingDecoderReady(): boolean {
  return model !== null;
}

let workerTypeahead = false;
export const typeaheadRequested = (): boolean => workerTypeahead || isFlagOn('typeaheadV2');
export function typeaheadActive(): boolean {
  return typeaheadRequested() && model !== null && generalNgram() !== null;
}
export function prepareTypeahead(): Promise<void> {
  if (!isFlagOn('typeaheadV2')) return Promise.resolve();
  return typeof Worker === 'undefined'
    ? Promise.all([loadNgram(), loadLatexModel(true), loadTypeaheadMixture()]).then(() => undefined)
    : Promise.resolve();
}
export function prepareMainTypeaheadFallback(arm?: TypeaheadArm): Promise<void> {
  const general = usesExpandedNgram(arm) ? loadExpandedNgram().then(() => generalNgram() ? undefined : loadNgram()) : loadNgram();
  return Promise.all([prepareWritingDecoder(), general, usesExpandedNgram(arm) && loadTypeaheadMixture()]).then(() => undefined);
}
export function prepareWorkerTypeahead(arm?: TypeaheadArm): Promise<void> {
  workerTypeahead = true;
  return prepareMainTypeaheadFallback(arm);
}
// ── conversation cache ──────────────────────────────────────────────────────────────────────────────────────────────
type WordCache = {counts: Map<string, number>; total: number};
const emptyCache = (): WordCache => ({counts: new Map(), total: 0});
let context = emptyCache();
/** How a cached word is written: a name such as "Cauchy" keeps its capital unless it also appeared in lower case. */
let forms = new Map<string, string>();
const WORDS = /\p{L}[\p{L}\p{M}]*(?:['’\p{Pd}][\p{L}\p{M}]+)*/gu;
/** N233: a single letter standing alone (f, X, U): a variable, not part of a word or a LaTeX command. "a" and "I" are words. */
const SYMBOL = /(?<![A-Za-z\\])[A-Za-z](?![A-Za-z])/g;
let contextSymbols: string[] = [];
function symbolsIn(text: string, latestFirst: boolean): string[] {
  const found = [...text.matchAll(SYMBOL)].map(match => match[0]).filter(letter => letter !== 'a' && letter !== 'I');
  return [...new Set(latestFirst ? found.reverse() : found)];
}
/** N233: the variables in play, the draft's (latest first) before the question's: what a maths slot can offer. */
export function decoderSymbols(before: string, question?: readonly (string | undefined)[]): string[] {
  const symbols = question ? symbolsIn(question.join('\n'), false) : contextSymbols;
  return [...new Set([...symbolsIn(before.slice(-600), true), ...symbols])].slice(0, 8);
}
/** N233: words the question or the learner's draft already used. A learner may restate these (see engine.ts, learner choice). */
export function decoderSeen(before: string): ReadonlySet<string> {
  return new Set([...context.counts.keys(), ...wordsIn([before]).counts.keys()]);
}

/** The tutor's question, the checkpoint title and step: their words rank higher while the learner answers. */
export function setDecoderContext(texts: readonly (string | undefined)[]): void {
  contextSymbols = symbolsIn(texts.join('\n'), false);
  context = wordsIn(texts);
  forms = wordForms(texts);
}

function wordForms(texts: readonly (string | undefined)[]): Map<string, string> {
  const written = new Map<string, string>();
  for (const text of texts) for (const match of text?.matchAll(WORDS) ?? []) {
    if (match[0].length < 2 || match[0].length > 32) continue;
    const word = match[0].toLowerCase();
    const sentenceStart = match.index === 0 || /[.!?:]\s*$/u.test(text!.slice(0, match.index));
    if (match[0] === word) written.set(word, word);
    else if ((!sentenceStart || /[^\x00-\x7f]/u.test(match[0])) && !written.has(word)) written.set(word, match[0]);
  }
  return written;
}

function wordsIn(texts: readonly (string | undefined)[]): WordCache {
  const cache = emptyCache();
  for (const text of texts) for (const match of text?.matchAll(WORDS) ?? []) {
    if (match[0].length < 2 || match[0].length > 32) continue;
    const word = match[0].toLowerCase();
    cache.counts.set(word, (cache.counts.get(word) ?? 0) + 1);
    cache.total++;
  }
  return cache;
}

export function mixtureProbability(base: number, word: string, caches: readonly {cache: WordCache; weight: number}[]): number {
  let remaining = 1, mass = 0;
  for (const {cache, weight} of caches) {
    if (!cache.total || weight <= 0) continue;
    remaining -= weight;
    mass += weight * (cache.counts.get(word) ?? 0) / cache.total;
  }
  return remaining * base + mass;
}

export interface LanguageContext {
  readonly question?: readonly (string | undefined)[];
  readonly authored?: string;
  readonly extraLexical?: readonly string[];
  readonly subject?: string;
  readonly personal?: {cache: WordCache; weight: number};
}

export type ComponentProbabilities = Readonly<{
  general: number; subject?: number; question?: number; draft?: number; personal?: number; activeMixture: number;
}>;

export interface LanguageDistribution {
  readonly components: (word: string) => ComponentProbabilities;
  readonly score: (word: string) => number;
  readonly next: readonly string[];
  readonly forms: ReadonlyMap<string, string>;
  readonly mathLog: number;
}

const outsideVocab = new WeakMap<NgramModel, {lexicon: Model; weight: number}>();
const lexiconMass = (frequency: number) => Math.exp(LAMBDA * (frequency - 255));
const novelMass = lexiconMass(120);

function outOfVocabulary(ngram: NgramModel, candidates: ReadonlySet<string>) {
  const lexical = model;
  let prior = outsideVocab.get(ngram);
  if (lexical && prior?.lexicon !== lexical) {
    let weight = 0;
    for (const [word, frequency] of lexical.frequency) if (!ngram.id.has(word)) weight += lexiconMass(frequency);
    prior = {lexicon: lexical, weight};
    outsideVocab.set(ngram, prior);
  }
  let denominator = (prior?.weight ?? 0) + novelMass;
  for (const word of candidates) if (!ngram.id.has(word) && !lexical?.frequency.has(word)) denominator += novelMass;
  return (word: string) => {
    const frequency = lexical?.frequency.get(word);
    if (frequency !== undefined) return lexiconMass(frequency) / denominator;
    return word === '<unk>' || candidates.has(word) ? novelMass / denominator : 0;
  };
}

export function prepareLanguage(before: string, options: LanguageContext = {}): LanguageDistribution {
  const source = options.question ? wordsIn(options.question) : context;
  const draft = wordsIn([options.authored ?? before]);
  const kn = typeaheadActive() ? generalNgram() : null;
  const scoped = activeSubjectNgram(options.subject);
  const history = kn ? historyIds(kn, before) : [];
  const scopedHistory = scoped ? historyIds(scoped.model, before) : [];
  const previous = /([A-Za-z]+)[^A-Za-z.!?;:\n]*$/u.exec(before)?.[1]?.toLowerCase() ?? '';
  const fit = kn ? subjectWeights(typeaheadNgramFingerprint(), options.subject, scoped?.fingerprint) : undefined;
  // Frozen corpus fits have no personal history. Preserve the separate
  // local weight and give the remaining probability mass to the fitted mix.
  const personalWeight = options.personal?.cache.total ? Math.min(.4, options.personal.weight) : 0;
  const fittedScale = 1 - personalWeight;
  const cacheWeights = [{cache: source, weight: fit ? fit[2] * fittedScale : .06}, {cache: draft, weight: fit ? fit[3] * fittedScale : .04},
    ...options.personal ? [{...options.personal, weight: personalWeight}] : []];
  const cacheWeight = cacheWeights.reduce((sum, entry) => sum + (entry.cache.total ? entry.weight : 0), 0);
  const subjectWeight = scoped ? fit ? fit[1] * fittedScale / Math.max(Number.EPSILON, 1 - cacheWeight) : scoped.weight : 0;
  const candidates = new Set([...source.counts.keys(), ...draft.counts.keys(), ...options.personal?.cache.counts.keys() ?? [],
    ...options.extraLexical?.map(word => word.toLowerCase()) ?? []]);
  if (kn) for (const id of historyNext(kn, history)) if (id > EOS) candidates.add(kn.words[id]);
  if (scoped) for (const id of historyNext(scoped.model, scopedHistory)) if (id > EOS) candidates.add(scoped.model.words[id]);
  // Allocate the unknown event once across a fixed lexicon, explicit copy
  // candidates, and one residual bucket. Prefix filtering never changes it.
  const unknown = kn ? outOfVocabulary(kn, candidates) : () => 0;
  function modelProbability(word: string, candidateModel: NgramModel, ids: readonly number[]): number {
    const id = candidateModel.id.get(word) ?? UNK;
    return Math.exp(historyLog(candidateModel, id, ids)) * (id === UNK ? unknown(word) : 1);
  }
  const generalProbability = (word: string) => kn ? modelProbability(word, kn, history) : Math.exp(languageLog(word, previous));
  const probabilityIn = (cache: WordCache | undefined, word: string) =>
    cache?.total ? (cache.counts.get(word) ?? 0) / cache.total : undefined;
  const components = (word: string): ComponentProbabilities => ({
    general: generalProbability(word), subject: scoped ? modelProbability(word, scoped.model, scopedHistory) : undefined,
    question: probabilityIn(source, word), draft: probabilityIn(draft, word), personal: probabilityIn(options.personal?.cache, word),
    activeMixture: Math.exp(score(word)),
  });
  const score = (word: string) => {
    const general = generalProbability(word);
    const base = scoped ? (1 - subjectWeight) * general + subjectWeight * modelProbability(word, scoped.model, scopedHistory) : general;
    return Math.log(mixtureProbability(base, word, cacheWeights));
  };
  return {score, components, mathLog: score(kn?.words[MATH_TOKEN] ?? '<m>'), next: [...candidates],
    forms: options.question ? wordForms([...options.question, ...options.extraLexical ?? []]) : forms};
}

// ── recorded taps ───────────────────────────────────────────────────────────────────────────────────────────────────
const taps = new Map<number, {letter: string; touch: KeyTouch}>();

export type KeyTouchSample = Readonly<{position: number; letter: string; touch: KeyTouch}>;
export function snapshotKeyTouches(text: string, end: number): KeyTouchSample[] {
  return [...taps].flatMap(([position, sample]) => position < end && position >= end - 64 &&
    sample.letter === text[position]?.toLowerCase() ? [{position, ...sample}] : []);
}
export function restoreKeyTouches(samples: readonly KeyTouchSample[]): void {
  taps.clear();
  for (const {position, letter, touch} of samples) recordKeyTouch(position, letter, touch);
}

/** The keyboard records where each letter was tapped, by its position in the draft. Memory only. */
export function recordKeyTouch(position: number, letter: string, touch: KeyTouch): void {
  if (!Number.isInteger(position) || position < 0 || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return;
  taps.set(position, {letter: letter.toLowerCase(), touch: {x: touch.x, y: touch.y}});
  if (taps.size > 256) taps.delete(taps.keys().next().value!);
}

export function clearKeyTouches(): void {
  taps.clear();
}

/**
 * The touch for each letter of `word` typed at `start`: the recorded tap when it still matches (`tapped`), else the
 * key's centre. Only a recorded tap can stand for a neighbouring key: a letter from a hardware keyboard, a paste or an
 * edit has no position, so it counts as exactly the letter typed.
 */
export function touchesFor(word: string, start: number): (KeyTouch & {tapped?: true})[] {
  return [...word.toLowerCase()].map((letter, offset) => {
    const tap = taps.get(start + offset);
    return tap && tap.letter === letter ? {...tap.touch, tapped: true} : KEY.get(letter) ?? {x: -9, y: -9};
  });
}

// ── decoding ────────────────────────────────────────────────────────────────────────────────────────────────────────
function lowerBound(index: DecoderLexiconIndex, word: string): number {
  let low = 0, high = index.entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.entries[middle].word < word) low = middle + 1;
    else high = middle;
  }
  return low;
}

function hasPrefix(index: DecoderLexiconIndex, prefix: string): boolean {
  return index.entries[lowerBound(index, prefix)]?.word.startsWith(prefix) ?? false;
}

/** Up to `limit` lexicon words starting with `prefix`, most frequent first, including the prefix itself. */
function completions(index: DecoderLexiconIndex, prefix: string, limit: number): string[] {
  const out: string[] = [];
  const at = lowerBound(index, prefix);
  if (index.entries[at]?.word === prefix) out.push(prefix);
  return out.concat(searchDecoderLexicon(index, prefix, limit).map(entry => entry.word));
}

/** log P(word | previous, cache): a smoothed bigram mixed with the conversation cache. */
export function languageLog(word: string, previous: string, cache?: WordCache, knContext?: readonly [number, number]): number {
  if (!model) return -Infinity;
  const kn = knContext ? generalNgram() : null;
  let ngram: number;
  if (kn && knContext) ngram = Math.exp(historyLog(kn, kn.id.get(word) ?? UNK, knContext));
  else {
    const frequency = model.frequency.get(word) ?? 120;
    const unigram = Math.exp(LAMBDA * (frequency - 255) - model.logZ);
    const total = previous ? previousTotal(previous) : 0;
    const pair = previous ? bigramCount.get(previous)?.get(word) ?? 0 : 0;
    ngram = (pair + MU * unigram) / (total + MU);
  }
  return Math.log(mixtureProbability(ngram, word, cache ? [{cache, weight: CACHE_WEIGHT}] : []));
}

function casing(word: string, typed: string, writtenForms: ReadonlyMap<string, string>): string {
  if (typed.length > 1 && typed === typed.toUpperCase()) return word.toUpperCase();
  const written = writtenForms.get(word) ?? word;
  return /^[A-Z]/.test(typed) ? written[0].toUpperCase() + written.slice(1) : written;
}

/**
 * Decode the letters typed at `start` (`typed`, possibly empty) after `before` (the draft before them).
 * Returns words sorted by score; `extra` words (from other engines) are scored the same way.
 */
export function decodeWord(before: string, typed: string, start: number, extra: readonly string[] = [], limit = 12, language = prepareLanguage(before)): DecodedWord[] {
  if (!model || typed.length > 32 || !/^[A-Za-z]*$/.test(typed)) return [];
  const {index, risky} = model;
  const previous = /([A-Za-z]+)[^A-Za-z.!?;:\n]*$/.exec(before)?.[1]?.toLowerCase() ?? '';
  const kn = typeaheadActive() ? generalNgram() : null;
  const lower = typed.toLowerCase();
  const touches = touchesFor(lower, start);
  const scored = new Map<string, DecodedWord>();
  const typedIsPrefix = Boolean(lower) && hasPrefix(index, lower);
  const add = (word: string, spatial: number) => {
    if (scored.has(word)) return;
    const correction = !word.startsWith(lower);
    scored.set(word, {word: casing(word, typed, language.forms),
      score: language.score(word) + spatial - (correction && typedIsPrefix ? CORRECTION_COST : 0),
      correction, ...(risky.has(word) ? {risk: 'logic' as const} : {})});
  };
  if (!lower) {
    // Next word: what usually follows the previous words, then the commonest words.
    if (kn) {
      for (const word of language.next) if (/^[a-z]{2,32}$/u.test(word)) add(word, 0);
      add('a', 0);
    } else for (const word of [...bigramCount.get(previous)?.keys() ?? [], ...wordAssets.boundary, 'a']) add(word, 0);
  } else {
    let beams = [{prefix: '', spatial: 0}];
    for (const [i, touch] of touches.entries()) {
      const next: typeof beams = [];
      for (const beam of beams) for (const letter of touch.tapped ? KEY.keys() : [lower[i]]) {
        const spatial = spatialLog(touch, letter);
        if (spatial < NEAR) continue;
        const prefix = beam.prefix + letter;
        if (hasPrefix(index, prefix)) next.push({prefix, spatial: beam.spatial + spatial});
      }
      beams = next.sort((a, b) => b.spatial - a.spatial).slice(0, BEAM);
      if (!beams.length) break;
    }
    // Typing slips the taps cannot explain: two letters swapped, one letter missing or one too many (never the first).
    if (lower.length >= 3) {
      const exactSpatial = touches.reduce((sum, touch, i) => sum + spatialLog(touch, lower[i]), 0);
      const variants = new Set<string>();
      for (let i = 0; i + 1 < lower.length; i++) variants.add(lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2));
      for (let i = 1; i < lower.length; i++) variants.add(lower.slice(0, i) + lower.slice(i + 1));
      for (let i = 1; i <= lower.length; i++) for (const letter of KEY.keys()) variants.add(lower.slice(0, i) + letter + lower.slice(i));
      variants.delete(lower);
      for (const variant of variants) {
        if (variant.length < 2 || index.entries[lowerBound(index, variant)]?.word !== variant) continue;
        add(variant, exactSpatial - EDIT_COST);
      }
    }
    const following = language.next;
    for (const beam of beams) {
      for (const word of completions(index, beam.prefix, PER_PREFIX)) add(word, beam.spatial);
      // N233: words the n-gram expects after the previous two, even when they are rarer overall.
      for (const word of following) if (word.startsWith(beam.prefix) && model.frequency.has(word)) add(word, beam.spatial);
      // Words the bigram or the conversation favour, even when they are rarer overall.
      for (const word of bigramCount.get(previous)?.keys() ?? []) {
        if (word.startsWith(beam.prefix) && model.frequency.has(word)) add(word, beam.spatial);
      }
      // The conversation's own words, including names the lexicon does not list (only when typed exactly so far).
      for (const word of language.next) {
        if (word.startsWith(beam.prefix) && (model.frequency.has(word) || beam.prefix === lower)) add(word, beam.spatial);
      }
    }
  }
  for (const word of extra) {
    const plain = word.toLowerCase();
    if (!/^[a-z]+$/.test(plain) || plain.length < lower.length) continue;
    const spatial = [...lower].reduce((sum, _, i) => sum + spatialLog(touches[i], plain[i]), 0);
    if (Number.isFinite(spatial)) add(plain, spatial);
  }
  let ranked = [...scored.values()].sort((a, b) => b.score - a.score);
  // When the typed letters begin real words, a correction is offered only if it is likelier than every completion; when
  // they are a real word themselves (restate), only if it is far likelier than that word.
  if (typedIsPrefix) {
    const best = ranked.find(item => !item.correction)?.score ?? -Infinity;
    const typedWord = index.entries[lowerBound(index, lower)]?.word === lower
      ? language.score(lower) + touches.reduce((sum, touch, i) => sum + spatialLog(touch, lower[i]), 0) + REAL_WORD_MARGIN
      : -Infinity;
    ranked = ranked.filter(item => !item.correction || item.score >= Math.max(best, typedWord));
  }
  return ranked.slice(0, Math.max(limit, extra.length));
}
