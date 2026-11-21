import {padEdit} from '../../pad/padEdit';
import {plainProse, wordAtCaret} from '../input/completionPolicy';
import {tutorMathContext} from '../input/symbolEdit';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, WRITING_AID_LIMIT, canSuggestWritingAid, writingAidProposal, writingAidProposalKey,
  type WritingAidProposal, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {scoreWritingAidFeatures, writingAidFeatures, writingAidVocabularyStrength, type WritingAidModel} from './learning';
import {eligibleTutorSignals, normalizeTutorWritingContext, type TutorWritingOptions, type TutorWritingSignal} from './tutorContext';
import {makeStudyInput} from './vendor/study_input.mjs';
import {makeRevision} from './vendor/legacy/revision.mjs';
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
}, {seed: 0, researchPool: true, maxCandidates: 6});

const WINDOW = 1024;
const MAX_EDIT_TOKENS = 24;
const MAX_WORD = 32;
const MAX_GHOST = 32;
const LETTERS = /^[\p{L}\p{M}]+$/u;
const OUTPUT_TOKEN = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;
const FILLERS = new Set(['a', 'an', 'the', 'i', 'we', 'of', 'to', 'in', 'for', 'with', 'at', 'as', 'on', 'from']);
// These words can select a causal, conditional or inferential relationship.
// A weak stem is not enough to choose one on the learner's behalf.
const LOGICAL_CONNECTORS = new Set(['because', 'since', 'hence', 'thus', 'therefore', 'consequently',
  'accordingly', 'conversely', 'otherwise', 'nevertheless', 'nonetheless', 'whereas', 'provided', 'assuming',
  'then', 'unless', 'nor']);
// Keep complete proof words such as "if" and "not" intact. The spelling
// dictionary includes short abbreviations that also serve as typed stems.
const COMPLETE_PROOF_WORDS = new Set([...wordAssets.common, ...FILLERS, ...LOGICAL_CONNECTORS, 'never', 'none', 'unless', 'nor',
  'implied', 'imply', 'then', 'there', 'therefore', 'conversely', 'greater', 'less',
  'zero', 'even', 'odd', 'nonzero', 'rational', 'integer', 'real', 'preimage', 'preimages']);
const LOGIC_GAP = /(?:\b(?:by|because|since|if|then|not|or|and|only|all|for every|witness|choose|let|take|assume|suppose|given|denote|define|equals?|implies|therefore|hence|thus|consequently|belongs to|is a subset of)|[=<>≤≥∈∉⊆⊂≠∀∃⇒⇔¬])\s*$/iu;
const SOURCED_LINE = /(?:^|\s)(?:tutor|teacher|instructor|assistant|solution|system|code|prompt|quotation)\s*:|\b(?:tutor|teacher|assistant|book|solution|prompt)\s+(?:said|says|wrote|asked|suggested|mentions?|mentioned|gives?|gave)\b/iu;
const LITERAL_LINE = /(?:search|identifier|code|literal|verbatim|product|brand|named|called)\b[^.!?\n]*$/iu;
const TOKEN = /\\[A-Za-z]+|[<=>!\-]+|_[0-9]|\bthe the\b|[\p{L}\p{M}]+/gu;
const RISKY_PERSONAL_WORD = /^(?:not|no|or|if|only|all|some|any|neither|never|contradiction|contrapositive|induction|injective|surjective|bijective|infinite|finite|nonempty|empty|zero|nonzero|positive|negative|unique|uniqueness|compact|compactness|continuous|discontinuous|unbounded|bounded|converges?|convergent|convergence|diverges?|divergent|divergence|contradicts|witness|true|false|greater|less|every|exists|inverse|proof|prove|proves|proved|proving|prime|composite|property|properties|counterexample|theorem|lemma|sufficient|necessary|equivalent|implies|integer|rational|irrational|even|odd|commutative|associative|distributive|invertible|singular|nonsingular|symmetric|antisymmetric|reflexive|transitive|irreflexive|countable|uncountable|measurable|monotone|increasing|decreasing|differentiable|integrable|closed|open|dense|separable|complete|completeness|connected|disconnected|distinct|equal|unequal|idempotent|coprime|independent|dependent|linear|nonlinear|convex|concave)$/iu;
const TUTOR_LOGIC = /^(?:not|no|nor|never|unless|if|then|otherwise|either|neither|both|all|every|each|some|any|exists?|unique|only|true|false|by|because|since|therefore|hence|thus|consequently|suppose|assume|choose|take|let|prove|proof|show|implies?|equals?|satisf(?:y|ies)|contradiction|contrapositive|induction|witness|is|are|was|were|be|being|has|have|contains?|maps?|means?|represents?)$/iu;
const TUTOR_ASSERTION_GAP = /\b(?:is|are|was|were|be|has|have|contains?|maps?|means?|represents?|satisf(?:y|ies)|implies?|equals?)(?:\s+(?:a|an|the))?\s*$/iu;
// Copy whole phrases only in a narrow language about communication. A model's
// role label cannot turn an unseen mathematical step into learner intent.
const TUTOR_COMMUNICATION = /^(?:(?:could|can|would|may) you (?:please )?(?:explain|clarify|restate|repeat|read|show|say|write|describe)\b|please (?:explain|clarify|restate|repeat|read|show|say|write|describe)\b|(?:the|this|that|my) (?:question|prompt|wording|notation|diagram|sentence|passage|phrase|symbol|answer) (?:asks?|mentions?|refers? to|is about|concerns?|describes?)\b|(?:i|we) (?:need|want|would like) (?:help|time|a moment|a little more time|a clearer explanation)\b)/iu;
const TUTOR_METHOD_SIGNAL = /\b(?:proof|prove|proved|proves|theorem|lemma|method|principle|inequality|argument|strategy|apply|applies|use|uses|using|used|step|derive|deduce|conclude|because|hence|therefore|implies?|contradiction|induction)\b|[=<>≤≥≠∈∉⊆⊂∀∃⇒⇔¬]/iu;
const TUTOR_NEUTRAL_WORDS = new Set(('a an the this that these those my your our me you we i it its to of in on at for with about from as ' +
  'again more less slowly clearly clear simpler simple shorter short original earlier previous last next first second ' +
  'question questions prompt prompts wording notation symbol symbols sentence sentences paragraph paragraphs phrase phrases ' +
  'word words meaning language explanation explanations description descriptions diagram diagrams answer answers text ' +
  'read reading write writing explain explaining clarify clarifying repeat repeating restate restating show showing ' +
  'look listen pause wait moment time way please together aloud exactly here there one two').split(' '));
