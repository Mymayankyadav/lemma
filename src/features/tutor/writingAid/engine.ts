import {selectWritingAidPool, type WritingAidPool} from './poolRanking';
export {applyNeuralReply, selectWritingAidPool, type WritingAidPool} from './poolRanking';
import type {WordTrace} from './menuRanking';
import {learnerAuthored, proseSymbol} from './menuEdit';
import {hasOpenLiteral, hasProofChoiceGap} from './eligibility';
import {personalContext} from './adaptation';
import {effectiveAidLevel} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import {padEdit} from '../../pad/padEdit';
import {plainProse, trailingSpace, wordAtCaret} from '../input/completionPolicy';
import {tutorMathContext} from '../input/symbolEdit';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, WRITING_AID_LIMIT, canSuggestWritingAid, proposalEligible, writingAidProposal, writingAidProposalKey,
  proposalEdit, type WritingAidProposal, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {writingAidVocabularyStrength, type WritingAidModel} from './learning';
import {makeStudyInput} from './vendor/study_input.mjs';
import {makeRevision} from './vendor/legacy/revision.mjs';
import phraseData from './vendor/legacy/runtime-phrases.json';
import veto from './vendor/legacy/runtime-veto.json';
import editPolicy from './vendor/legacy/policy.json';
import wordList from './vendor/wordlist.txt?raw';
import wordAssets from './vendor/word-assets.json';
import compactRanks from './vendor/compact-ranks.json';
import speedPolicy from './vendor/speed-policy.json';
import {decodeWord, decoderSymbols, prepareLanguage, type LanguageDistribution, typeaheadActive, typeaheadRequested, writingDecoderReady} from './decoder/ngramSpatial';
import {atSentenceStart, capitalise, grammarAllows} from './grammar';
import {aidScopeSpecificity, contextualWording, tutorHint, type AidRankingContext} from './answerAids';
import {declaredMenuCandidates, literalMenuCandidates, prepareMenuCopies} from './menuCandidates';
import {generalNgram, prepareRightContext} from './decoder/kn';

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
const LEXICAL_WORD = /^[\p{L}\p{M}]+(?:['’\p{Pd}][\p{L}\p{M}]+)*$/u;
const OUTPUT_TOKEN = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;
const FILLERS = new Set(['a', 'an', 'the', 'i', 'we', 'of', 'to', 'in', 'for', 'with', 'at', 'as', 'on', 'from']);
// Keep complete proof words such as "if" and "not" intact. The spelling
// dictionary includes short abbreviations that also serve as typed stems.
const COMPLETE_PROOF_WORDS = new Set([...wordAssets.common, ...FILLERS, 'never', 'none', 'unless', 'nor',
  'implied', 'imply', 'then', 'there', 'therefore', 'conversely', 'greater', 'less',
  'zero', 'even', 'odd', 'nonzero', 'rational', 'integer', 'real', 'preimage', 'preimages']);
const TOKEN = /\\[A-Za-z]+|[<=>!\-]+|_[0-9]|\bthe the\b|[\p{L}\p{M}]+/gu;
const RISKY_PERSONAL_WORD = /^(?:not|no|or|if|only|all|some|any|neither|never|contradiction|contrapositive|induction|injective|surjective|bijective|infinite|finite|nonempty|empty|zero|nonzero|positive|negative|unique|uniqueness|compact|compactness|continuous|discontinuous|unbounded|bounded|converges?|convergent|convergence|diverges?|divergent|divergence|contradicts|witness|true|false|greater|less|every|exists|inverse|proof|prove|proves|proved|proving|prime|composite|property|properties|counterexample|theorem|lemma|sufficient|necessary|equivalent|implies|integer|rational|irrational|even|odd|commutative|associative|distributive|invertible|singular|nonsingular|symmetric|antisymmetric|reflexive|transitive|irreflexive|countable|uncountable|measurable|monotone|increasing|decreasing|differentiable|integrable|closed|open|dense|separable|complete|completeness|connected|disconnected|distinct|equal|unequal|idempotent|coprime|independent|dependent|linear|nonlinear|convex|concave)$/iu;
/** N221 (Owner): words that steer a proof (its reasons and moves) are never offered from a short stem or as the next
 *  word: typing "b" must not suggest "because", nor a space "as". The learner can still type them in full. */
const PROOF_STEERING = /^(?:because|by|as|since|so|hence|thus|therefore|then|consequently|implies|implying|whence|thereby|follows|clearly|obviously|trivially|suppose|assume|assuming|wlog)$/iu;
/** Gaps where the next thing is a learner decision. */
const OPERAND_GAP = /(?:\b(?:take|choose|witness|equals?|by|implies|therefore|hence|consequently|belongs to|is a subset of)|[=<>≤≥∈∉⊆⊂≠∀∃⇒⇔¬])\s*$/iu;

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

function startOfWindow(authored: string, start: number, caret: number): number {
  const floor = caret - WINDOW;
  if (floor <= start) return start;
  // Do not create a prefix out of the middle of a learner's earlier word.
  const boundary = authored.slice(floor, caret).search(/\s/u);
  return boundary < 0 ? caret : floor + boundary + 1;
}

function keyProposals(
  request: WritingAidRequest, text: string, authoredText: string, start: number, model?: WritingAidModel,
  observeLanguage?: (language: LanguageDistribution) => void, trace?: WordTrace[],
): WritingAidProposal[] {
  const {cursor, mode, anchor} = request;
  if (mode === 'off') return [];
  // N233: with typeaheadV2 on and the n-gram loaded, the next word is offered at a word boundary and the question-aware
  // learner-choice rule replaces the blanket word list.
  const v2 = typeaheadActive(request.expanded);
  const prefix = wordAtCaret(cursor);
  const rangeStart = cursor.end - (prefix?.length ?? 0);
  const before = cursor.text.slice(0, rangeStart);
  const protectedGap = hasProofChoiceGap(before);
  const spacer = trailingSpace(cursor.text.slice(cursor.end));
  if (rangeStart < start || (protectedGap && prefix && prefix.length < 5)) return [];
  if (!v2 && protectedGap && !prefix) return [];
  if (prefix) {
    if (!(v2 ? /^[\p{L}\p{M}'’\p{Pd}]+$/u.test(prefix) : LETTERS.test(prefix)) || !plainProse(cursor, prefix) || text.slice(-prefix.length) !== prefix ||
        COMPLETE_PROOF_WORDS.has(prefix.toLowerCase()) || anchor?.continuation) return [];
  } else if (mode === 'strict' || !/[ \t]$/u.test(text) ||
      (!v2 && !LETTERS.test(text.trimEnd().match(/[\p{L}\p{M}]+$/u)?.[0] ?? ''))) {
    return [];
  }
  const result = aid.predict(text, {mode, surface: 'keys', origin: 'learner', authoredText});
  const proposals: WritingAidProposal[] = [];
  const hintContext: AidRankingContext = {aid: request.aid, mastery: request.mastery, subject: request.subject,
    step: request.step, mode: 'prose', before, prefix: prefix ?? '', acceptedSpans: request.acceptedSpans,
    anchorStart: anchor?.start, allowPhraseTaps: v2 && !anchor?.continuation};
  const personal = model && v2 ? personalContext(model.adaptation, authoredText.slice(0, rangeStart - start), request.subject) : undefined;
  const aidActive = request.aid && effectiveAidLevel(request.aid.level, request.mastery) !== 'none';
  const hintWords = request.aid?.ranking?.hints?.flatMap(hint => hint.kind === 'word' && aidScopeSpecificity(hint, hintContext) !== undefined
    ? [hint.entry, ...hint.aliases ?? []] : []) ?? [];
  const explicit = v2 && aidActive ? [...new Set([...request.aid?.terms ?? [], ...hintWords])]
    .filter(word => LEXICAL_WORD.test(word) && word.length <= MAX_WORD && (prefix ?
      word.toLowerCase().startsWith(prefix.toLowerCase()) : hintWords.includes(word) || tutorHint(hintContext, word).role === 'given')) : [];
  const language = prepareLanguage(before, {expanded: v2, personal, extraLexical: explicit, question: request.question,
    authored: authoredText.slice(0, rangeStart - start), subject: request.subject});
  observeLanguage?.(language);
  const bank = contextualWording(hintContext);
  const trial = v2 && request.menuTrial && !anchor?.continuation &&
    learnerAuthored(request.acceptedSpans, rangeStart, cursor.end);
  const copies = trial ? prepareMenuCopies(request, before, prefix ?? '', language.score) : undefined;
  const literal = trial && mode !== 'strict' && !protectedGap ? literalMenuCandidates(request, hintContext) : [];
  const inPhrase = bank.some(entry => entry.progress > 0);
  // The spatial keyboard covers ASCII touch keys. Copy paths also preserve
  // mathematical names and compound terms from the actual question.
  const copied = v2 && prefix ? (language.matching?.(prefix.toLowerCase()) ?? language.next).filter(word => /[^a-z]/u.test(word) && LEXICAL_WORD.test(word) &&
    word.startsWith(prefix.toLowerCase())).map(word => language.forms.get(word) ?? word) : [];
  const sentenceStart = v2 && !prefix && atSentenceStart(before);
  // At a boundary inside a protected gap (let, take, by, =…) the next thing is the learner's own choice: no words.
  const wordsAllowed = !(v2 && !prefix && protectedGap);
  const lexical = wordsAllowed ? decoded(result.keys, before, prefix ?? '', rangeStart, text, authoredText, language, v2) : [];
  const explicitCandidates = wordsAllowed ? [...explicit, ...copied].map(word =>
    ({word, decoded: true, score: language.score(word.toLowerCase())})) : [];
  const seenLabels = new Set<string>();
  let first64Floor = Infinity, admitted = 0;
  for (const [batch, candidates] of [lexical, explicitCandidates].entries()) {
    for (const {word: candidate, kind, risk, correction, decoded: fromDecoder, score} of candidates as readonly KeyCandidate[]) {
      // All remaining lexical scores are ordered. Even the largest tutor reward cannot reach the first 64
      // admitted distinct edits, including their maximum possible phrase penalty. Explicit terms have their own pass.
      if (v2 && !request.exhaustivePool && batch === 0 && admitted >= 64 && score !== undefined &&
          score + (trial ? 0 : Math.log(2)) < first64Floor) break;
      const word = sentenceStart ? capitalise(candidate) : candidate;
      const raw = trace && {start: rangeStart, end: cursor.end, insert: word + spacer, caret: rangeStart + word.length + spacer.length, source: 'word' as const, eligible: false};
      if (raw) trace!.push(raw);
      if (v2 && !grammarAllows(before, word)) continue;
      if (word.length > MAX_WORD || !(v2 ? LEXICAL_WORD : LETTERS).test(word) || kind === 'transcription' || seenLabels.has(word)) continue;
      // N221: a decoded correction replaces the typed letters with the word their taps were nearest to. It is only a
      // choice in the strip, never applied by itself, and never a proof word or a word in a protected gap.
      if (correction) {
        if (!prefix || prefix.length < 2 || mode === 'strict' || protectedGap || risk === 'logic' ||
            RISKY_PERSONAL_WORD.test(word) || word.toLowerCase() === prefix.toLowerCase() || word.length < prefix.length) continue;
      } else if (v2 ? prefix && (!word.toLowerCase().startsWith(prefix.toLowerCase()) || word === prefix)
        : prefix ? !(fromDecoder ? word.toLowerCase().startsWith(prefix.toLowerCase()) : word.startsWith(prefix)) ||
          word === prefix : !FILLERS.has(word.toLowerCase())) continue;
      // A wider pool must not promote a proof method, property, quantifier, or
      // polarity from a weak stem merely to fill an alternative slot.
      if (!v2 && (risk === 'logic' || RISKY_PERSONAL_WORD.test(word) || PROOF_STEERING.test(word)) &&
          (!prefix || prefix.length < 5 || prefix.length / word.length < .8)) continue;
      if (protectedGap && prefix && prefix.length / word.length < .6) continue;
      if (mode === 'strict' && (!prefix || prefix.length < 4)) continue;
      const insert = word + spacer;
      if (cursor.text.length - (prefix?.length ?? 0) + insert.length > WRITING_AID_LIMIT) continue;
      const proposal = writingAidProposal(request, 'word', rangeStart, cursor.end, insert, word);
      const hint = tutorHint(hintContext, word);
      const base = v2 ? score ?? language.score(word.toLowerCase()) : undefined;
      const offered: WritingAidProposal = {...proposal, source: fromDecoder ? 'decoder' : undefined,
        role: hint.role, tutorAdjustment: hint.adjustment, logic: v2 && risk === 'logic',
        score: base === undefined ? undefined : base + hint.adjustment, menuBase: trial ? base : undefined};
      seenLabels.add(word);
      if (!proposalEligible(request, offered)) continue;
      if (raw) raw.eligible = true;
      if (batch === 0 && admitted < 64 && offered.score !== undefined) {
        first64Floor = Math.min(first64Floor, (offered.menuBase ?? offered.score) - (inPhrase ? Math.log(2) : 0));
        admitted++;
      }
      proposals.push(offered);
    }
  }
  for (const {text: word, phrase} of bank) {
    if (cursor.text.length - (prefix?.length ?? 0) + word.length + 1 > WRITING_AID_LIMIT || anchor?.continuation && !prefix) continue;
    const hint = tutorHint(hintContext, word);
    const lm = language.score(word.split(/\s+/u)[0].toLowerCase().replace(/[.,;:!?]+$/u, ''));
    const base = (Number.isFinite(lm) ? lm : Math.log(.002)) + Math.log(4) / phrase.trim().split(/\s+/u).length;
    const exact = literal.find(item => item.text.replace(/\s+/gu, ' ') === word && item.insert !== word + spacer);
    const proposal: WritingAidProposal = {...writingAidProposal(request, 'word', rangeStart, cursor.end, exact?.insert ?? word + spacer, exact?.text ?? word),
      source: exact?.source ?? 'bank', role: hint.role ?? 'neutral', tutorAdjustment: hint.adjustment,
      score: base + hint.adjustment, menuBase: trial ? base : undefined};
    proposals.push(proposal);
  }
  if (trial && copies && (mode !== 'strict' || (prefix?.length ?? 0) >= 4)) {
    const declared = !protectedGap ? declaredMenuCandidates(request, hintContext) : [];
    const sources = [...(wordsAllowed ? copies.candidates : []), ...literal, ...declared];
    const identity = new Set(proposals.map(proposal => proposal.insert));
    for (const {text: label, word, insert, source} of sources) {
      const hint = tutorHint(hintContext, label);
      const contextScore = source === 'declared' ? language.mathLog - Math.log(8) : language.score(word.toLowerCase());
      const base = (Number.isFinite(contextScore) ? contextScore : Math.log(.002)) -
        Number(label !== word && source !== 'literal') * Math.log(4);
      const proposal = {...writingAidProposal(request, 'word', rangeStart, cursor.end, insert, label), source,
        score: base + hint.adjustment, menuBase: base,
        role: hint.role, tutorAdjustment: hint.adjustment};
      const reason = source !== 'declared' && (!grammarAllows(before, word) ||
        protectedGap && prefix && prefix.length / word.length < .6) ? 'grammar' :
        cursor.text.length - (cursor.end - rangeStart) + insert.length > WRITING_AID_LIMIT ? 'range' :
        !proposalEligible(request, proposal) ? 'eligibility' : identity.has(insert) ? 'duplicate' : undefined;
      if (reason === 'duplicate') {
        trace?.push({...proposalEdit(proposal), source, eligible: true, reason});
        continue;
      }
      if (reason) {
        trace?.push({...proposalEdit(proposal), source, eligible: false, reason});
        continue;
      }
      identity.add(insert);
      proposals.push(proposal);
    }
  }
  if (v2 && !prefix && !sentenceStart && !OPERAND_GAP.test(before)) {
    const freshWitness = /\blet\s*$/iu.test(before) && /\b(?:choose|find|exhibit|witness)\b/iu.test(request.question?.[0] ?? '');
    const symbols = freshWitness ? [] : decoderSymbols(before, [...request.question ?? [], ...aidActive ? request.aid?.symbols ?? [] : []]).slice(0, 8);
    const declarations = aidActive ? request.aid?.ranking?.declaredSymbols ?? [] : [];
    const declared = trial ? declarations.filter(item => declarations.filter(other => other.symbol === item.symbol).length === 1) : declarations;
    const subject = /(?:^|\s)([A-Za-z])\s+is\s+(?:an?\s+)?(?:open |closed )?(?:subset of|in|open in|closed in)\s*$/u.exec(before)?.[1];
    const ambient = declared.filter(symbol => symbol.symbol === subject && symbol.role === 'set' && symbol.ambient && !symbol.binder).map(symbol => symbol.ambient);
    const matchingAmbient = [...new Set(ambient)];
    if (matchingAmbient.length === 1 && matchingAmbient[0] && !symbols.includes(matchingAmbient[0])) symbols.push(matchingAmbient[0]);
    for (const item of declared) if (!item.binder && !symbols.includes(item.symbol)) symbols.push(item.symbol);
    const modeled = symbols.map((symbol, index) => {
      const hint = tutorHint(hintContext, symbol);
      const weight = (matchingAmbient.length === 1 && matchingAmbient[0] === symbol ? 4 : 1) / (index + 1);
      const proposal: WritingAidProposal = {...writingAidProposal(request, 'word', rangeStart, cursor.end, proseSymbol(before, symbol, spacer, request.acceptedSpans), symbol),
        source: 'symbol', role: hint.role, tutorAdjustment: hint.adjustment};
      return {weight, proposal, adjustment: hint.adjustment};
    }).filter(({proposal}) => {
      const eligible = proposalEligible(request, proposal);
      if (trace && !eligible) trace.push({...proposalEdit(proposal), source: 'symbol', eligible});
      return eligible;
    });
    const total = modeled.reduce((sum, {weight}) => sum + weight, 0);
    for (const {weight, proposal, adjustment} of modeled) {
      const base = language.mathLog + Math.log(weight / total);
      proposals.push({...proposal, score: base + adjustment, menuBase: trial ? base : undefined});
    }
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
          prefix.length / saved.length < .75 || RISKY_PERSONAL_WORD.test(saved)) continue;
      const word: string = prefix === prefix.toLocaleUpperCase() ? saved.toLocaleUpperCase() :
        /^\p{Lu}/u.test(prefix) ? saved[0].toLocaleUpperCase() + saved.slice(1) : saved;
      if (!word.startsWith(prefix) || proposals.some(item => item.label === word) ||
          cursor.text.length - prefix.length + word.length + 1 > WRITING_AID_LIMIT) continue;
      const hint = tutorHint(hintContext, word);
      const base = v2 ? language.score(saved) : undefined;
      proposals.push({...writingAidProposal(request, 'word', rangeStart, cursor.end, word + spacer, word),
        source: 'personal', role: hint.role, tutorAdjustment: hint.adjustment,
        score: base === undefined ? undefined : base + hint.adjustment, menuBase: trial ? base : undefined});
    }
  }
  const eligible = proposals.filter(proposal => proposalEligible(request, proposal));
  if (trace) {
    const allowed = new Set(eligible);
    for (const item of proposals.filter(item => item.source && item.source !== 'decoder')) trace.push({...proposalEdit(item), source: item.source === 'decoder' ? 'word' : item.source ?? 'word', eligible: allowed.has(item)});
  }
  if (!v2 && !bank.length) return eligible;
  const deduped = new Map<string, WritingAidProposal>();
  const shortlistScore = (item: WritingAidProposal) => item.menuBase ?? item.score ?? -Infinity;
  for (const candidate of eligible) {
    const item = inPhrase && candidate.source !== 'bank' && candidate.source !== 'literal' && candidate.score !== undefined &&
      candidate.source !== 'symbol' && candidate.source !== 'declared' && !bank.some(entry => entry.text === candidate.label)
      ? {...candidate, score: candidate.score - Math.log(2),
        menuBase: candidate.menuBase === undefined ? undefined : candidate.menuBase - Math.log(2)} : candidate;
    const key = writingAidProposalKey(item);
    const previous = deduped.get(key);
    if (!previous || shortlistScore(previous) < shortlistScore(item)) deduped.set(key, item);
  }
  const shortlist = [...deduped.values()].sort((a, b) => shortlistScore(b) - shortlistScore(a)).slice(0, 64);
  if (!copies) return shortlist;
  const ngram = generalNgram();
  const right = ngram && (trace || request.menuTrial === 'm2-right')
    ? prepareRightContext(ngram, before, cursor.text.slice(cursor.end)) : undefined;
  return shortlist.map((item, index) => ({...item, contextRecurrence: copies.recurrence(item.label),
    rightContextGain: index < 24 ? right?.(item.insert) : undefined}));
}

interface KeyCandidate {
  readonly word: string; readonly kind?: string; readonly risk?: string; readonly correction?: boolean;
  /** N233: the decoder's ln score, to merge words with the maths slot at a boundary. */
  readonly score?: number;
  /** From the N221 decoder: may change the case of the typed letters (a capitalised name from the tutor's question). */
  readonly decoded?: boolean;
}
/** The existing engine's protected proof gaps ("take x in", "by", "=", …), where it offers no new words. */
const PROTECTED_GAP = /(?:\b(?:take|choose|let)\s+\p{L}[\p{L}\d_]*\s+(?:in|from)|\b(?:by|equals?|witness|implies|therefore|hence|consequently)|[=<>≤≥∈∉⊆⊂≠])\s*$/iu;

/**
 * N221: once N219's lexicon has loaded, the n-gram and touch decoder widens and ranks the word pool. The existing
 * engine's words keep their spelling and risk tags; the decoder adds completions and near-tap corrections, and every
 * word is ordered by the decoder's score. Before it loads (and in tests without it) the pool is the existing one.
 */
function decoded(keys: readonly KeyCandidate[], before: string, prefix: string, start: number, text: string,
  authoredText: string, language: LanguageDistribution, v2: boolean): readonly KeyCandidate[] {
  // The decoder never invents a next word, stays out of protected proof gaps, and, like the existing engine, stops
  // after two accepted words in a row.
  if (!writingDecoderReady() || (!prefix && !v2) || PROTECTED_GAP.test(before) ||
      (text.slice(authoredText.length).match(OUTPUT_TOKEN)?.length ?? 0) >= 2) return keys;
  const own = new Map(keys.filter(key => key.kind !== 'transcription').map(key => [key.word.toLowerCase(), key]));
  // A correctly spelled word (in the larger spelling list too) is completed, never corrected into another word.
  const spelled = writtenWord(prefix.toLowerCase());
  const ranked = decodeWord(before, prefix, start, [...own.keys()], v2 ? Infinity : 12, language, v2).filter(item => !(spelled && item.correction));
  const seen = new Set<string>();
  const merged: KeyCandidate[] = [];
  for (const item of ranked) {
    const lower = item.word.toLowerCase();
    const existing = own.get(lower);
    seen.add(lower);
    merged.push(existing ? {...existing, score: item.score}
      : {word: item.word, ...(item.risk ? {risk: item.risk} : {}), correction: item.correction, decoded: true, score: item.score});
  }
  for (const key of keys) if (!seen.has(key.word.toLowerCase())) merged.push(key);
  if (v2) {
    for (const [index, item] of merged.entries()) {
      if (item.score === undefined) merged[index] = {...item, score: language.score(item.word.toLowerCase())};
    }
    merged.sort((a, b) => b.score! - a.score!);
  }
  return merged;
}

function ghostProposals(
  request: WritingAidRequest, text: string, authoredText: string,
): WritingAidProposal[] {
  const {mode, cursor, anchor} = request;
  if (mode === 'strict' || mode === 'off' || anchor?.continuation || hasProofChoiceGap(cursor.text) ||
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

const EMPTY_POOL: WritingAidPool = Object.freeze({words: [], ghost: [], edit: []});

/** Deterministic eligibility runs before ranking; only learner input reaches this engine. */
export function predictWritingAidPool(request: WritingAidRequest, model?: WritingAidModel,
  observeLanguage?: (language: LanguageDistribution) => void): WritingAidPool {
  const {anchor, cursor, surfaces = ALL_WRITING_AID_SURFACES} = request;
  if (!anchor || !canSuggestWritingAid(request) || hasOpenLiteral(cursor.text) || tutorMathContext(cursor) !== 'prose') {
    return EMPTY_POOL;
  }
  const caret = anchor.caret ?? anchor.text.length;
  const start = startOfWindow(anchor.text, anchor.start, caret);
  const authoredText = anchor.text.slice(start, caret);
  if (!authoredText.trim()) return EMPTY_POOL;
  const text = cursor.text.slice(start, cursor.end);
  const trace: WordTrace[] | undefined = request.replayDiagnostics && request.tracePool !== false ? [] : undefined;
  return {
    trace, words: surfaces.words ? keyProposals(request, text, authoredText, start, model, observeLanguage, trace) : [],
    ghost: surfaces.ghost && cursor.end === cursor.text.length && !typeaheadRequested(request.expanded) ? ghostProposals(request, text, authoredText).filter(proposal => proposalEligible(request, proposal)) : [],
    edit: surfaces.replace || surfaces.correction ? editProposals(request, authoredText, start).filter(proposal => proposalEligible(request, proposal)) : [],
  };
}

/** Pure prediction. Nothing in this layer reads a transcript, a network or browser storage. */
export function predictWritingAid(request: WritingAidRequest): WritingAidSuggestions {
  const pool = predictWritingAidPool(request);
  if (!pool.words.length && !pool.edit.length && !pool.ghost.length) return NO_WRITING_AID;
  return selectWritingAidPool(pool);
}
