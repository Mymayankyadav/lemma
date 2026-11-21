import {padEdit} from '../../pad/padEdit';
import {plainProse, wordAtCaret} from '../input/completionPolicy';
import {tutorMathContext} from '../input/symbolEdit';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, WRITING_AID_LIMIT, canSuggestWritingAid, writingAidProposal,
  type WritingAidProposal, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {makeStudyInput} from './vendor/study_input.mjs';
import phraseData from './vendor/legacy/runtime-phrases.json';
import veto from './vendor/legacy/runtime-veto.json';
import editPolicy from './vendor/legacy/policy.json';
import wordList from './vendor/wordlist.txt?raw';
import wordAssets from './vendor/word-assets.json';
import compactRanks from './vendor/compact-ranks.json';
import speedPolicy from './vendor/speed-policy.json';

// Lemma already offers these spellings. The pinned rank asset includes
// preimage, while the general-purpose dictionary omits both forms.
const words = [...wordList.trimEnd().split('\n'), 'preimage', 'preimages'].sort();
const aid = makeStudyInput({
  phrases: phraseData, veto, policy: editPolicy, words, speedPolicy,
  // Context words index data records, including ordinary words like "constructor".
  wordAssets: {...wordAssets, next: Object.assign(Object.create(null), wordAssets.next)},
  ranks: {...compactRanks, unigram: Object.assign(Object.create(null), compactRanks.unigram)},
}, {seed: 0});

const WINDOW = 1024;
const MAX_EDIT_TOKENS = 24;
const MAX_WORD = 32;
const MAX_GHOST = 32;
const LETTERS = /^[\p{L}\p{M}]+$/u;
const OUTPUT_TOKEN = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;
const FILLERS = new Set(['a', 'an', 'the', 'i', 'we', 'of', 'to', 'in', 'for', 'with', 'at', 'as', 'on', 'from']);
// Keep complete proof words such as "if" and "not" intact. The spelling
// dictionary includes short abbreviations that also serve as typed stems.
const COMPLETE_PROOF_WORDS = new Set([...wordAssets.common, ...FILLERS, 'never', 'none', 'unless', 'nor',
  'implied', 'imply', 'then', 'there', 'therefore', 'conversely', 'greater', 'less',
  'zero', 'even', 'odd', 'nonzero', 'rational', 'integer', 'real', 'preimage', 'preimages']);
const LOGIC_GAP = /(?:\b(?:by|because|since|if|then|not|or|and|only|all|for every|witness|choose|let|take|assume|suppose|given|denote|define|equals?|implies|therefore|hence|thus|consequently|belongs to|is a subset of)|[=<>≤≥∈∉⊆⊂≠∀∃⇒⇔¬])\s*$/iu;
const SOURCED_LINE = /(?:^|\s)(?:tutor|teacher|instructor|assistant|solution|system|code|prompt|quotation)\s*:|\b(?:tutor|teacher|assistant|book|solution|prompt)\s+(?:said|says|wrote|asked|suggested|mentions?|mentioned|gives?|gave)\b/iu;
const LITERAL_LINE = /(?:search|identifier|code|literal|verbatim|product|brand|named|called)\b[^.!?\n]*$/iu;
const TOKEN = /\\[A-Za-z]+|[<=>!\-]+|_[0-9]|\bthe the\b|[\p{L}\p{M}]+/gu;

function writtenWord(word: string): boolean {
  if (wordAssets.common.includes(word)) return true;
  let low = 0, high = words.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle] < word) low = middle + 1;
    else high = middle;
  }
  return words[low] === word;
}

function startOfWindow(request: WritingAidRequest, authored: string, start: number): number {
  const floor = authored.length - WINDOW;
  if (floor <= start) return start;
  // Do not create a prefix out of the middle of a learner's earlier word.
  const boundary = request.cursor.text.slice(floor).search(/\s/u);
  return boundary < 0 ? authored.length : floor + boundary + 1;
}

