import {describe, expect, it} from 'vitest';
import {FLAG_DEFAULTS} from '../../../src/flags';
import {padEdit} from '../../../src/features/pad/padEdit';
import {
  predictWritingAidPool, selectWritingAidPool, writingDecoderPrefix,
} from '../../../src/features/tutor/writingAid/engine';
import {
  createDecoderLexicon, parseDecoderLexicon, searchDecoderLexicon, type DecoderCandidate,
} from '../../../src/features/tutor/writingAid/decoder/lexicon';
import {
  applyWritingAidProposal, type WritingAidMode, type WritingAidRequest,
} from '../../../src/features/tutor/writingAid/policy';
import lexiconAsset from '../../../public/models/writing-decoder/unigram-v1/lexicon.json';
import replayFixtures from '../../../docs/implementation/2026-11-22/ngram-spatial-decoder/replay/fixtures.json';

const index = createDecoderLexicon(parseDecoderLexicon(lexiconAsset));
const labels = (pool: ReturnType<typeof predictWritingAidPool>) => pool.words.map(proposal => proposal.label);
const displayed = (pool: ReturnType<typeof predictWritingAidPool>) => selectWritingAidPool(pool).words.map(proposal => proposal.label);
function request(text: string, overrides: Partial<WritingAidRequest> = {}): WritingAidRequest {
  return {cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false,
    target: {scopeKey: 'owner:checkpoint', mountId: 'policy-test', editorRevision: 1, selectionRevision: 1, modeRevision: 1},
    ...overrides};
}
function expanded(input: WritingAidRequest) {
  const prefix = writingDecoderPrefix(input);
  return predictWritingAidPool(input, undefined, prefix ? searchDecoderLexicon(index, prefix) : []);
}

