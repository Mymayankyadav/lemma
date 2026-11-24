import {describe, expect, it} from 'vitest';
import {applyEquationOrigins, equationFences, equationOrigins} from '../../../src/features/tutor/writingAid/equationAuthorship';
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
});