function hasOpenLiteral(text: string): boolean {
  const line = text.slice(text.lastIndexOf('\n') + 1);
  return (text.match(/(?<!\\)`/gu)?.length ?? 0) % 2 === 1 ||
    (line.match(/(?<!\\)"/gu)?.length ?? 0) % 2 === 1 ||
    (line.match(/“/gu)?.length ?? 0) > (line.match(/”/gu)?.length ?? 0) ||
    (line.match(/‘/gu)?.length ?? 0) > (line.match(/’/gu)?.length ?? 0) ||
    /(?:^|\s)'[^']*$/u.test(line) || SOURCED_LINE.test(line) || LITERAL_LINE.test(line);
}

function keyProposals(
  request: WritingAidRequest, text: string, authoredText: string, start: number,
): WritingAidProposal[] {
  const {cursor, mode, anchor} = request;
  if (mode === 'off') return [];
  const prefix = wordAtCaret(cursor);
  const rangeStart = cursor.end - (prefix?.length ?? 0);
  const before = cursor.text.slice(0, rangeStart);
  const protectedGap = LOGIC_GAP.test(before);
  if (rangeStart < start || (protectedGap && (!prefix || prefix.length < 5))) return [];
  if (prefix) {
    if (!LETTERS.test(prefix) || !plainProse(cursor, prefix) || text.slice(-prefix.length) !== prefix ||
        COMPLETE_PROOF_WORDS.has(prefix.toLowerCase()) || anchor?.continuation) return [];
  } else if (mode === 'strict' || !/[ \t]$/u.test(text) || !LETTERS.test(text.trimEnd().match(/[\p{L}\p{M}]+$/u)?.[0] ?? '')) {
    return [];
  }
  const result = aid.predict(text, {mode, surface: 'keys', origin: 'learner', authoredText});
  const proposals: WritingAidProposal[] = [];
  for (const {word, kind} of result.keys) {
    if (proposals.length === 3) break;
    if (word.length > MAX_WORD || !LETTERS.test(word) || kind === 'transcription' || proposals.some(item => item.label === word)) continue;
    if (prefix ? !word.startsWith(prefix) || word === prefix : !FILLERS.has(word.toLowerCase())) continue;
    if (protectedGap && prefix && prefix.length / word.length < .6) continue;
    if (mode === 'strict' && (!prefix || prefix.length < 4)) continue;
    const insert = word + ' ';
    if (cursor.text.length - (prefix?.length ?? 0) + insert.length > WRITING_AID_LIMIT) continue;
    proposals.push(writingAidProposal(request, 'word', rangeStart, cursor.end, insert, word));
  }
  return proposals;
}

function ghostProposal(
  request: WritingAidRequest, text: string, authoredText: string,
): WritingAidProposal | null {
  const {mode, cursor, anchor} = request;
  if (mode === 'strict' || mode === 'off' || anchor?.continuation || LOGIC_GAP.test(cursor.text) ||
      /[`"“”‘’]/u.test(authoredText)) return null;
  const {ghost} = aid.predict(text, {mode, surface: 'ghost', origin: 'learner', authoredText});
  if (!ghost || !['vetted-phrase', 'literal-scaffold', 'typed-spelling'].includes(ghost.kind ?? '')) return null;
  const tokens = [...ghost.suffix.matchAll(OUTPUT_TOKEN)];
  const final = tokens[1];
  const suffix = final && tokens.length > 2 ? ghost.suffix.slice(0, final.index + final[0].length) : ghost.suffix;
  if (!suffix.trim() || suffix.length > MAX_GHOST || cursor.text.length + suffix.length > WRITING_AID_LIMIT) return null;
  return writingAidProposal(request, 'ghost', cursor.end, cursor.end, suffix);
}

function editProposal(
  request: WritingAidRequest, authoredText: string, start: number,
): WritingAidProposal | null {
  const {cursor, mode, anchor, surfaces = ALL_WRITING_AID_SURFACES} = request;
  if (mode === 'off' || anchor?.continuation) return null;
  const {text, end} = cursor;
  const matches = [...authoredText.matchAll(TOKEN)].slice(-MAX_EDIT_TOKENS).reverse();
  for (const match of matches) {
    const span = match[0], from = start + match.index, to = from + span.length;
    if (span.length > MAX_WORD || hasOpenLiteral(text.slice(0, from)) ||
        tutorMathContext(padEdit(text, from, to)) !== 'prose') continue;
    const row = {before: text.slice(0, from), span, after: text.slice(to, end), origin: 'learner' as const, authoredText};
    if (surfaces.replace) {
      const offer = aid.edit({...row, surface: 'blue'}, {mode});
      if (offer?.source === span && text.length - span.length + offer.proposal.length <= WRITING_AID_LIMIT &&
          (mode !== 'strict' || offer.certificate?.rule === 'explicit-notation')) {
        return writingAidProposal(request, 'replace', from, to, offer.proposal);
      }
    }
    if (surfaces.correction && (span.includes(' ') || !writtenWord(span.toLowerCase()))) {
      const offer = aid.edit({...row, surface: 'red'}, {mode});
      if (offer?.source === span && text.length - span.length + offer.proposal.length <= WRITING_AID_LIMIT) {
        return writingAidProposal(request, 'correction', from, to, offer.proposal);
      }
    }
  }
  return null;
}

/** Pure prediction. Nothing in this layer reads a transcript, a network or browser storage. */
export function predictWritingAid(request: WritingAidRequest): WritingAidSuggestions {
  const {anchor, cursor, surfaces = ALL_WRITING_AID_SURFACES} = request;
  if (!anchor || !canSuggestWritingAid(request) || hasOpenLiteral(cursor.text) || tutorMathContext(cursor) !== 'prose') {
    return NO_WRITING_AID;
  }
  const start = startOfWindow(request, anchor.text, anchor.start);
  const authoredText = anchor.text.slice(start);
  if (!authoredText.trim()) return NO_WRITING_AID;
  const text = cursor.text.slice(start);
  return {
    words: surfaces.words ? keyProposals(request, text, authoredText, start) : NO_WRITING_AID.words,
    ghost: surfaces.ghost ? ghostProposal(request, text, authoredText) : null,
    edit: surfaces.replace || surfaces.correction ? editProposal(request, authoredText, start) : null,
  };
}