describe('decoder integration with the existing writing policy', () => {
  it('keeps the default-off engine path and the existing short-stem ranking', () => {
    expect(FLAG_DEFAULTS.writingDecoder).toBe(false);
    const baselineCases = [
      [request('I think the re', {mode: 'fast'}), ['result', 'relation', 'respectively']],
      [request('We discuss the nota'), ['notation', 'notary']],
      [request('I am reco'), ['recoin', 'recomb', 'recon']],
      [request('The denomina', {mode: 'strict'}), ['denominator']],
    ] as const;
    for (const [input, expected] of baselineCases) {
      const baseline = predictWritingAidPool(input);
      expect(displayed(baseline)).toEqual(expected);
      expect(predictWritingAidPool(input, undefined, undefined)).toEqual(baseline);
      expect(predictWritingAidPool(input, undefined, [])).toEqual(baseline);
    }
    for (const mode of ['balanced', 'fast', 'strict'] as const) {
      const input = request('I think the re', {mode});
      expect(writingDecoderPrefix(input)).toBeNull();
      // Even a valid late reply for this old short prefix has no permission to change its lane.
      expect(predictWritingAidPool(input, undefined, searchDecoderLexicon(index, 're'))).toEqual(predictWritingAidPool(input));
    }
  });

  it('offers a real asset completion only after explicit typing and acceptance', () => {
    const input = request('I am reco');
    const before = JSON.stringify(input);
    expect(displayed(predictWritingAidPool(input))).not.toContain('record');
    const pool = expanded(input);
    expect(displayed(pool)).toContain('record');
    const proposal = pool.words.find(item => item.label === 'record')!;
    expect(proposal).toMatchObject({kind: 'word', before: 'reco', insert: 'record ', start: 5, end: 9});
    expect(applyWritingAidProposal(input, proposal)).toEqual(padEdit('I am record '));
    expect(JSON.stringify(input)).toBe(before);
    for (const stale of [
      {...input, cursor: padEdit('I am recom')},
      {...input, target: {...input.target, editorRevision: 2}},
      {...input, target: {...input.target, scopeKey: 'other-owner:checkpoint'}},
      {...input, anchor: null},
    ]) expect(applyWritingAidProposal(stale, proposal)).toBeNull();
  });

  it('preserves capitalization and leaves Strict and other suggestion surfaces unchanged', () => {
    for (const [text, expected] of [['Reco', 'Record'], ['RECO', 'RECORD']] as const) {
      expect(displayed(expanded(request(text)))).toContain(expected);
    }
    for (const text of ['x <= y', 'We wrote teh here.', 'could you restate', 'The denomina']) {
      const input = request(text);
      const baseline = predictWritingAidPool(input), next = expanded(input);
      expect(next.edit).toEqual(baseline.edit);
      expect(next.ghost).toEqual(baseline.ghost);
      const strict = request(text, {mode: 'strict'});
      expect(writingDecoderPrefix(strict)).toBeNull();
      expect(expanded(strict)).toEqual(predictWritingAidPool(strict));
    }
  });

  it('retains known logic tags at the asset-to-policy boundary', () => {
    for (const [text, prefix, word] of [
      ['The value is nonneg', 'nonneg', 'nonnegative'],
      ['The value is nonpos', 'nonpos', 'nonpositive'],
    ] as const) {
      const candidates = searchDecoderLexicon(index, prefix);
      expect(candidates.find(item => item.word === word)?.riskTags).toEqual(['logic']);
      for (const mode of ['balanced', 'fast'] as const) {
        expect(labels(predictWritingAidPool(request(text, {mode}), undefined, candidates))).not.toContain(word);
      }
    }
  });

  it.each([
    ['I state unl', 'unless'],
    ['I state non', 'none'],
  ] as const)('rechecks the known logical word when a worker omits its tag: %s', (text, word) => {
    const input = request(text, {mode: 'fast'});
    const source = index.entries.find(item => item.word === word)!;
    expect(source.riskTags).toEqual(['logic']);
    expect(labels(predictWritingAidPool(input))).not.toContain(word);
    // JSON transport can still be well-formed after accidentally dropping optional
    // metadata. The main policy must not treat that omission as learner permission.
    for (const candidates of [[{word, frequency: source.frequency}],
      [{word, frequency: source.frequency, riskTags: []}]] as readonly (readonly DecoderCandidate[])[]) {
      expect(labels(predictWritingAidPool(input, undefined, candidates))).not.toContain(word);
    }
  });

  it('filters weak proof-family completions found by the real asset, including old pool gaps', () => {
    const probes = [
      {text: 'I use ind', prefix: 'ind', present: 'independence', blocked: ['induction', 'inductive', 'independence', 'independently']},
      {text: 'I use contra', prefix: 'contra', present: 'contradictory', blocked: ['contradiction', 'contradictory', 'contradicted', 'contradict', 'contradictions']},
      {text: 'I use bij', prefix: 'bij', present: 'bijection', blocked: ['bijection', 'bijective']},
      {text: 'The function is cont', prefix: 'cont', present: 'continuity', blocked: ['continuous', 'continuity', 'continuously']},
    ];
    for (const probe of probes) {
      const candidates = searchDecoderLexicon(index, probe.prefix);
      expect(candidates.map(item => item.word), probe.text).toContain(probe.present);
      const input = request(probe.text, {mode: 'fast'});
      const next = labels(predictWritingAidPool(input, undefined, candidates));
      for (const word of probe.blocked) expect(next, probe.text).not.toContain(word);
    }
    // The comparison remains honest: the original path still exposes this known
    // gap, while enabling the expanded vocabulary applies the stronger guard.
    expect(labels(predictWritingAidPool(request('The function is cont', {mode: 'fast'})))).toContain('continuity');
  });

  it('guards future untagged inflections without needing those words in the shipped asset', () => {
    // Adversarial worker candidates, separate from the real-asset replay and its metrics.
    const probes = [
      ['I use induct', 'inductively'],
      ['I use counter', 'counterexamples'],
      ['I use bijec', 'bijectively'],
      ['The property is indep', 'independents'],
    ] as const;
    for (const [text, word] of probes) {
      const input = request(text, {mode: 'fast'});
      const candidates: DecoderCandidate[] = [{word, frequency: 100}];
      expect(labels(predictWritingAidPool(input, undefined, candidates)), text).not.toContain(word);
    }
  });

  it.each([
    ['abel', 'abelian', 'abelia'],
    ['irre', 'irreducible', 'irreducib'],
    ['homog', 'homogeneous', 'homogeneo'],
    ['trian', 'triangular', 'triangula'],
    ['transc', 'transcendental', 'transcendenta'],
    ['projec', 'projective', 'projectiv'],
    ['hyper', 'hyperbolic', 'hyperbol'],
  ] as const)('requires strong visible spelling for a newly admitted property: %s → %s', (weak, word, strong) => {
    const candidates = searchDecoderLexicon(index, weak, 64);
    expect(candidates.map(candidate => candidate.word)).toContain(word);
    for (const mode of ['balanced', 'fast'] as const) {
      const input = request('I state ' + weak, {mode});
      expect(labels(predictWritingAidPool(input)), mode).not.toContain(word);
      expect(labels(predictWritingAidPool(input, undefined, candidates)), mode).not.toContain(word);
      const typed = request('I state ' + strong, {mode});
      expect(labels(predictWritingAidPool(typed, undefined, searchDecoderLexicon(index, strong, 64))), mode).toContain(word);
    }
  });

  it('allows the learner to finish strongly typed proof words', () => {
    for (const [text, intended] of [
      ['We use inductio', 'induction'],
      ['The property is continuit', 'continuity'],
      ['This is contradictor', 'contradictory'],
    ] as const) {
      const input = request(text, {mode: 'fast'});
      expect(labels(expanded(input)), text).toContain(intended);
    }
  });

  it('falls back when worker metadata is malformed instead of widening permission', () => {
    const input = request('I am reco');
    const baseline = predictWritingAidPool(input);
    const malformed = [
      [{word: 'record', frequency: Number.NaN}],
      [{word: 'record', frequency: -1}],
      [{word: 'record', frequency: 100, riskTags: ['unknown']}],
      [{word: 'contradiction', frequency: 100}],
    ];
    for (const candidates of malformed) {
      expect(predictWritingAidPool(input, undefined, candidates as DecoderCandidate[])).toEqual(baseline);
    }
  });
});

