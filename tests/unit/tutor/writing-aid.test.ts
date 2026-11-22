import {describe, expect, it} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {predictWritingAid} from '../../../src/features/tutor/writingAid/engine';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, advanceWritingAidAnchor, applyWritingAidProposal,
  continueWritingAidAnchor, type WritingAidRequest,
} from '../../../src/features/tutor/writingAid/policy';

function request(text: string, overrides: Partial<WritingAidRequest> = {}): WritingAidRequest {
  return {
    cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false,
    target: {scopeKey: 'owner:checkpoint', mountId: 'one', editorRevision: 1, selectionRevision: 1, modeRevision: 1},
    ...overrides,
  };
}

describe('local writing aid', () => {
  it('separates visible notation and spelling edits from optional word and statement continuations', () => {
    const cases = [
      ['x <= y', 'replace', '<=', '≤', 'x ≤ y'],
      ['We wrote teh here.', 'correction', 'teh', 'the', 'We wrote the here.'],
    ] as const;
    for (const [text, kind, before, insert, after] of cases) {
      const input = request(text);
      const {edit} = predictWritingAid(input);
      expect(edit).toMatchObject({kind, before, insert});
      expect(applyWritingAidProposal(input, edit!)).toEqual(padEdit(after));
      expect(input.cursor.text).toBe(text);
    }

    const word = request('nota');
    const {words} = predictWritingAid(word);
    expect(words.map(item => item.label)).toContain('notation');
    expect(applyWritingAidProposal(word, words.find(item => item.label === 'notation')!)).toEqual(padEdit('notation '));
    expect(predictWritingAid(request('preima')).words.map(item => item.label)).toContain('preimage');

    const statement = request('could you restate');
    const {ghost} = predictWritingAid(statement);
    expect(ghost).toMatchObject({kind: 'ghost', before: '', insert: ' the question', start: 17, end: 17});
    expect(applyWritingAidProposal(statement, ghost!)).toEqual(padEdit('could you restate the question'));
  });

  it('applies independent surface preferences and restricts each mode', () => {
    const suppressed = {words: false, replace: false, correction: false, ghost: false};
    for (const text of ['nota', 'teh', 'x <= y', 'could you restate']) {
      expect(predictWritingAid(request(text, {surfaces: suppressed}))).toEqual(NO_WRITING_AID);
      expect(predictWritingAid(request(text, {mode: 'off'}))).toEqual(NO_WRITING_AID);
    }
    expect(predictWritingAid(request('teh and x <= y', {
      surfaces: {...ALL_WRITING_AID_SURFACES, replace: false},
    })).edit?.kind).toBe('correction');
    expect(predictWritingAid(request('x <= y', {mode: 'strict'})).edit?.insert).toBe('≤');
    expect(predictWritingAid(request('denomina', {mode: 'strict'})).words.map(item => item.label)).toEqual(['denominator']);
    expect(predictWritingAid(request('could you restate', {mode: 'strict'})).ghost).toBeNull();
    expect(predictWritingAid(request('proof ', {mode: 'strict'})).words).toEqual([]);
    expect(predictWritingAid(request('I think the re')).words).toEqual([]);
    expect(predictWritingAid(request('I think the re', {mode: 'fast'})).words.map(item => item.label)).toEqual([
      'result', 'relation', 'respectively',
    ]);
    expect(predictWritingAid(request('constructor ')).words.map(item => item.label)).toEqual(['the', 'a', 'an']);
  });

  it('leaves proof choices and mistakes alone in both predictive modes', () => {
    for (const mode of ['balanced', 'fast', 'strict'] as const) {
      for (const text of ['by ', 'We prove this by ind', 'if ', 'if', '∀ ', 'x ∈ ', 'Let X and Y be sets. Take a in ',
        'p ≥ q. In words, ', 'Every integer is positive.', 'The matrix is invertible because ']) {
        const {words, ghost, edit} = predictWritingAid(request(text, {mode}));
        expect(words, text).toEqual([]);
        expect(ghost, text).toBeNull();
        expect(edit, text).toBeNull();
      }
    }
    expect(predictWritingAid(request('Let x')).ghost?.insert).toBe(' be ');
  });

  it('keeps the original typed anchor through one neutral next-word tap', () => {
    const before = padEdit('not');
    const authored = padEdit('nota');
    const anchor = advanceWritingAidAnchor(before, authored, {text: before.text, start: 0});
    const input = request(authored.text, {anchor});
    const chosen = predictWritingAid(input).words.find(item => item.label === 'notation')!;
    const applied = applyWritingAidProposal(input, chosen)!;
    const nextAnchor = continueWritingAidAnchor(anchor, chosen, applied)!;
    expect(nextAnchor).toEqual({text: 'nota', start: 0, continuation: 'notation '});
    const next = request(applied.text, {anchor: nextAnchor});
    const {words, ghost, edit} = predictWritingAid(next);
    expect(words.length).toBeGreaterThan(0);
    expect(words.every(item => item.start === applied.end && item.end === applied.end && /^(the|a|an)$/u.test(item.label))).toBe(true);
    expect(ghost).toBeNull();
    expect(edit).toBeNull();
    expect(continueWritingAidAnchor(nextAnchor, words[0], applyWritingAidProposal(next, words[0])!)).toBeNull();

    expect(advanceWritingAidAnchor(applied, padEdit(applied.text + '.'), nextAnchor)).toBeNull();
    const manufactured = advanceWritingAidAnchor(applied, padEdit(applied.text + 'c'), nextAnchor);
    expect(manufactured).toMatchObject({start: applied.text.length});
    expect(predictWritingAid(request('chosen response', {anchor}))).toEqual(NO_WRITING_AID);
  });

  it('never treats restored, quoted, pasted or accepted text as a new author source', () => {
    for (const text of ['teh', 'Tutor: teh', '"teh', '‘teh', '```\nteh', '$teh', 'could you restate']) {
      const pasted = !/[:`"'‘$]/u.test(text);
      const anchor = pasted ? null : {text, start: 0};
      expect(predictWritingAid(request(text, {anchor})), text).toEqual(NO_WRITING_AID);
    }
    const restored = padEdit('teh ');
    const authored = padEdit('teh nota');
    const anchor = advanceWritingAidAnchor(restored, authored, null);
    expect(anchor?.start).toBe(restored.end);
    const result = predictWritingAid(request(authored.text, {anchor}));
    expect(result.edit).toBeNull();
    expect(result.words[0]?.label).toBe('notation');
    expect(advanceWritingAidAnchor(padEdit('notes', 2), padEdit('new notes'), null)).toBeNull();
  });

  it('rejects stale and ineligible offers after selection, composition, mode or owner changes', () => {
    const input = request('x <= y');
    const edit = predictWritingAid(input).edit!;
    const changed: Partial<WritingAidRequest>[] = [
      {cursor: padEdit('x <= y', 1)},
      {cursor: padEdit('x <= y', 0, 3)},
      {cursor: padEdit('x <= z')},
      {target: {...input.target, scopeKey: 'other-owner:checkpoint'}},
      {target: {...input.target, mountId: 'new-composer'}},
      {target: {...input.target, editorRevision: 2}},
      {target: {...input.target, selectionRevision: 2}},
      {target: {...input.target, modeRevision: 2}},
      {composing: true}, {readOnly: true}, {anchor: null}, {mode: 'fast'},
      {surfaces: {...ALL_WRITING_AID_SURFACES, replace: false}},
    ];
    for (const overrides of changed) expect(applyWritingAidProposal({...input, ...overrides}, edit)).toBeNull();
    for (const overrides of changed.slice(0, 3)) expect(predictWritingAid({...input, ...overrides})).toEqual(NO_WRITING_AID);
    expect(predictWritingAid(request(' '.repeat(2000) + 'teh'))).toEqual(NO_WRITING_AID);
  });
});
