import {afterEach, describe, expect, test} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {latexSymbolOptions} from '../../../src/features/tutor/input/latexShortcuts';
import {setTapCorrectionWords} from '../../../src/features/tutor/tapCorrection';

// N221 (Owner task): symbol suggestions from LaTeX commands and short forms, by dictionary and fuzzy matching.
const glyphs = (text: string) => latexSymbolOptions(padEdit(text)).map(option => option.symbol.glyph);
const kind = (text: string) => latexSymbolOptions(padEdit(text))[0]?.kind;

afterEach(() => setTapCorrectionWords(null));

describe('LaTeX symbol suggestions', () => {
  test('a command being typed offers its symbols: exact, then common prefixes, then near misses', () => {
    expect(glyphs('Let \\alpha')[0]).toBe('α');
    expect(glyphs('Let \\al')[0]).toBe('α');
    expect(glyphs('x \\in')[0]).toBe('∈');
    expect(glyphs('Take \\aplha')).toContain('α');
    expect(glyphs('\\lamda')).toContain('λ');
    expect(glyphs('\\Gamma')[0]).toBe('Γ');
    expect(kind('x \\le')).toBe('command');
    expect(glyphs('x \\le')[0]).toBe('≤');
    expect(glyphs('then \\subsete')[0]).toBe('⊆');
  });

  test('ASCII short forms offer their symbols, only on their own', () => {
    expect(glyphs('f: A ->')[0]).toBe('→');
    expect(glyphs('x <=')[0]).toBe('≤');
    expect(glyphs('p <=>')).toEqual(['⇔']);
    expect(glyphs('p =>')[0]).toBe('⇒');
    expect(glyphs('a !=')).toEqual(['≠']);
    expect(glyphs('x ~~')).toEqual(['≈']);
    expect(glyphs('in RR')).toEqual(['ℝ']);
    expect(glyphs('ERR')).toEqual([]);
    expect(glyphs('x^2')).toEqual(['²']);
    expect(kind('x <=')).toBe('short');
  });

  test('a bare name typed in full sits beside the words, with its variants and capital', () => {
    expect(glyphs('Let lambda')[0]).toBe('λ');
    expect(kind('Let lambda')).toBe('name');
    expect(glyphs('for all epsilon')).toEqual(['ε', 'ϵ']);
    expect(glyphs('Let gamma')).toEqual(['γ', 'Γ']);
    expect(glyphs('Gamma')[0]).toBe('Γ');
    expect(glyphs('the forall')[0]).toBe('∀');
    // Ordinary English words never become symbols without a backslash.
    for (const word of ['x in', 'go to', 'the sum', 'a cup', 'partial']) expect(glyphs(word)).toEqual([]);
  });

  test('a near-miss name is offered only when it cannot be the start of an English word', () => {
    setTapCorrectionWords(['theory', 'therapy', 'lambda']);
    expect(glyphs('let lamda')).toContain('λ');
    expect(glyphs('let thera')).toEqual([]);
  });

  test('replaces exactly the typed short form, only at a collapsed caret', () => {
    const [option] = latexSymbolOptions(padEdit('Let \\alp'));
    expect(option).toMatchObject({token: '\\alp', start: 4, end: 8});
    expect(latexSymbolOptions(padEdit('Let \\alp', 0, 8))).toEqual([]);
  });

  test('replaces the complete command when the caret is inside it', () => {
    const [option] = latexSymbolOptions(padEdit('$\\alpha + x$', '$\\al'.length));
    expect(option).toMatchObject({symbol: {glyph: 'α'}, token: '\\al', start: 1, end: '$\\alpha'.length});
  });
});
