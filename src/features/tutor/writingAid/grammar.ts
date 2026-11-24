/**
 * N235 · prose grammar filters for the suggestion strip, behind the typeaheadV2 flag.
 *
 * Hard constraints only; the language model supplies the soft grammar. Each filter can only remove or re-case a
 * candidate, never invent one:
 *  - a / an agree with the next word's sound;
 *  - a word that starts a sentence is capitalised (the learner's own capital, never a guess about proper names);
 *  - after a singular determiner (a, an, this, each, every, one) a plural noun is dropped;
 * Class-based back-off lives in the model itself: single letters, numbers and rare words are the classes <m>, <num>
 * and <unk> (see kn.ts), so an unseen context falls back to its class instead of the unigram.
 */

/** The text before the caret ends where a sentence begins. */
export function atSentenceStart(before: string): boolean {
  return /(?:^|[.!?]["')\]]?\s+|\n\s*)$/u.test(before);
}

export const capitalise = (word: string) => word.charAt(0).toLocaleUpperCase() + word.slice(1);

/** "an" before a vowel sound, "a" before a consonant sound, for the words a mathematical answer meets. */
const VOWEL_LETTER_CONSONANT_SOUND = /^(?:uni(?!n)|use|usu|uti|ubiq|eu|one|once)/iu;
const SILENT_H = /^(?:hour|honest|honou?r|heir)/iu;
const LETTER_NAMES_AN = /^[AEFHILMNORSX]$/u;
export function startsWithVowelSound(word: string): boolean {
  if (!word) return false;
  if (word.length === 1) return LETTER_NAMES_AN.test(word.toUpperCase());
  if (SILENT_H.test(word)) return true;
  if (VOWEL_LETTER_CONSONANT_SOUND.test(word)) return false;
  return /^[aeiou]/iu.test(word);
}

/** The word typed just before the caret (the last word of `before`), or ''. */
export function previousWord(before: string): string {
  return /([\p{L}]+)[^\p{L}]*$/u.exec(before)?.[1] ?? '';
}

const SINGULAR_DETERMINERS = new Set(['a', 'an', 'this', 'each', 'every', 'one', 'another', 'any']);
const NOT_PLURAL_ENDINGS = /(?:ss|us|is|ous|ics|ness|ence|ance)$/iu;
const SINGULAR_S_WORDS = new Set(['basis', 'analysis', 'axis', 'bias', 'calculus', 'class', 'focus', 'locus', 'mass', 'plus', 'minus',
  'continuous', 'previous', 'various', 'thus', 'always', 'perhaps', 'its', 'has', 'was', 'is', 'does', 'this', 'less', 'process',
  'lemma', 'genus', 'radius', 'nucleus', 'corpus', 'status', 'series', 'species', 'chaos', 'cos', 'diagnosis', 'hypothesis',
  'synthesis', 'parenthesis', 'emphasis', 'dis', 'gas', 'lens', 'news', 'physics', 'mathematics', 'statistics', 'topos', 'complexes']);

/**
 * Whether `word` can follow the text before the caret grammatically. `before` is the draft up to (not including) the word.
 * Returns false only for clear violations.
 */
export function grammarAllows(before: string, word: string): boolean {
  const previous = previousWord(before).toLowerCase();
  if (previous === 'a' && startsWithVowelSound(word)) return false;
  if (previous === 'an' && /^\p{L}/u.test(word) && !startsWithVowelSound(word)) return false;
  if (SINGULAR_DETERMINERS.has(previous) && word.length > 3) {
    const lower = word.toLowerCase();
    if (lower.endsWith('s') && !NOT_PLURAL_ENDINGS.test(lower) && !SINGULAR_S_WORDS.has(lower)) return false;
  }
  return true;
}
