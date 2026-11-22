/**
 * N221 · a small keyboard decoder: an n-gram language model with a spatial (touch) model, in plain code.
 *
 * score(word) = log P(word | previous word, conversation) + Σ log P(touch_i | letter_i)
 *
 * - Unigrams: N219's licensed 49,232-word lexicon (AOSP LatinIME frequencies, SCOWL spellings, mathlib4 ranks).
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
import {createDecoderLexicon, type DecoderLexicon, type DecoderLexiconIndex} from './lexicon';

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

/** Load N219's verified lexicon once. A failure leaves the writing aid as it was. */
export function prepareWritingDecoder(): Promise<void> {
  if (model) return Promise.resolve();
  return loading ??= import('./assets').then(({loadWritingDecoderLexicon}) => loadWritingDecoderLexicon())
    .then(lexicon => {if (!model) setDecoderLexicon(lexicon);})
    .catch(() => {loading = null;});
}

export function writingDecoderReady(): boolean {
  return model !== null;
}

// ── conversation cache ──────────────────────────────────────────────────────────────────────────────────────────────
let context = new Map<string, number>();
let contextTotal = 0;
/** How a cached word is written: a name such as "Cauchy" keeps its capital unless it also appeared in lower case. */
let forms = new Map<string, string>();
const WORDS = /[A-Za-z]{2,32}/g;

/** The tutor's question, the checkpoint title and step: their words rank higher while the learner answers. */
export function setDecoderContext(texts: readonly (string | undefined)[]): void {
  context = new Map();
  contextTotal = 0;
  forms = new Map();
  for (const text of texts) for (const match of text?.matchAll(WORDS) ?? []) {
    const word = match[0].toLowerCase();
    context.set(word, (context.get(word) ?? 0) + 1);
    contextTotal++;
    const sentenceStart = /(?:^|[.!?:]\s*)$/.test(text!.slice(0, match.index));
    if (match[0] === word) forms.set(word, word);
    else if (!sentenceStart && !forms.has(word) && /^[A-Z][a-z]+$/.test(match[0])) forms.set(word, match[0]);
  }
}

function cacheFor(draft: string): {counts: Map<string, number>; total: number} {
  const counts = new Map(context);
  let total = contextTotal;
  for (const match of draft.matchAll(WORDS)) {
    const word = match[0].toLowerCase();
    counts.set(word, (counts.get(word) ?? 0) + 1);
    total++;
  }
  return {counts, total};
}

// ── recorded taps ───────────────────────────────────────────────────────────────────────────────────────────────────
const taps = new Map<number, {letter: string; touch: KeyTouch}>();