interface SafetyFixture {
  id: string;
  text: string;
  modes?: WritingAidMode[];
  expect?: string;
  forbidden?: string[];
  anchor?: string;
  anchorStart?: number;
  composing?: boolean;
  readOnly?: boolean;
  caret?: number;
  surfacesOff?: boolean;
}
const safetyCases = (replayFixtures.safetyCases as SafetyFixture[]).flatMap(row =>
  (row.modes ?? ['balanced', 'fast', 'strict'] as const).map(mode => ({...row, mode, caseId: `${row.id}/${mode}`})));
describe('frozen fresh replay safety requests through the real lexicon', () => {
  it.each(safetyCases)('$caseId', row => {
    const input = request(row.text, {
      mode: row.mode,
      cursor: padEdit(row.text, row.caret ?? row.text.length),
      anchor: row.anchor === 'none' ? null : {text: row.text, start: row.anchorStart ?? 0},
      composing: row.composing ?? false, readOnly: row.readOnly ?? false,
      ...(row.surfacesOff ? {surfaces: {words: false, replace: false, correction: false, ghost: false}} : {}),
    });
    const baseline = predictWritingAidPool(input), next = expanded(input);
    expect(next.edit).toEqual(baseline.edit);
    expect(next.ghost).toEqual(baseline.ghost);
    if (row.expect === 'empty') expect(next).toEqual({words: [], edit: [], ghost: []});
    if (row.expect === 'emptyWords') expect(next.words).toEqual([]);
    if (row.expect === 'neutralWords') {
      const neutral = new Set(['a', 'an', 'the', 'i', 'we', 'of', 'to', 'in', 'for', 'with', 'at', 'as', 'on', 'from']);
      expect(next.words.every(proposal => neutral.has(proposal.label.toLowerCase()))).toBe(true);
    }
    for (const word of row.forbidden ?? []) expect(labels(next)).not.toContain(word);
  });
});