const TUTOR_MAX_OUTPUT = 64;
const TUTOR_MAX_WORDS = 6;
const phraseEngines = new Map<string, ReturnType<typeof makeRevision>>();

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

function declaredTutorVariables(request: WritingAidRequest): Set<string> {
  const variables = new Set<string>();
  for (const signal of normalizeTutorWritingContext(request.tutorContext)?.signals ?? []) {
    for (const variable of signal.variables ?? []) variables.add(variable.toLocaleLowerCase());
  }
  return variables;
}

function tutorTermSignals(request: WritingAidRequest): readonly TutorWritingSignal[] {
  return eligibleTutorSignals(request.tutorContext).filter(signal => !TUTOR_METHOD_SIGNAL.test(signal.text));
}

function authoredEarlier(request: WritingAidRequest, start: number, word: string): boolean {
  const anchor = request.anchor;
  if (!anchor) return false;
  const before = anchor.text.slice(anchor.start, Math.min(start, anchor.text.length));
  return (before.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []).some(value => value.toLocaleLowerCase() === word.toLocaleLowerCase());
}

function tutorEvidence(signal: TutorWritingSignal, start: number, end: number, maxOutputCharacters: number, maxOutputWords: number) {
  return {kind: 'tutor-context' as const, sourceId: signal.sourceId, signalId: signal.id, role: signal.role,
    learnerStart: start, learnerEnd: end, matchedCharacters: end - start, maxOutputCharacters, maxOutputWords};
}

