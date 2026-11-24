import {describe, expect, it} from 'vitest';
import {answerAidIssues, readAnswerAid, validAidRanking, type AidHint} from '../../../supabase/functions/_shared/tutor-answer-aids';
import {imageReference, readTutorAcceptedSpans, tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';
import {insertionEligible} from '../../../src/features/tutor/writingAid/eligibility';

const id = '00000000-0000-0000-0000-000000000001';
const legacy = {id, turnId: id, level: 'light', wording: [], terms: [], symbols: [], withhold: ['not all'], version: 2};
const hint: AidHint = {id: 'e', entry: 'Évariste', aliases: ['Évariste‐Galois'], kind: 'word', priority: 'prefer',
  role: 'given', scope: {subject: 'algebra', step: '1', prefixes: ['Év']}};

describe('versioned tutor answer aids', () => {
  it('keeps existing guards when aid ranking is absent or has an unknown version', () => {
    expect(readAnswerAid(legacy)).toEqual(legacy);
    expect(readAnswerAid({...legacy, ranking: {version: 2}})).toEqual(legacy);
    const aid = readAnswerAid({...legacy, terms: 42});
    expect(aid).toMatchObject({level: 'none', withhold: ['not all']});
    expect(insertionEligible({text: 'not ', start: 4, end: 4, insert: 'all', mode: 'equation', aid})).toBe(false);
    const malformed = readAnswerAid({...legacy, withhold: null});
    expect(malformed?.guardsUnavailable).toBe(true);
    expect(insertionEligible({text: '', start: 0, end: 0, insert: 'term', mode: 'prose', aid: malformed})).toBe(false);
  });

  it('validates Unicode spelling, stable IDs, aliases, and turn scope', () => {
    const ranking = {version: 1, hints: [hint, {...hint, priority: 'neutral', scope: {mode: 'equation'}}]};
    expect(answerAidIssues({ranking})).toEqual([]);
    expect(validAidRanking({...ranking, hints: [hint, {...hint, id: 'copy', entry: 'E\u0301variste'}]})).toBe(false);
    expect(validAidRanking({...ranking, hints: [hint, {...hint, id: 'other', entry: 'Euler'}]})).toBe(false);
    expect(validAidRanking({...ranking, hints: [hint, {...hint, scope: {turnId: id}}]})).toBe(false);
    expect(validAidRanking({...ranking, hints: [hint, {...hint, scope: {prefixes: ['e\n']}}]})).toBe(false);
  });

  it('accepts parented binders and rejects unknown parents or cycles', () => {
    const outer = {symbol: 'x', role: 'bound', binder: {id: 'a'}};
    const inner = {symbol: 'x', role: 'bound', binder: {id: 'b', parent: 'a'}};
    expect(validAidRanking({version: 1, declaredSymbols: [outer, inner]})).toBe(true);
    expect(validAidRanking({version: 1, declaredSymbols: [inner]})).toBe(false);
    expect(validAidRanking({version: 1, declaredSymbols: [{...outer, binder: {id: 'a', parent: 'b'}}, inner]})).toBe(false);
  });
});

describe('answer provenance', () => {
  it('round-trips exact UTF-16 spans with inline attachments and clears edited or undone spans', () => {
    const text = '𝒰 is ' + imageReference(id) + ' given';
    const span = {start: 3, end: 5, text: 'is', source: 'phrase', aidId: id, aidVersion: 2};
    expect(tutorAnswerParts(text, [id], [span])).toEqual([
      {type: 'text', text: '𝒰 '}, {type: 'text', text: 'is', accepted: {source: 'phrase', aidId: id, aidVersion: 2}},
      {type: 'text', text: ' '}, {type: 'image', id}, {type: 'text', text: ' given'},
    ]);
    expect(readTutorAcceptedSpans(text.replace('is', 'as'), [span])).toEqual([]);
    expect(readTutorAcceptedSpans('𝒰', [{...span, start: 0, end: 1, text: '𝒰'[0]}])).toEqual([]);
    expect(readTutorAcceptedSpans(text, [span, {...span, start: 7, end: 12, text: text.slice(7, 12)}])).toEqual([]);
    expect(tutorAnswerParts(text.replace('is ', ''), [id], [])).not.toContainEqual(expect.objectContaining({accepted: expect.anything()}));
  });
});
