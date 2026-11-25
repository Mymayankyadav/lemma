import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {predictWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {neuralFileBytes, neuralFitsColdBudget, selectNeuralBackend, type NeuralManifest} from '../../../src/features/tutor/writingAid/decoder/neuralManifest';
import {exposureIdentity, visibleTime} from '../../../src/features/tutor/writingAid/visibleTime';
import {resolveTypeaheadArm, usesExpandedNgram, usesNeural, usesPersonalization, usesTutorBias} from '../../../src/features/tutor/writingAid/replayArm';
import {tutorHint, contextualWording, neuralAidPrompt, type AidRankingContext} from '../../../src/features/tutor/writingAid/answerAids';
import {countPersonalTransition, createAdaptation, learnedRank, learnSlateChoice, localCalibrationEstimate, observeLocalCalibration, parseAdaptation, personalContext} from '../../../src/features/tutor/writingAid/adaptation';
import {addAuthoredSpan, decodeAuthoredDraft, encodeAuthoredDraft, moveAcceptedSpans} from '../../../src/features/tutor/writingAid/authorship';
import {ghostBreakEven, ghostQualified, parseNeuralCalibration} from '../../../src/features/tutor/writingAid/calibration';
import {parseMixture} from '../../../src/features/tutor/writingAid/decoder/mixture';
import {historyIds, historyLog, historyLogTotal, historyNext, parseNgram, setNgramModel} from '../../../src/features/tutor/writingAid/decoder/kn';
import {decodeWord, mixtureProbability, prepareLanguage, setDecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';
import {isNeuralBoundary, neuralWordPrompt, promptIds, readNeuralTokenizer, wordTrie} from '../../../src/features/tutor/writingAid/decoder/neuralTokenizer';
import {insertionEligible} from '../../../src/features/tutor/writingAid/eligibility';
import {offerFamilies} from '../../../src/features/tutor/writingAid/offerFamilies';
import {selectWritingAidPool} from '../../../src/features/tutor/writingAid/poolRanking';
import {advanceWritingAidAnchor, applyWritingAidProposal, proposalEligible, writingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import type {TutorAcceptedSpan} from '../../../supabase/functions/_shared/tutor-answer';
import {padEdit} from '../../../src/features/pad/padEdit';
import {validAidRanking, type AidHint, type TutorAnswerAid} from '../../../supabase/functions/_shared/tutor-answer-aids';

const aid: TutorAnswerAid = {id: 'aid', turnId: 'turn', version: 1, level: 'scaffold', withhold: ['not all', 'finite subcover'],
  wording: ['With this notation,'], terms: [], symbols: []};
const scope: AidRankingContext = {before: 'Use the ', prefix: 'def', mode: 'prose', subject: 'topology', step: 'CP4:0'};
const hint: AidHint = {id: 'd', kind: 'word', entry: 'definition', priority: 'prefer', role: 'given'};

it('uses only validation-bound mixture and finite graph-bound calibration artifacts', () => {
  const mixture = {version: 1, captureVersion: 'n238-mixture-v1', status: 'validated', assetSha256: '1'.repeat(64),
    subjectAssetSha256: {topology: '2'.repeat(64)}, components: ['general', 'subject', 'question', 'draft', 'personal'],
    global: [.8, .05, .10, .05, 0], subjects: {}};
  expect(parseMixture(mixture)?.subjectAssetSha256.get('topology')).toBe('2'.repeat(64));
  expect(parseMixture({...mixture, status: 'fitted'})).toBeUndefined();
  expect(parseMixture({...mixture, subjectAssetSha256: {topology: 'unbound'}})).toBeUndefined();
  const row = {source: 'neural', outcome: 'exact', context: 'prefix', length: 'short', slope: 2, intercept: -1,
    count: 100, operatingPoint: .71, displayedPrecision: .73};
  const fitted = {version: 1, modelFingerprint: 'bundle', rows: [row]};
  expect(parseNeuralCalibration(fitted, 'bundle')).toEqual([row]);
  expect(parseNeuralCalibration(fitted, 'replaced')).toBeUndefined();
  expect(parseNeuralCalibration({...fitted, rows: [{...row, slope: -.1}]}, 'bundle')).toBeUndefined();
  expect(parseNeuralCalibration({...fitted, rows: [{...row, displayedPrecision: Infinity}]}, 'bundle')).toBeUndefined();
  expect(parseNeuralCalibration({...fitted, rows: [row, row]}, 'bundle')).toBeUndefined();
});

describe('normalized typeahead distributions', () => {
  it('corrects full-vocabulary quantization drift and ignores periods inside math', () => {
    const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v1/ngram.bin')));
    const history = historyIds(model, 'The causal ');
    expect(historyLogTotal(model, history)).toBeCloseTo(Math.log(1.078411), 5);
    const sum = model.words.reduce((total, _, id) => total + Math.exp(historyLog(model, id, history)), 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(historyIds(model, 'The $x. y$ ')).toEqual([model.id.get('the'), 1]);
    expect(historyIds(model, 'The. A 62 ')).toEqual([model.id.get('a'), 2]);
  });

  it('discounts every base outcome for a populated cache and uses all base mass for an empty cache', () => {
    const cache = {counts: new Map([['second', 1]]), total: 1};
    expect(mixtureProbability(.8, 'first', [{cache, weight: .1}])).toBeCloseTo(.72);
    expect(mixtureProbability(.2, 'second', [{cache, weight: .1}])).toBeCloseTo(.28);
    expect(mixtureProbability(.8, 'first', [{cache: {...cache, total: 0}, weight: .1}])).toBe(.8);
  });

  it('gives a fixed fraction of the unknown event to a rare typed lexicon word', () => {
    vi.stubEnv('VITE_FLAGS', 'typeaheadV2');
    const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v1/ngram.bin')));
    const name = 'tetrachromatogram';
    expect(model.id.has(name)).toBe(false);
    setNgramModel(model);
    setDecoderLexicon({version: 1, entries: [{word: name, frequency: 120}]});
    try {
      const language = prepareLanguage('Use ');
      expect(language.score(name)).toBeGreaterThan(-Infinity);
      expect(decodeWord('Use ', 'tetrachroma', 4).map(item => item.word)).toContain(name);
      const total = model.words.reduce((sum, word) => sum + Math.exp(language.score(word)), Math.exp(language.score(name)));
      expect(total).toBeCloseTo(1, 10);
    } finally {
      setNgramModel(null);
      setDecoderLexicon(null);
      vi.unstubAllEnvs();
    }
  });

  it('loads a fifth-order history and uses a lower-order row when it is absent', () => {
    // Built with scripts/typeahead/expanded/ngram.py encode(); the
    // order-5 row sets beta=.8 and backs off .25 of the remaining .8.
    const bytes = new Uint8Array(readFileSync('tests/fixtures/typeahead/fifth-order.bin'));
    const parsed = parseNgram(bytes);
    expect(historyNext(parsed, [5, 6, 5, 5])[0]).toBe(6);
    expect(Math.exp(historyLog(parsed, 6, [5, 6, 5, 5]))).toBeCloseTo(.8);
    expect(Math.exp(historyLog(parsed, 6, [5, 6, 6, 5]))).toBeCloseTo(.2);
    for (const ids of [[], [5], [6, 5], [6, 5, 5], [5, 6, 5, 5]]) {
      const mass = parsed.words.reduce((total, _, id) => total + Math.exp(historyLog(parsed, id, ids)), 0);
      expect(mass).toBeCloseTo(1, 6);
    }
    expect(() => parseNgram(bytes.slice(0, -1))).toThrow();
  });
});

describe('scoped guidance and exact insertion guard', () => {
  it('keeps X and x distinct in symbol identities, aliases and authored scope prefixes', () => {
    const ranking = {version: 1 as const, hints: [
      {id: 'set', kind: 'symbol', entry: 'X', aliases: ['\\Xi'], priority: 'prefer', role: 'given', scope: {prefixes: ['X']}},
      {id: 'point', kind: 'symbol', entry: 'x', aliases: ['\\xi'], priority: 'deemphasize', role: 'goal', scope: {prefixes: ['x']}},
    ] satisfies AidHint[]};
    const context: AidRankingContext = {...scope, mode: 'equation', before: '$', prefix: 'X', aid: {...aid, ranking}};
    expect(validAidRanking(ranking)).toBe(true);
    expect(tutorHint(context, 'X')).toMatchObject({role: 'given', adjustment: Math.log(2)});
    expect(tutorHint(context, '\\Xi').role).toBe('given');
    expect(tutorHint(context, 'x')).toEqual({adjustment: 0, role: undefined});
    expect(tutorHint({...context, prefix: 'x'}, 'X')).toEqual({adjustment: 0, role: undefined});
    expect(tutorHint({...context, prefix: 'x'}, '\\xi')).toMatchObject({role: 'goal', adjustment: -Math.log(2)});
    expect(insertionEligible({text: '$X', start: 1, end: 2, insert: 'X', mode: 'equation', authoredPrefix: 'X',
      role: 'given', aid: {...aid, ranking, withhold: ['x']}})).toBe(false);
  });

  it('promotes and demotes only an eligible matching entry with the narrowest cue', () => {
    const hints: AidHint[] = [
      hint, {...hint, scope: {prefixes: ['de']}},
      {...hint, priority: 'deemphasize', scope: {prefixes: ['def']}},
      {...hint, id: 'deformation', entry: 'deformation', priority: 'deemphasize', scope: {subject: 'topology'}},
    ];
    const context = {...scope, aid: {...aid, ranking: {version: 1, hints}}};
    expect(validAidRanking(context.aid.ranking)).toBe(true);
    expect(tutorHint(context, 'definition').adjustment).toBeCloseTo(-Math.log(2));
    expect(tutorHint({...context, prefix: 'de'}, 'definition').adjustment).toBeCloseTo(Math.log(2));
    expect(tutorHint({...context, subject: 'linear-algebra'}, 'deformation').adjustment).toBe(0);
    expect(tutorHint({...context, aid: {...aid, ranking: {version: 1, hints: [...hints,
      {...hint, scope: {prefixes: ['def']}}]}}}, 'definition').adjustment).toBe(0);
  });

  it('prioritizes matching scope axes over Unicode-expanded match lengths', () => {
    const prefix = 'ﬃ'.repeat(32);
    const phraseState = 'ﬃ'.repeat(80);
    const entry = prefix + 'definition';
    const wider: AidHint = {...hint, entry, priority: 'deemphasize', scope: {
      prefixes: [prefix], phraseStates: [phraseState],
    }};
    const narrower: AidHint = {...hint, entry, scope: {subject: 'topology', step: 'CP4:0', mode: 'prose'}};
    const context = {...scope, prefix, before: phraseState + ' '};
    for (const hints of [[wider, narrower], [narrower, wider]]) {
      const ranking = {version: 1 as const, hints};
      expect(validAidRanking(ranking)).toBe(true);
      expect(tutorHint({...context, aid: {...aid, ranking}}, entry).adjustment).toBe(Math.log(2));
    }
    const ranking = {version: 1 as const, hints: [wider, {...narrower,
      scope: {prefixes: [prefix.slice(1)], phraseStates: [phraseState]}}]};
    expect(validAidRanking(ranking)).toBe(true);
    expect(tutorHint({...context, aid: {...aid, ranking}}, entry).adjustment).toBe(-Math.log(2));
  });

  it('conditions neural prompts once per applicable canonical entry independently of priority', () => {
    const tokenizer = readNeuralTokenizer({version: 1, algorithm: 'utf8-bpe', byteOffset: 6,
      reserved: {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5}, merges: []});
    const term = 'noncommutativeintersections';
    const later = 'Pythagorean';
    const given: AidHint = {...hint, entry: term};
    const laterHint: AidHint = {...hint, id: 'later', entry: later};
    const duplicate: AidHint = {...given, entry: term.toUpperCase(), scope: {subject: 'topology', prefixes: ['def']}};
    function prompt(hints: AidHint[], terms: string[] = []) {
      const ranking = {version: 1 as const, hints};
      expect(validAidRanking(ranking)).toBe(true);
      return neuralAidPrompt({...scope, aid: {...aid, terms, ranking}}, true);
    }
    const first = prompt([given, laterHint]);
    const repeated = prompt([given, ...Array<AidHint>(30).fill(duplicate), laterHint], [term]);
    const ids = (aids: string) => promptIds(tokenizer, {question: 'What is given?', aids, draft: 'Given '}, 512);
    expect(repeated).toBe(`${term} ${later}`);
    expect(ids(repeated)).toEqual(ids(first));
    const encoded = ids(repeated);
    expect(encoded.slice(encoded.indexOf(4) + 1, encoded.indexOf(5)).map(id => tokenizer.piece(id)).join('')).toContain(later);
    for (const priority of ['prefer', 'neutral', 'deemphasize'] as const) {
      expect(prompt([{...given, priority}, laterHint])).toBe(first);
    }
  });

  it('retains case-sensitive neural symbol aids and filters inapplicable structured hints', () => {
    const symbols = ['X', 'x', '\\Xi', '\\xi'];
    const ranking = {version: 1 as const, hints: [
      ...symbols.map((entry, index): AidHint => ({...hint, id: `symbol-${index}`, kind: 'symbol', entry})),
      {...hint, id: 'outside-mode', entry: 'formula', scope: {mode: 'equation'}},
      {...hint, id: 'outside-step', entry: 'inverse', scope: {step: 'CP4:1'}},
      {...hint, id: 'outside-prefix', entry: 'intersection', scope: {prefixes: ['un']}},
      {...hint, id: 'outside-phrase', entry: 'solution', scope: {phraseStates: ['Use the']}},
      {...hint, id: 'goal', entry: 'theorem', role: 'goal'},
    ] satisfies AidHint[]};
    const context = {...scope, aid: {...aid, symbols: ['X', '\\Xi'], ranking}};
    expect(validAidRanking(ranking)).toBe(true);
    expect(neuralAidPrompt(context, true)).toBe('X \\Xi x \\xi');
    expect(neuralAidPrompt(context, false)).toBe('X \\Xi');
  });

  it('continues one punctuation-preserving phrase and retires it after completion', () => {
    expect(contextualWording({...scope, aid, before: 'With this ', prefix: ''})).toEqual([
      {phrase: 'With this notation,', text: 'notation,', progress: 2},
    ]);
    expect(contextualWording({...scope, aid, before: 'With this notation, ', prefix: ''})).toEqual([]);
  });

  it('continues only literal phrase punctuation and retires after its terminal period', () => {
    const phrase = 'By Dr. Euler, use this notation.';
    const phraseHint: AidHint = {...hint, kind: 'phrase', entry: phrase};
    const context: AidRankingContext = {...scope, prefix: '', before: '', aid: {
      ...aid, wording: [phrase], ranking: {version: 1, hints: [phraseHint]},
    }};
    expect(contextualWording({...context, before: 'The earlier sentence ended. By Dr. '})).toEqual([
      {phrase, text: 'Euler,', progress: 2},
    ]);
    expect(contextualWording({...context, before: 'The earlier sentence ended. Dr. '})).toEqual([]);
    expect(tutorHint({...context, before: 'The earlier sentence ended. Dr. '}, 'Euler,').adjustment).toBe(0);
    let before = '';
    let total = 0;
    for (const word of phrase.split(' ')) {
      total += tutorHint({...context, before}, word).adjustment;
      before += word + ' ';
    }
    expect(total).toBeCloseTo(Math.log(2));
    expect(tutorHint({...context, before}, 'By').adjustment).toBe(0);
    expect(tutorHint({...context, before}, phrase).adjustment).toBe(0);
    expect(contextualWording({...context, before, prefix: 'B'})).toEqual([]);

    const scoped: AidHint = {...hint, scope: {phraseStates: ['By Dr.', 'By Dr. Euler,']}};
    const scopedContext = {...context, aid: {...aid, ranking: {version: 1 as const, hints: [scoped]}}};
    expect(tutorHint({...scopedContext, before: 'An earlier result. By Dr. '}, 'definition').adjustment).toBeCloseTo(Math.log(2));
    expect(tutorHint({...scopedContext, before: 'An earlier result. By Dr. Euler, '}, 'definition').adjustment).toBeCloseTo(Math.log(2));
    expect(tutorHint({...scopedContext, before: 'An earlier result. Euler, '}, 'definition').adjustment).toBe(0);
    const plain = {...scoped, scope: {phraseStates: ['The given data']}};
    expect(tutorHint({...scopedContext, before: 'The given data. ',
      aid: {...aid, ranking: {version: 1, hints: [plain]}}}, 'definition').adjustment).toBe(0);
  });

  it('withholds phrases joined by insertion on either side and preserves mathematical choices', () => {
    const safe = (text: string, start: number, end: number, insert: string, authoredPrefix?: string) =>
      insertionEligible({text, start, end, insert, authoredPrefix, mode: 'prose', aid});
    expect(safe('This is NOT, ', 13, 13, 'all')).toBe(false);
    expect(safe('not al reach', 6, 6, 'l')).toBe(false);
    expect(safe('a subcover', 2, 2, 'finite-')).toBe(false);
    const farLeft = 'not' + ' '.repeat(180);
    expect(safe(farLeft, farLeft.length, farLeft.length, 'all')).toBe(false);
    expect(safe('.'.repeat(180) + 'all', 0, 0, 'not ')).toBe(false);
    expect(safe(farLeft + 'all. Therefore ', farLeft.length + 'all. Therefore '.length,
      farLeft.length + 'all. Therefore '.length, 'byhand')).toBe(true);
    expect(safe('Therefore f is ', 15, 15, 'surjective ')).toBe(false);
    expect(safe('Therefore f is surj', 15, 19, 'surjective ', 'surj')).toBe(true);
    expect(insertionEligible({text: '$x \\in ', start: 7, end: 7, insert: 'X', mode: 'equation'})).toBe(false);
  });

  it('keeps the suffix when an explicitly typed prefix is in the middle of a draft', () => {
    const earlier = padEdit('Use  again', 4), cursor = padEdit('Use nota again', 8);
    const anchor = advanceWritingAidAnchor(earlier, cursor, null, true);
    const request: WritingAidRequest = {anchor, cursor, middleEdits: true, mode: 'balanced',
      target: {scopeKey: 'account', mountId: 'editor', editorRevision: 1, selectionRevision: 1, modeRevision: 0}, composing: false, readOnly: false};
    const result = applyWritingAidProposal(request, writingAidProposal(request, 'word', 4, 8, 'notation'));
    expect(result).toMatchObject({text: 'Use notation again', start: 12, end: 12});
  });

  it('offers and applies a word completion near the start of a long draft', () => {
    const suffix = ', then continue. ' + 'The next line follows. '.repeat(55);
    const before = padEdit('Consider the not' + suffix, 'Consider the not'.length);
    const cursor = padEdit('Consider the nota' + suffix, 'Consider the nota'.length);
    const anchor = advanceWritingAidAnchor(before, cursor, null, true, []);
    const request: WritingAidRequest = {anchor, cursor, middleEdits: true, mode: 'balanced',
      target: {scopeKey: 'account', mountId: 'editor', editorRevision: 1, selectionRevision: 1, modeRevision: 0},
      composing: false, readOnly: false};
    const proposal = predictWritingAidPool(request).words.find(item => item.label === 'notation');
    expect(proposal).toMatchObject({start: 'Consider the '.length, end: cursor.end, insert: 'notation'});
    expect(applyWritingAidProposal(request, proposal!)).toEqual(
      padEdit('Consider the notation' + suffix, 'Consider the notation'.length));
  });

  it('reuses only the learner’s own current word when resuming a middle edit', () => {
    const earlier = padEdit('Use not again', 7), cursor = padEdit('Use nota again', 8);
    expect(advanceWritingAidAnchor(earlier, cursor, null, true, [])?.start).toBe(4);
    expect(advanceWritingAidAnchor(earlier, cursor, null, true, [{start: 0, end: 3}])?.start).toBe(4);
    expect(advanceWritingAidAnchor(earlier, cursor, null, true, [{start: 5, end: 6}])?.start).toBe(7);
    expect(advanceWritingAidAnchor(earlier, cursor, null, true)?.start).toBe(7);
    expect(advanceWritingAidAnchor(earlier, padEdit('Use not  again', 8), null, true, [])?.start).toBe(7);
    expect(advanceWritingAidAnchor(earlier, earlier, null, true, [])).toBeNull();
  });

  it('rejects stale versions and withholds changed proposals again at acceptance', () => {
    const cursor = padEdit('Use nota');
    const request: WritingAidRequest = {anchor: {text: cursor.text, start: 0}, cursor, mode: 'balanced', aid, contextKey: 'turn:1',
      target: {scopeKey: 'account', mountId: 'editor', editorRevision: 0, selectionRevision: 0, modeRevision: 0}, composing: false, readOnly: false};
    const proposal = writingAidProposal(request, 'word', 4, 8, 'notation ');
    expect(applyWritingAidProposal(request, proposal)?.text).toBe('Use notation ');
    expect(applyWritingAidProposal({...request, contextKey: 'turn:2'}, proposal)).toBeNull();
    expect(applyWritingAidProposal({...request, aid: {...aid, withhold: ['notation']}}, proposal)).toBeNull();
    const goal = {...aid, ranking: {version: 1 as const, hints: [{...hint, entry: 'homeomorphism', role: 'goal' as const}]}};
    const ghostCursor = padEdit('The ');
    const ghostRequest = {...request, cursor: ghostCursor, anchor: {text: ghostCursor.text, start: 0}, aid: goal};
    expect(proposalEligible(ghostRequest, writingAidProposal(ghostRequest, 'ghost', 4, 4, 'canonical homeomorphism '))).toBe(false);
  });
});

it('shares families only for offered regular inflections and explicitly declared aliases', () => {
  const independent = ['contract', 'contradiction', 'contrapositive', 'compact', 'compare'];
  const equivalent = ['function', 'functions', 'mapping'];
  const verbs = ['define', 'defines', 'defined', 'defining'];
  const words = [...independent, ...equivalent, ...verbs].map(label => ({label}));
  const symbols = ['X', 'x'].map(label => ({label, source: 'symbol' as const}));
  const cursor = padEdit('Use ');
  const request: WritingAidRequest = {cursor, subject: 'topology', mode: 'balanced', readOnly: false, composing: false,
    target: {scopeKey: 'scope', mountId: 'editor', editorRevision: 1, selectionRevision: 1, modeRevision: 0},
    aid: {...aid, ranking: {version: 1, hints: [{...hint, entry: 'function', aliases: ['mapping'], scope: {subject: 'topology'}}]}}};
  const proposals = (input: WritingAidRequest) => [...words, ...symbols].map(offer =>
    ({...writingAidProposal(input, 'word', cursor.end, cursor.end, offer.label), ...offer}));
  const family = offerFamilies(proposals(request));
  expect(new Set(independent.map(label => family({label}))).size).toBe(independent.length);
  expect(new Set(equivalent.map(label => family({label}))).size).toBe(1);
  expect(new Set(verbs.map(label => family({label}))).size).toBe(1);
  expect(family(symbols[0])).not.toBe(family(symbols[1]));
  const unrelated = offerFamilies(proposals({...request, subject: 'linear-algebra'}));
  expect(unrelated({label: 'function'})).not.toBe(unrelated({label: 'mapping'}));
  const order = ['function', 'mapping', 'functions', 'contract', 'contradiction', 'contrapositive'];
  const pool = proposals(request);
  const scored = order.map((label, index) => ({...pool.find(item => item.label === label)!, score: -index}));
  expect(selectWritingAidPool({words: scored, edit: [], ghost: []}).words.map(item => item.label))
    .toEqual(['function', 'contract', 'contradiction']);
});

it('encodes 512-token role prompts with recent draft and retaining math bytes', () => {
  const tokenizer = readNeuralTokenizer({version: 1, algorithm: 'utf8-bpe', byteOffset: 6,
    reserved: {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5}, merges: [[103, 104]]});
  expect(tokenizer.encode('ab α')).toEqual([262, 38, 212, 183]);
  expect(tokenizer.piece(262)).toBe('ab');
  const ids = promptIds(tokenizer, {question: 'q'.repeat(200), aids: 'x', draft: 'D'.repeat(600) + 'ab'}, 512);
  expect(ids).toHaveLength(512);
  expect(ids.slice(0, 2)).toEqual([1, 3]);
  expect(ids.at(-1)).toBe(262);
});

it('scores complete word extensions when typing changes the BPE representation', () => {
  const tokenizer = readNeuralTokenizer({version: 1, algorithm: 'utf8-bpe', byteOffset: 6,
    reserved: {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5}, merges: [[106, 107], [262, 108]]});
  const candidates = ['definition', 'deformation', 'non-Archimedean', 'Évariste'];
  for (const [prefix, word] of [['de', 'definition'], ['defi', 'definition'], ['non-Arch', 'non-Archimedean'], ['Éva', 'Évariste']]) {
    expect(neuralWordPrompt({question: '', aids: '', draft: 'Use ' + prefix}, prefix).draft).toBe('Use ');
    const trie = wordTrie(tokenizer, candidates, prefix, 32);
    const node = tokenizer.encode(word).reduce((branch, token) => branch.edges.get(token)!, trie);
    expect(node.words).toContain(word);
  }
  expect(tokenizer.encode('de')).toEqual([262]);
  expect(tokenizer.encode('definition')[0]).toBe(263);
});

it('learns only from displayed choice pairs and shrinks a local transition toward zero', () => {
  const adaptation = createAdaptation();
  const winner = {kind: 'word', label: 'context', insert: 'context ', before: 'con', source: 'bank', score: -3} as const;
  const loser = {...winner, label: 'constant', source: 'decoder'} as const;
  learnSlateChoice(adaptation, winner as never, [loser as never]);
  expect(adaptation.observations).toBe(0);
  learnSlateChoice(adaptation, winner as never, [winner as never, loser as never]);
  expect(learnedRank(adaptation, winner as never)).toBeGreaterThan(learnedRank(adaptation, loser as never));
  expect(personalContext(adaptation, 'there is ', 'topology')).toBeUndefined();
  countPersonalTransition(adaptation, 'is', 'continuous', 'topology');
  expect(personalContext(parseAdaptation(adaptation), 'there is ', 'topology')?.weight).toBeCloseTo(.4 / 31);
});

it('retains only unchanged insertion spans and never shows unqualified ghost output', () => {
  expect(moveAcceptedSpans('A value', 'A new value', [{start: 2, end: 7, text: 'value', source: 'word'}]))
    .toEqual([{start: 6, end: 11, text: 'value', source: 'word'}]);
  expect(moveAcceptedSpans('x x', 'x x x', [{start: 2, end: 3, text: 'x', source: 'symbol'}],
    {start: 0, end: 0, nextEnd: 2})).toEqual([{start: 4, end: 5, text: 'x', source: 'symbol'}]);
  expect(moveAcceptedSpans('A value', 'A veil', [{start: 2, end: 7, text: 'value', source: 'word'}]))
    .toEqual([{start: 2, end: 3, text: 'v', source: 'word'}]);
  expect(moveAcceptedSpans('A value', 'A other', [{start: 2, end: 7, text: 'value', source: 'word'}])).toEqual([]);
  expect(moveAcceptedSpans('a 🚀math b', 'a 🚀Math b', [{start: 2, end: 8, text: '🚀math', source: 'word'}])).toEqual([
    {start: 2, end: 4, text: '🚀', source: 'word'}, {start: 5, end: 8, text: 'ath', source: 'word'},
  ]);
  expect(ghostBreakEven(12)).toBeCloseTo(.2316, 4);
  expect(ghostQualified([], 100, 17, 'boundary', 1)).toBe(false);
});


it('round-trips a legacy or tagged draft without dropping the oldest provenance at capacity', () => {
  const text = 'x '.repeat(33);
  const spans: TutorAcceptedSpan[] = Array.from({length: 32}, (_, index) =>
    ({start: 2 * index, end: 2 * index + 1, text: 'x', source: 'word'}));
  const stored = encodeAuthoredDraft(text, spans);
  expect(decodeAuthoredDraft(stored)).toEqual({text, spans});
  expect(decodeAuthoredDraft('legacy text')).toEqual({text: 'legacy text', spans: []});
  expect(addAuthoredSpan(text, spans, {start: 64, end: 65, text: 'x', source: 'word'})).toBeNull();
  expect(spans[0]).toEqual({start: 0, end: 1, text: 'x', source: 'word'});
  expect(addAuthoredSpan('notes', [{start: 0, end: 2, text: 'no', source: 'word'}],
    {start: 2, end: 5, text: 'tes', source: 'word'})).toEqual([{start: 0, end: 5, text: 'notes', source: 'word'}]);
});


it('isolates model arms only in tools-enabled builds', () => {
  expect(resolveTypeaheadArm('?typeahead-arm=corrected-v1', false)).toBe('personal');
  expect(resolveTypeaheadArm('?typeahead-arm=tutor', true)).toBe('tutor');
  expect(usesExpandedNgram('corrected-v1')).toBe(false);
  expect(usesNeural('expanded-kn')).toBe(false);
  expect(usesTutorBias('neural')).toBe(false);
  expect(usesPersonalization('tutor')).toBe(false);
});


it('counts actual shown intervals across changing prefixes and skips zero-duration alternatives', () => {
  const first = {kind: 'word', start: 4, insert: 'notation ', before: 'no', label: 'notation'} as const;
  const next = {...first, before: 'nota'};
  const tracker = visibleTime();
  const key = exposureIdentity(first as never);
  expect(exposureIdentity(next as never)).toBe(key);
  tracker.update('words', [key], 10);
  tracker.update('words', [key], 50);
  tracker.hide(100);
  expect(tracker.elapsed('words', key, 200)).toBe(90);
  tracker.update('words', [key], 230);
  expect(tracker.elapsed('words', key, 270)).toBe(130);
  const alternative = {...first, insert: 'note ', label: 'note'};
  const personalized = createAdaptation();
  learnSlateChoice(personalized, first as never, [first as never, alternative as never], () => 0);
  expect(personalized.observations).toBe(0);
});


it('conservatively retains a split range if partial editing would exceed the span cap', () => {
  const previous = 'word ' + 'x '.repeat(31);
  const spans: TutorAcceptedSpan[] = [{start: 0, end: 4, text: 'word', source: 'neural'},
    ...Array.from({length: 31}, (_, i): TutorAcceptedSpan => ({start: 5 + 2 * i, end: 6 + 2 * i, text: 'x', source: 'word'}))];
  const next = 'ward ' + 'x '.repeat(31);
  const retained = moveAcceptedSpans(previous, next, spans);
  expect(retained).toHaveLength(32);
  expect(retained[0]).toEqual({start: 0, end: 4, text: 'ward', source: 'neural'});
  expect(decodeAuthoredDraft(encodeAuthoredDraft(next, retained)).spans).toHaveLength(32);
});


it('offers and applies named Unicode question words through the normal writing pipeline', () => {
  vi.stubEnv('VITE_FLAGS', 'typeaheadV2');
  const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v1/ngram.bin')));
  setNgramModel(model);
  setDecoderLexicon({version: 1, entries: [{word: 'use', frequency: 160}]});
  try {
    for (const [prefix, target] of [['Éva', 'Évariste'], ['non‑Arch', 'non‑Archimedean']]) {
      const cursor = padEdit('Use ' + prefix);
      const request: WritingAidRequest = {cursor, anchor: {text: cursor.text, start: 0}, mode: 'balanced',
        question: ['Explain Évariste and non‑Archimedean reasoning.'],
        target: {scopeKey: 'account', mountId: 'editor', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
        composing: false, readOnly: false};
      const offer = predictWritingAidPool(request).words.find(item => item.label === target);
      expect(offer, 'missing completion for ' + prefix).toBeDefined();
      expect(offer?.score).toBeGreaterThan(-Infinity);
      expect(offer && applyWritingAidProposal(request, offer)?.text).toBe('Use ' + target + ' ');
    }
  } finally {
    setDecoderLexicon(null);
    setNgramModel(null);
    vi.unstubAllEnvs();
  }
});


it('keeps whitespace merge pieces as complete word boundaries', () => {
  const tokenizer = readNeuralTokenizer({version: 1, algorithm: 'utf8-bpe', byteOffset: 6,
    reserved: {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5}, merges: [[38, 38], [16, 16]]});
  for (const piece of ['  ', '\n\n']) {
    const [id] = tokenizer.encode(piece);
    expect(isNeuralBoundary(id, tokenizer.piece(id))).toBe(true);
  }
  expect(isNeuralBoundary(2, '')).toBe(true);
  expect(isNeuralBoundary(51, '-')).toBe(false);
  expect(isNeuralBoundary(45, "'")).toBe(false);
});

it('keeps local exact, displayed acceptance, and conditional retention separate', () => {
  const adaptation = createAdaptation();
  const proposal = {kind: 'word', source: 'neural', before: 'not', insert: 'notation ', label: 'notation'} as const;
  observeLocalCalibration(adaptation, proposal as never, 'exact', true);
  observeLocalCalibration(adaptation, proposal as never, 'accept', false);
  expect(localCalibrationEstimate(adaptation, proposal as never, 'exact', .5)).toBeGreaterThan(.5);
  expect(localCalibrationEstimate(adaptation, proposal as never, 'accept', .5)).toBeLessThan(.5);
  expect(localCalibrationEstimate(adaptation, proposal as never, 'retain', .5)).toBe(.5);
});

it('ranks the known ambient set in the actual menu candidate pool and cannot select a witness', () => {
  const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v1/ngram.bin')));
  vi.stubEnv('VITE_FLAGS', 'typeaheadV2');
  setNgramModel(model);
  setDecoderLexicon({version: 1, entries: [{word: 'set', frequency: 120}]});
  try {
    const cursor = padEdit('U is open in ');
    const request: WritingAidRequest = {cursor, anchor: {text: cursor.text, start: 0}, mode: 'balanced',
      question: ['Consider X and Y with U open.'],
      target: {scopeKey: 'account', mountId: 'editor', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
      composing: false, readOnly: false};
    const scores = (role: 'set' | 'unknown') => {
      const active: TutorAnswerAid = {...aid, ranking: {version: 1, declaredSymbols: [{symbol: 'U', role, ambient: 'Y'}]}};
      return new Map(predictWritingAidPool({...request, aid: active}).words.map(offer => [offer.label, offer.score!]));
    };
    expect(scores('set').get('Y')).toBeGreaterThan(scores('set').get('X')!);
    expect(scores('unknown').get('X')).toBeGreaterThan(scores('unknown').get('Y')!);
    const witness = padEdit('Let ');
    expect(predictWritingAidPool({...request, question: ['Choose a witness X or Y'],
      cursor: witness, anchor: {text: witness.text, start: 0}}).words.some(item => item.source === 'symbol')).toBe(false);
  } finally {
    setNgramModel(null);
    setDecoderLexicon(null);
    vi.unstubAllEnvs();
  }
});


it('selects only a qualified cold backend and accounts for both WebGPU runtimes', () => {
  const manifest: NeuralManifest = {version: 2, kind: 'neural', context: 512, layers: 8, heads: 8, headDim: 64, vocabSize: 16384,
    files: {tokenizer: {path:'tokenizer.json', bytes:200_000, sha256:'a'.repeat(64)},
      prefill: {path:'prefill.onnx', bytes:100_000, sha256:'b'.repeat(64)},
      incremental: {path:'incremental.onnx', bytes:100_000, sha256:'c'.repeat(64)},
      weights:{path:'weights.bin', bytes:19_470_000, sha256:'d'.repeat(64)}},
    qualification:{parity:true,replay:true,webgpu:true,webgpuJspi:true,wasm:false}};
  expect(neuralFitsColdBudget(manifest, 'neural-v2', 'webgpuJspi')).toBe(true);
  expect(neuralFitsColdBudget(manifest, 'neural-v2', 'webgpu')).toBe(false);
  expect(selectNeuralBackend(manifest, 'neural-v2', true, true, false)).toBe('webgpuJspi');
  expect(selectNeuralBackend(manifest, 'neural-v2', true, false, false)).toBeUndefined();
  expect(selectNeuralBackend(manifest, 'neural-v2', true, false, true)).toBe('webgpu');
  const pending = {...manifest, qualification: {parity: true}};
  expect(selectNeuralBackend(pending, 'neural-v2', true, true, true, true)).toBe('webgpuJspi');
  expect(selectNeuralBackend(pending, 'neural-v2', true, false, true, true)).toBe('wasm');
  const oversized = {...pending, files: {...pending.files, weights: {...pending.files.weights!, bytes: 28_000_000}}};
  expect(selectNeuralBackend(oversized, 'neural-v2', true, true, true, true)).toBeUndefined();
  expect(selectNeuralBackend({...manifest, qualification: {parity:false}}, 'neural-v2', true, true, true, true)).toBeUndefined();
  expect(selectNeuralBackend({...manifest,qualification:{parity:true}}, 'neural-v2', true, true, false)).toBeUndefined();
});

it('charges equal bytes at distinct URLs and rejects incompatible claims for one path', () => {
  const tokenizer = {path: 'tokens.json', bytes: 1_000, sha256: 'a'.repeat(64)};
  const prefill = {path: 'prefill.onnx', bytes: 15_000_000, sha256: 'b'.repeat(64)};
  const files = {tokenizer, prefill, incremental: {...prefill, path: 'incremental.onnx'}};
  expect(neuralFileBytes(files)).toBe(30_001_000);
  expect(neuralFileBytes({...files, incremental: prefill})).toBe(15_001_000);
  expect(neuralFileBytes({...files, incremental: {...prefill, bytes: 2}})).toBeUndefined();
  expect(neuralFileBytes({...files, incremental: {...prefill, sha256: 'c'.repeat(64)}})).toBeUndefined();
  const manifest: NeuralManifest = {version: 2, kind: 'neural', context: 512, layers: 8, heads: 8, headDim: 64, vocabSize: 16384, files};
  expect(neuralFitsColdBudget(manifest, 'neural-v2', 'wasm')).toBe(false);
  expect(neuralFitsColdBudget({...manifest, files: {...files, incremental: prefill}}, 'neural-v2', 'wasm')).toBe(true);
});