/** The keyboard records where each letter was tapped, by its position in the draft. Memory only. */
export function recordKeyTouch(position: number, letter: string, touch: KeyTouch): void {
  if (!Number.isInteger(position) || position < 0 || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return;
  taps.set(position, {letter: letter.toLowerCase(), touch: {x: touch.x, y: touch.y}});
  if (taps.size > 256) taps.delete(taps.keys().next().value!);
}

export function clearKeyTouches(): void {
  taps.clear();
}

/** The touch for each letter of `word` typed at `start`: the recorded tap when it still matches, else the key centre. */
export function touchesFor(word: string, start: number): KeyTouch[] {
  return [...word.toLowerCase()].map((letter, offset) => {
    const tap = taps.get(start + offset);
    return tap && tap.letter === letter ? tap.touch : KEY.get(letter) ?? {x: -9, y: -9};
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
  let best: {word: string; frequency: number}[] = [];
  for (let i = at; i < index.entries.length && index.entries[i].word.startsWith(prefix); i++) {
    const entry = index.entries[i];
    if (entry.word === prefix) continue;
    if (best.length < limit || entry.frequency > best[best.length - 1].frequency) {
      best.push(entry);
      best.sort((a, b) => b.frequency - a.frequency);
      if (best.length > limit) best = best.slice(0, limit);
    }
  }
  return out.concat(best.map(entry => entry.word));
}

/** log P(word | previous, cache): a smoothed bigram mixed with the conversation cache. */
export function languageLog(word: string, previous: string, cache?: {counts: Map<string, number>; total: number}): number {
  if (!model) return -Infinity;
  const frequency = model.frequency.get(word) ?? 120;
  const unigram = Math.exp(LAMBDA * (frequency - 255) - model.logZ);
  const total = previous ? previousTotal(previous) : 0;
  const pair = previous ? bigramCount.get(previous)?.get(word) ?? 0 : 0;
  const ngram = (pair + MU * unigram) / (total + MU);
  const cached = cache && cache.total ? (cache.counts.get(word) ?? 0) / cache.total : 0;
  return Math.log(cached ? (1 - CACHE_WEIGHT) * ngram + CACHE_WEIGHT * cached : ngram);
}

function casing(word: string, typed: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase()) return word.toUpperCase();
  const written = forms.get(word) ?? word;
  return /^[A-Z]/.test(typed) ? written[0].toUpperCase() + written.slice(1) : written;
}

/**
 * Decode the letters typed at `start` (`typed`, possibly empty) after `before` (the draft before them).
 * Returns words sorted by score; `extra` words (from other engines) are scored the same way.
 */
export function decodeWord(before: string, typed: string, start: number, extra: readonly string[] = [], limit = 12): DecodedWord[] {
  if (!model || typed.length > 32 || !/^[A-Za-z]*$/.test(typed)) return [];
  const {index, risky} = model;
  const previous = /([A-Za-z]+)[^A-Za-z.!?;:\n]*$/.exec(before)?.[1]?.toLowerCase() ?? '';
  const cache = cacheFor(before);
  const lower = typed.toLowerCase();
  const touches = touchesFor(lower, start);
  const scored = new Map<string, DecodedWord>();
  const typedIsPrefix = Boolean(lower) && hasPrefix(index, lower);
  const add = (word: string, spatial: number) => {
    if (scored.has(word)) return;
    const correction = !word.startsWith(lower);
    scored.set(word, {word: casing(word, typed),
      score: languageLog(word, previous, cache) + spatial - (correction && typedIsPrefix ? CORRECTION_COST : 0),
      correction, ...(risky.has(word) ? {risk: 'logic' as const} : {})});
  };
  if (!lower) {
    // Next word: what usually follows the previous word, then the commonest words.
    for (const word of [...bigramCount.get(previous)?.keys() ?? [], ...wordAssets.boundary, 'a']) add(word, 0);
  } else {
    let beams = [{prefix: '', spatial: 0}];
    for (const touch of touches) {
      const next: typeof beams = [];
      for (const beam of beams) for (const letter of KEY.keys()) {
        const spatial = spatialLog(touch, letter);
        if (spatial < NEAR) continue;
        const prefix = beam.prefix + letter;
        if (hasPrefix(index, prefix)) next.push({prefix, spatial: beam.spatial + spatial});
      }
      beams = next.sort((a, b) => b.spatial - a.spatial).slice(0, BEAM);
      if (!beams.length) break;
    }
    for (const beam of beams) {
      for (const word of completions(index, beam.prefix, PER_PREFIX)) add(word, beam.spatial);
      // Words the bigram or the conversation favour, even when they are rarer overall.
      for (const word of bigramCount.get(previous)?.keys() ?? []) {
        if (word.startsWith(beam.prefix) && model.frequency.has(word)) add(word, beam.spatial);
      }
      // The conversation's own words, including names the lexicon does not list (only when typed exactly so far).
      for (const word of cache.counts.keys()) {
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
  // When the typed letters begin real words, a correction is offered only if it is likelier than every completion.
  if (typedIsPrefix) {
    const best = ranked.find(item => !item.correction)?.score ?? -Infinity;
    ranked = ranked.filter(item => !item.correction || item.score >= best);
  }
  return ranked.slice(0, Math.max(limit, extra.length));
}
