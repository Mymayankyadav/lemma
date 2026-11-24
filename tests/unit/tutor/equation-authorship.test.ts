import {describe, expect, it} from 'vitest';
import {applyEquationOrigins, equationFences, equationOrigins, planEquationSuggestion} from '../../../src/features/tutor/writingAid/equationAuthorship';
import {moveAcceptedSpans} from '../../../src/features/tutor/writingAid/authorship';
import type {TutorAcceptedSpan} from '../../../supabase/functions/_shared/tutor-answer';

describe('equation provenance', () => {
  const source = '$x+y$';
  const prefix = '𝒰. Given ';
  const text = prefix + source + '.';
  const original: TutorAcceptedSpan[] = [{start: prefix.length, end: prefix.length + source.length, text: source, source: 'equation'}];

  it('keeps old origins around an edited operand and through reopening', () => {
    const {inside, outsideCount} = equationOrigins(text, original, source, prefix.length);
    expect(inside).toEqual([{start: 0, end: 3, text: 'x+y', source: 'equation'}]);
    expect(outsideCount).toBe(2);
    const edited = 'x+z', updated = prefix + '$' + edited + '$.';
    const retained = moveAcceptedSpans('x+y', edited, inside);
    const saved = applyEquationOrigins(text, updated, original, source, prefix.length, edited, retained)!;
    expect(saved.map(item => item.text)).toEqual(['$x+', '$']);
    expect(equationOrigins(updated, saved, '$x+z$', prefix.length).inside.map(item => item.text)).toEqual(['x+']);
  });

  it('keeps exact alternate delimiters and removes only the old formula when deleted', () => {
    expect(equationFences('\\(x+y\\)')).toEqual({width: 2, opening: '\\(', closing: '\\)', tex: 'x+y'});
    expect(applyEquationOrigins(text, prefix + '.', original, source, prefix.length, '', [])).toEqual([]);
  });

  it('rejects an assisted edit that needs an extra retained origin while manual edits can still split a span', () => {
    const spans: TutorAcceptedSpan[] = [{start: 0, end: 2, text: 'xy', source: 'symbol'}];
    const surviving: TutorAcceptedSpan[] = [
      {start: 0, end: 1, text: 'x', source: 'symbol'},
      {start: 2, end: 3, text: 'y', source: 'symbol'},
    ];
    expect(planEquationSuggestion('xy', 1, 1, 'z', spans, 2)).toBeNull();
    expect(moveAcceptedSpans('xy', 'xzy', spans, undefined, 2)).toEqual(surviving);
    expect(planEquationSuggestion('xy', 1, 1, 'z', spans, 3)).toEqual({text: 'xzy', spans: [
      surviving[0], {start: 1, end: 2, text: 'z', source: 'equation'}, surviving[1],
    ]});
    expect(planEquationSuggestion('xy', 1, 1, 'z', [{...spans[0], source: 'equation'}], 2)).toEqual({text: 'xzy', spans: [
      {start: 0, end: 3, text: 'xzy', source: 'equation'},
    ]});
  });
});
