import {describe, expect, it} from 'vitest';
import {
  PAD_SLOT, PAD_SYMBOLS, applyPadSuggestion, changePadText, createPadTextHistory, deletePadBackward, insertPadSymbol, insertPadTemplate,
  insertPadText, movePadCaret, nextPadSlot, padEdit, padSuggestions, redoPadText, scanPad, undoPadText,
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

  it('deletes and navigates whole graphemes while preserving native selection offsets', () => {
    const text = 'a📐e\u0301b';
    expect(deletePadBackward(padEdit(text, 5))).toEqual(padEdit('a📐b', 3));
    expect(deletePadBackward(padEdit(text, 1, 3))).toEqual(padEdit('ae\u0301b', 1));
    expect(movePadCaret(padEdit(text, 5), 'left')).toEqual(padEdit(text, 3));
    expect(movePadCaret(padEdit(text, 3), 'right')).toEqual(padEdit(text, 5));
    expect(movePadCaret(padEdit(text, 1, 5), 'left')).toEqual(padEdit(text, 1));
    expect(movePadCaret(padEdit(text, 1, 5), 'right')).toEqual(padEdit(text, 5));
    expect(movePadCaret(padEdit('one\ntwo\nthree', 6), 'home').start).toBe(4);
    expect(movePadCaret(padEdit('one\ntwo\nthree', 5), 'end').start).toBe(7);
    expect(movePadCaret(padEdit('\nx', 0), 'home').start).toBe(0);
    expect(deletePadBackward(padEdit('', 0))).toEqual(padEdit(''));
  });

  it('wraps selected expressions in exponent and bracket templates and fills numbers without extra text', () => {
    const exponent = insertPadTemplate(padEdit('$x$', 1, 2), 'Exponent');
    expect(exponent.text).toBe('${x}^{' + PAD_SLOT + '}$');
    expect(exponent.text.slice(exponent.start, exponent.end)).toBe(PAD_SLOT);
    expect(insertPadSymbol(exponent, {glyph:'2',tex:'2',label:'2'}).text).toBe('${x}^{2}$');
    expect(insertPadTemplate(padEdit('x+y', 0, 3), 'Brackets').text).toBe('\\(\\left[x+y\\right]\\)');
    expect(insertPadTemplate(padEdit('x^2', 0, 3), 'Definite integral').text)
      .toBe('\\(\\int_{' + PAD_SLOT + '}^{' + PAD_SLOT + '}{x^2}\\,d{' + PAD_SLOT + '}\\)');
    expect(insertPadText(padEdit('ac', 1), '\nb')).toEqual(padEdit('a\nbc', 3));
  });

  it('expands imported interior carets and partial selections to whole graphemes before Backspace', () => {
    for (const text of ['a📐b', 'ae\u0301b']) {
      expect(deletePadBackward(padEdit(text, 2))).toEqual(padEdit('ab', 1));
      expect(deletePadBackward(padEdit(text, 1, 2))).toEqual(padEdit('ab', 1));
      expect(deletePadBackward(padEdit(text, 2, 3))).toEqual(padEdit('ab', 1));
      expect(deletePadBackward(padEdit(text, 0))).toEqual(padEdit(text, 0));
    }
    expect(deletePadBackward(padEdit('a📐e\u0301b', 2, 4))).toEqual(padEdit('ab', 1));
  });

  it('collapses partial selections to whole grapheme edges with the arrow keys', () => {
    for (const text of ['a📐b', 'ae\u0301b']) {
      expect(movePadCaret(padEdit(text, 2, 3), 'left')).toEqual(padEdit(text, 1));
      expect(movePadCaret(padEdit(text, 1, 2, 'backward'), 'right')).toEqual(padEdit(text, 3));
      expect(movePadCaret(padEdit(text, 1, 3), 'left')).toEqual(padEdit(text, 1));
      expect(movePadCaret(padEdit(text, 1, 3), 'right')).toEqual(padEdit(text, 3));
    }
  });

  it('undoes text with its original selection, retains redo across navigation and bounds history memory', () => {
    let history = createPadTextHistory(padEdit('x', 0, 1));
    history = changePadText(history, insertPadTemplate(history.present, 'Fraction'));
    const inserted = history.present;
    history = undoPadText(history);
    expect(history.present).toEqual(padEdit('x', 0, 1));
    history = changePadText(history, padEdit('x', 1));
    expect(history.future).toHaveLength(1);
    history = redoPadText(history);
    expect(history.present).toEqual(inserted);
    history = undoPadText(history);
    history = changePadText(history, padEdit('new edit'));
    expect(history.future).toEqual([]);
    for (let i = 0; i < 80; i++) history = changePadText(history, padEdit('x'.repeat(65000) + i));
    expect(history.past.length).toBeLessThanOrEqual(50);
    expect(history.past.reduce((sum, edit) => sum + edit.text.length, 0)).toBeLessThanOrEqual(262144);
    const newest = history.present;
    history = undoPadText(undoPadText(history));
    history = redoPadText(redoPadText(history));
    expect(history.present).toEqual(newest);
  });
});