function keyProposals(
  request: WritingAidRequest, text: string, authoredText: string, start: number, model?: WritingAidModel,
  options: TutorWritingOptions = {},
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
  const variables = declaredTutorVariables(request);
  for (const {word, kind, risk} of result.keys) {
    if (word.length > MAX_WORD || !LETTERS.test(word) || kind === 'transcription' || proposals.some(item => item.label === word)) continue;
    if (prefix ? !word.startsWith(prefix) || word === prefix : !FILLERS.has(word.toLowerCase())) continue;
    // A wider pool must not promote a proof method, property, quantifier, or
    // polarity from a weak stem merely to fill an alternative slot.
    if ((risk === 'logic' || RISKY_PERSONAL_WORD.test(word) || LOGICAL_CONNECTORS.has(word.toLocaleLowerCase())) &&
        (!prefix || prefix.length < 5 || prefix.length / word.length < .8)) continue;
    if (protectedGap && prefix && prefix.length / word.length < .6) continue;
    if (mode === 'strict' && (!prefix || prefix.length < 4)) continue;
    if (variables.has(word.toLocaleLowerCase()) && !authoredEarlier(request, rangeStart, word)) continue;
    const insert = word + ' ';
    if (cursor.text.length - (prefix?.length ?? 0) + insert.length > WRITING_AID_LIMIT) continue;
    proposals.push(writingAidProposal(request, 'word', rangeStart, cursor.end, insert, word));
  }
  // Long-term vocabulary only supplies strongly typed word endings. It never
  // supplies a gap, a full already-written word, a proof choice, or new context.
  if (model && prefix && mode !== 'strict' && prefix.length >= 5 && !writtenWord(prefix.toLowerCase())) {
    const lower = prefix.toLocaleLowerCase();
    const now = Date.now();
    for (const [saved, entry] of Object.entries(model.vocabulary).sort((a, b) =>
      writingAidVocabularyStrength(b[1], now) - writingAidVocabularyStrength(a[1], now))) {
      if (entry.observations < 2 || writingAidVocabularyStrength(entry, now) < .15 ||
          !saved.startsWith(lower) || saved === lower || saved.length > MAX_WORD ||
          prefix.length / saved.length < .75 || RISKY_PERSONAL_WORD.test(saved) || LOGICAL_CONNECTORS.has(saved) ||
          variables.has(saved) && !authoredEarlier(request, rangeStart, saved)) continue;
      const word: string = prefix === prefix.toLocaleUpperCase() ? saved.toLocaleUpperCase() :
        /^\p{Lu}/u.test(prefix) ? saved[0].toLocaleUpperCase() + saved.slice(1) : saved;
      if (!word.startsWith(prefix) || proposals.some(item => item.label === word) ||
          cursor.text.length - prefix.length + word.length + 1 > WRITING_AID_LIMIT) continue;
      proposals.push(writingAidProposal(request, 'word', rangeStart, cursor.end, word + ' ', word));
      if (proposals.length >= 18) break;
    }
  }
  if (options.terms !== false && prefix && mode !== 'strict' && prefix.length >= 5 && !writtenWord(prefix.toLowerCase())) {
    for (const signal of tutorTermSignals(request)) {
      for (const original of signal.text.match(/[\p{L}\p{M}]{4,32}/gu) ?? []) {
        const saved = original.toLocaleLowerCase(), lower = prefix.toLocaleLowerCase();
        if (!saved.startsWith(lower) || saved === lower || prefix.length / saved.length < .8 ||
            RISKY_PERSONAL_WORD.test(saved) || LOGICAL_CONNECTORS.has(saved) || TUTOR_LOGIC.test(saved) ||
            variables.has(saved) && !authoredEarlier(request, rangeStart, saved)) continue;
        const word: string = prefix === prefix.toLocaleUpperCase() ? saved.toLocaleUpperCase() :
          /^\p{Lu}/u.test(prefix) ? saved[0].toLocaleUpperCase() + saved.slice(1) : saved;
        if (!word.startsWith(prefix) || proposals.some(item => item.label === word) ||
            cursor.text.length - prefix.length + word.length + 1 > WRITING_AID_LIMIT) continue;
        proposals.push(writingAidProposal(request, 'word', rangeStart, cursor.end, word + ' ', word,
          tutorEvidence(signal, rangeStart, cursor.end, MAX_WORD, 1)));
        if (proposals.length >= 24) return proposals;
      }
    }
  }
  return proposals;
}

