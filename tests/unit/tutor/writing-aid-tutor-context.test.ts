import {describe, expect, it} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {predictWritingAidPool, selectWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {applyWritingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import {normalizeTutorWritingContext, tutorWritingContextFingerprint, type TutorWritingContext, type TutorWritingRole} from '../../../src/features/tutor/writingAid/tutorContext';

function context(text: string, role: TutorWritingRole = 'suggested-wording', extras: Record<string, unknown> = {}): TutorWritingContext {
  return normalizeTutorWritingContext({version: 1, revision: 'r1', signals: [{id: 's1', role, text, ...extras}]}, 'reply-1')!;
}
function request(text: string, tutorContext?: TutorWritingContext | null): WritingAidRequest {
  return {cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false,
    target: {scopeKey: 'owner:checkpoint', mountId: 'one', editorRevision: 1, selectionRevision: 1, modeRevision: 1}, tutorContext};
}
const sourced = (input: WritingAidRequest) => predictWritingAidPool(input).ghost.filter(item => item.tutorEvidence);

describe('bounded tutor writing context', () => {
  it('binds signal sources to the app reply and rejects malformed, mixed and oversized context', () => {
    const raw = {version: 1, revision: 'r', signals: [{id: 's', sourceId: 'forged', role: 'given', text: 'The original wording is here.'}]};
    expect(normalizeTutorWritingContext(raw, 'actual-reply')?.signals[0].sourceId).toBe('actual-reply');
    expect(normalizeTutorWritingContext({...raw, signals: [{...raw.signals[0], role: 'invented'}]}, 'actual-reply')).toBeNull();
    expect(normalizeTutorWritingContext({...raw, signals: [{...raw.signals[0], text: 'a'.repeat(241)}]}, 'actual-reply')).toBeNull();
    expect(normalizeTutorWritingContext({...raw, signals: Array(13).fill(raw.signals[0])}, 'actual-reply')).toBeNull();
    expect(normalizeTutorWritingContext({...raw, signals: [{...raw.signals[0], variables: ['x'.repeat(33)]}]}, 'actual-reply')).toBeNull();
    expect(normalizeTutorWritingContext({...raw, signals: [raw.signals[0], {...raw.signals[0], id: 'other', sourceId: 'elsewhere'}]})).toBeNull();
  });

  it('offers a bounded neutral exact-prefix continuation with app-bound provenance', () => {
    const source = context('The question asks about the original wording');
    const input = request('The question asks about the', source);
    const candidate = sourced(input)[0];
    expect(candidate.insert).toBe(' original wording');
    expect(candidate.tutorEvidence).toMatchObject({sourceId: 'reply-1', signalId: 's1', role: 'suggested-wording',
      learnerStart: 0, learnerEnd: input.cursor.end, matchedCharacters: input.cursor.end, maxOutputWords: 6, maxOutputCharacters: 64});
    expect(applyWritingAidProposal(input, candidate)?.text).toBe('The question asks about the original wording');
    expect(predictWritingAidPool(input, undefined, {wording: false}).ghost.some(item => item.tutorEvidence)).toBe(false);
    expect(sourced(request('The question', source))).toEqual([]);
    expect(sourced(request('The question asks about THE', source))).toEqual([]);
  });

  it('rejects proof steps, mislabeled branches and previously unseen mathematical methods', () => {
    const examples = [
      ['We can apply', 'We can apply the triangle inequality'],
      ['We can apply', 'We can apply the pigeonhole principle'],
      ['The next step', 'The next step uses a counting argument'],
      ['We may now use', 'We may now use the frobenius maneuver'],
      ['The question asks about the', 'The question asks about the pigeonhole principle'],
      ['The question asks about the', 'The question asks about the unknown branch'],
      ['The question is', 'The question is a counterexample'],
      ['The question asks about the', 'The question asks about the variable x'],
    ] as const;
    for (const [prefix, source] of examples) {
      for (const role of ['given', 'suggested-wording', 'hint', 'proof', 'solution', 'unknown'] as const) {
        expect(sourced(request(prefix, context(source, role))), `${role}: ${source}`).toEqual([]);
      }
    }
    expect(sourced(request('The question asks about the', context('The question asks about the original wording', 'proof')))).toEqual([]);
    const method = context('The next step uses a frobnicating argument', 'given');
    expect(predictWritingAidPool(request('frobnicatin', method)).words.some(item => item.label === 'frobnicating')).toBe(false);
  });

  it('uses strongly typed tutor vocabulary only after learner evidence for a declared variable', () => {
    const source = context('zetavariable', 'given', {variables: ['zetavariable']});
    const novel = predictWritingAidPool(request('zetavariabl', source));
    expect(novel.words.some(item => item.label === 'zetavariable')).toBe(false);
    const typed = request('zetavariable zetavariabl', source);
    const candidate = predictWritingAidPool(typed).words.find(item => item.label === 'zetavariable');
    expect(candidate?.label).toBe('zetavariable');
    const tutorTerm = request('metaphrasingz', context('metaphrasingzz', 'given'));
    expect(predictWritingAidPool(tutorTerm).words.find(item => item.label === 'metaphrasingzz')?.tutorEvidence)
      .toMatchObject({sourceId: 'reply-1', signalId: 's1'});
    expect(predictWritingAidPool(tutorTerm, undefined, {terms: false}).words.some(item => item.tutorEvidence)).toBe(false);
  });

  it('can prioritize an eligible exact notation edit and invalidates old context even if a caller mutates it', () => {
    const source = context('The symbol ≤ is in the wording.', 'given', {symbols: ['≤']});
    const input = request('x <= y and z >= w', source);
    const pool = predictWritingAidPool(input);
    expect(pool.edit.length).toBeGreaterThan(1);
    expect(selectWritingAidPool(pool).edit?.insert).toBe('≤');
    expect(selectWritingAidPool(pool, undefined, undefined, Date.now(), {symbols: false}).edit?.insert).toBe('≥');
    const old = tutorWritingContextFingerprint(source);
    const offer = pool.edit.find(item => item.insert === '≤')!;
    (source.signals[0] as {text: string}).text = 'A different current tutor message.';
    expect(tutorWritingContextFingerprint(source)).not.toBe(old);
    expect(applyWritingAidProposal(input, offer)).toBeNull();
  });
});
