import {describe, expect, it} from 'vitest';
import {
  PAD_SLOT, PAD_SYMBOLS, applyPadSuggestion, insertPadSymbol, insertPadTemplate,
  nextPadSlot, padEdit, padSuggestions, scanPad,
} from '../../../src/features/pad/padEdit';

describe('Local Pad editing', () => {
  it('uses native UTF-16 offsets and safely clamps restored selection', () => {
    const edit = padEdit('a📐b', 3, 1, 'backward');
    expect(edit).toEqual({text: 'a📐b', start: 1, end: 3, direction: 'backward'});
    expect(insertPadSymbol(edit, PAD_SYMBOLS[0])).toEqual(padEdit('a∀b', 2));
    expect(padEdit('abc', -5, Infinity)).toEqual(padEdit('abc', 0, 3));
  });

  it('keeps escapes, supports four TeX delimiter pairs, and exposes unfinished input literally', () => {
    const segments = scanPad('Pay \\$2; $x$ $$y$$ \\(z\\) \\[w\\] $unfinished');
    expect(segments[0]).toEqual({kind: 'text', source: 'Pay \\$2; '});
    expect(segments.filter(s => s.kind === 'math').map(s => [s.tex, s.display]))
      .toEqual([['x', false], ['y', true], ['z', false], ['w', true]]);
    expect(segments.at(-1)).toEqual({kind: 'unfinished', source: '$unfinished'});
  });

  it('fills the first template slot with selected math and advances through explicit slots', () => {
    const edit = insertPadTemplate(padEdit('value: x+1', 7, 10), 'Fraction');
    expect(edit.text).toBe('value: \\(\\frac{x+1}{' + PAD_SLOT + '}\\)');
    expect(edit.text.slice(edit.start, edit.end)).toBe(PAD_SLOT);
    const matrix = insertPadTemplate(padEdit('$x$', 1, 2), '2 × 2 matrix');
    expect(matrix.text.startsWith('$\\begin{pmatrix}x&')).toBe(true);
    expect(matrix.text.endsWith('\\end{pmatrix}$')).toBe(true);
    const secondSlot = nextPadSlot(matrix)!;
    expect(secondSlot.start).toBeGreaterThan(matrix.end);
    expect(secondSlot.text.slice(secondSlot.start, secondSlot.end)).toBe(PAD_SLOT);
    expect(nextPadSlot(padEdit('no slots'))).toBeNull();
  });

  it('offers deterministic completions only at a TeX command boundary and replaces just that prefix', () => {
    const edit = padEdit('$\\sq + 1$', 4);
    const suggestions = padSuggestions(edit);
    expect(suggestions).toEqual([{command: '\\sqrt', start: 1}]);
    expect(applyPadSuggestion(edit, suggestions[0]).text).toBe('$\\sqrt  + 1$');
    expect(padSuggestions(padEdit('a \\sq'))).toEqual([]);
    expect(padSuggestions(padEdit('$\\sqr$', 4))).toEqual([]);
    expect(padSuggestions(padEdit('$\\sq$', 1, 4))).toEqual([]);
  });
});