function ghostProposals(
  request: WritingAidRequest, text: string, authoredText: string, startOfAuthored: number, options: TutorWritingOptions,
): WritingAidProposal[] {
  const {mode, cursor, anchor} = request;
  if (mode === 'strict' || mode === 'off' || anchor?.continuation || LOGIC_GAP.test(cursor.text) ||
      /[`"“”‘’]/u.test(authoredText)) return [];
  const proposals: WritingAidProposal[] = [];
  function add(suffix: string) {
    const tokens = [...suffix.matchAll(OUTPUT_TOKEN)];
    const final = tokens[1];
    const bounded = final && tokens.length > 2 ? suffix.slice(0, final.index + final[0].length) : suffix;
    if (!bounded.trim() || bounded.length > MAX_GHOST || cursor.text.length + bounded.length > WRITING_AID_LIMIT ||
        proposals.some(item => item.insert === bounded)) return;
    proposals.push(writingAidProposal(request, 'ghost', cursor.end, cursor.end, bounded));
  }
  const {ghost} = aid.predict(text, {mode, surface: 'ghost', origin: 'learner', authoredText});
  if (ghost && ['vetted-phrase', 'literal-scaffold', 'typed-spelling'].includes(ghost.kind ?? '')) add(ghost.suffix);
  if (options.wording !== false) {
    const sentence = Math.max(authoredText.lastIndexOf('\n') + 1,
      authoredText.lastIndexOf('. ') < 0 ? 0 : authoredText.lastIndexOf('. ') + 2);
    const fragment = authoredText.slice(sentence), words = fragment.match(/[\p{L}\p{M}]+/gu) ?? [];
    const variableNames = declaredTutorVariables(request);
    if (fragment.length >= 12 && words.length >= 3 && !TUTOR_ASSERTION_GAP.test(fragment) &&
        !/[`"“”‘’]/u.test(fragment)) {
      for (const signal of eligibleTutorSignals(request.tutorContext)) {
        if (!TUTOR_COMMUNICATION.test(signal.text) || !signal.text.startsWith(fragment) || signal.text.length === fragment.length) continue;
        const remaining = signal.text.slice(fragment.length);
        if (/[\d=<>≤≥≠∈∉⊆⊂∀∃⇒⇔¬_\\$`"“”‘’{}\[\]()/*+^|~-]/u.test(remaining)) continue;
        const tokens = [...remaining.matchAll(/[\p{L}\p{M}]+/gu)];
        if (tokens.length < 2) continue;
        const last = tokens[Math.min(tokens.length, TUTOR_MAX_WORDS) - 1];
        let end = last.index + last[0].length;
        while (end > 0 && end > TUTOR_MAX_OUTPUT) {
          const previous = tokens.filter(token => token.index + token[0].length < end).at(-1);
          end = previous ? previous.index + previous[0].length : 0;
        }
        const suffix = remaining.slice(0, end);
        const partial = fragment.match(/[\p{L}\p{M}]+$/u)?.[0] ?? '';
        const check = (partial + suffix).match(/[\p{L}\p{M}]+/gu) ?? [];
        if (!suffix.trim() || check.length < 2 || check.some(word => !TUTOR_NEUTRAL_WORDS.has(word.toLocaleLowerCase()) ||
            TUTOR_LOGIC.test(word) || RISKY_PERSONAL_WORD.test(word) ||
            (word.length === 1 && !/^[aAiI]$/u.test(word)) ||
            variableNames.has(word.toLocaleLowerCase()) && !authoredEarlier(request, startOfAuthored + sentence, word)) ||
            cursor.text.length + suffix.length > WRITING_AID_LIMIT || proposals.some(item => item.insert === suffix)) continue;
        proposals.push(writingAidProposal(request, 'ghost', cursor.end, cursor.end, suffix, suffix,
          tutorEvidence(signal, startOfAuthored + sentence, cursor.end, TUTOR_MAX_OUTPUT, TUTOR_MAX_WORDS)));
        if (proposals.length >= 12) break;
      }
    }
  }
  // Only vetted requests about wording/reading get alternative continuations.
  // Each candidate must independently pass the existing certificate and guard;
  // the literal/scaffold and spelling lanes never manufacture alternatives.
  const sentence = text.lastIndexOf('. ');
  const start = Math.max(text.lastIndexOf('\n') + 1, sentence < 0 ? 0 : sentence + 2);
  const fragment = text.slice(start).toLocaleLowerCase();
  if (!/^(?:could|can|would) you (?:explain|clarify|restate|repeat|read|show)(?:\s|$)/u.test(fragment)) return proposals;
  for (const phrase of phraseData.phrases) {
    if (!phrase.startsWith(fragment) || phrase === fragment) continue;
    let engine = phraseEngines.get(phrase);
    if (!engine) {
      engine = makeRevision({...phraseData, phrases: [phrase]}, veto, editPolicy);
      phraseEngines.set(phrase, engine);
    }
    const candidate = engine.predict(text, {surface: 'ghost', origin: 'learner', authoredText}).ghost;
    if (candidate) add(candidate.suffix);
    if (proposals.length >= 6) break;
  }
  return proposals;
}

function editProposals(
  request: WritingAidRequest, authoredText: string, start: number,
): WritingAidProposal[] {
  const {cursor, mode, anchor, surfaces = ALL_WRITING_AID_SURFACES} = request;
  if (mode === 'off' || anchor?.continuation) return [];
  const {text, end} = cursor;
  const proposals: WritingAidProposal[] = [];
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
        proposals.push(writingAidProposal(request, 'replace', from, to, offer.proposal));
      }
    }
    if (surfaces.correction && (span.includes(' ') || !writtenWord(span.toLowerCase()))) {
      const offer = aid.edit({...row, surface: 'red'}, {mode});
      if (offer?.source === span && text.length - span.length + offer.proposal.length <= WRITING_AID_LIMIT) {
        proposals.push(writingAidProposal(request, 'correction', from, to, offer.proposal));
      }
    }
  }
  return proposals;
}

export interface WritingAidPool {
  readonly words: readonly WritingAidProposal[];
  readonly ghost: readonly WritingAidProposal[];
  readonly edit: readonly WritingAidProposal[];
}
const EMPTY_POOL: WritingAidPool = Object.freeze({words: [], ghost: [], edit: []});

/** Deterministic eligibility runs before ranking; only learner input reaches this engine. */
export function predictWritingAidPool(request: WritingAidRequest, model?: WritingAidModel, options: TutorWritingOptions = {}): WritingAidPool {
  const {anchor, cursor, surfaces = ALL_WRITING_AID_SURFACES} = request;
  if (!anchor || !canSuggestWritingAid(request) || hasOpenLiteral(cursor.text) || tutorMathContext(cursor) !== 'prose') {
    return EMPTY_POOL;
  }
  const start = startOfWindow(request, anchor.text, anchor.start);
  const authoredText = anchor.text.slice(start);
  if (!authoredText.trim()) return EMPTY_POOL;
  const text = cursor.text.slice(start);
  return {
    words: surfaces.words ? keyProposals(request, text, authoredText, start, model, options) : [],
    ghost: surfaces.ghost ? ghostProposals(request, text, authoredText, start, options) : [],
    edit: surfaces.replace || surfaces.correction ? editProposals(request, authoredText, start) : [],
  };
}

/** A small morphological family heuristic avoids showing three near-identical endings. */
function family(proposal: WritingAidProposal): string {
  return proposal.label.toLocaleLowerCase().replace(/(?:ing|ers?|ed|es|s|ly|ment|ions?|al)$/u, '').slice(0, 5);
}

export function selectWritingAidPool(
  pool: WritingAidPool, model?: WritingAidModel,
  excluded: Readonly<Record<'words' | 'ghost' | 'edit', ReadonlySet<string>>> = {
    words: new Set(), ghost: new Set(), edit: new Set(),
  }, now = Date.now(), options: TutorWritingOptions = {},
): WritingAidSuggestions {
  function contextBoost(proposal: WritingAidProposal): number {
    const signals = eligibleTutorSignals(proposal.snapshot.tutorContext);
    if (proposal.kind === 'word' && options.terms !== false) {
      const value = proposal.label.toLocaleLowerCase();
      return tutorTermSignals(proposal.snapshot).some(signal => {
        const words: readonly string[] = signal.text.toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
        return words.includes(value);
      }) ? .35 : 0;
    }
    if (proposal.kind === 'replace' && options.symbols !== false) {
      return signals.some(signal => signal.symbols?.includes(proposal.insert)) ? .35 : 0;
    }
    return proposal.kind === 'ghost' && options.wording !== false && proposal.tutorEvidence ? .2 : 0;
  }
  function ranked(items: readonly WritingAidProposal[], omit: ReadonlySet<string>): WritingAidProposal[] {
    return items.map((proposal, index) => ({proposal, index,
      score: (model ? scoreWritingAidFeatures(model, writingAidFeatures(proposal), now, options.strategy) : 0) + contextBoost(proposal)}))
      .filter(({proposal}) => !omit.has(writingAidProposalKey(proposal)))
      .sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.proposal);
  }
  const candidates = ranked(pool.words, excluded.words);
  const words: WritingAidProposal[] = [], families = new Set<string>();
  for (const proposal of candidates) {
    const key = family(proposal);
    if (families.has(key)) continue;
    words.push(proposal);
    families.add(key);
    if (words.length === 3) break;
  }
  for (const proposal of candidates) {
    if (words.length === 3) break;
    if (!words.includes(proposal)) words.push(proposal);
  }
  return {words, edit: ranked(pool.edit, excluded.edit)[0] ?? null, ghost: ranked(pool.ghost, excluded.ghost)[0] ?? null};
}

/** Pure prediction. Nothing in this layer reads a transcript, a network or browser storage. */
export function predictWritingAid(request: WritingAidRequest): WritingAidSuggestions {
  const pool = predictWritingAidPool(request);
  if (!pool.words.length && !pool.edit.length && !pool.ghost.length) return NO_WRITING_AID;
  return selectWritingAidPool(pool);
}
