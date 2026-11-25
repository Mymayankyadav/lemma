import {describe, expect, it} from 'vitest';
import {activeSymbolDeclarations, declaredOperand, latexAllows, latexCommandPrefix,
  latexIdentifierWeights, latexState, latexSuggestions, latexTokens, unfinishedMath} from '../../../src/features/tutor/writingAid/latexGrammar';
import type {DeclaredSymbol} from '../../../supabase/functions/_shared/tutor-answer-aids';

const parse = (math: string) => latexState(latexTokens(math));

describe('LaTeX continuations', () => {
  it('allocates the identifier class mass once across two or three eligible symbols', () => {
    for (const count of [2, 3]) {
      const classLog = Math.log(.17);
      const allocated = latexIdentifierWeights(count).map(weight => Math.exp(classLog + Math.log(weight)));
      expect(allocated.reduce((sum, mass) => sum + mass, 0)).toBeCloseTo(.17, 12);
      expect(allocated[0]).toBeGreaterThan(allocated[1]);
    }
  });

  it('tracks optional root indices and nested mandatory fraction arguments', () => {
    const content = "\\sqrt[\\frac{1}{2}]{\\frac{\\left(x\\right)}";
    expect(parse(content)).toMatchObject({pending: 1, command: '\\frac', malformed: false, stack: ['{']});
    expect(latexAllows(parse(content), '}')).toBe(false);
    expect(latexAllows(parse(content), '{')).toBe(true);
    expect(parse(content + '{2}}')).toMatchObject({pending: 0, malformed: false, stack: []});
    expect(latexAllows(parse("\\sqrt"), '[')).toBe(true);
    expect(latexAllows(parse("\\sqrt[3]"), '[')).toBe(false);
  });

  it('checks cells and row widths in nested matrix bodies', () => {
    const first = "\\begin{matrix}a&\\begin{pmatrix}b&c\\end{pmatrix}\\\\";
    const state = parse(first + 'x');
    expect(state.environment).toMatchObject({name: 'matrix', columns: 1, expectedColumns: 2});
    expect(latexAllows(state, '&')).toBe(true);
    expect(latexAllows(state, '\\\\')).toBe(false);
    expect(latexAllows(state, '\\end')).toBe(false);
    expect(latexAllows(parse(first + 'x&y'), '&')).toBe(false);
    expect(parse(first + "x&y\\end{matrix}")).toMatchObject({malformed: false, stack: []});
    expect(parse(first + "x&y\\end{pmatrix}").malformed).toBe(true);
    expect(latexAllows(parse("\\begin{matrix}\\frac{x"), '&')).toBe(false);
    expect(latexAllows(parse("\\begin{matrix}x&"), '&')).toBe(false);
  });

  it('completes structural templates at an incomplete or middle edit without duplicating closers', () => {
    const open = "\\begin{mat";
    const matrix = latexSuggestions(open, '', '')[0];
    expect(matrix).toMatchObject({label: '{matrix}', insert: "rix}\\end{matrix}", caret: 4});
    const tail = open + matrix.insert.slice(0, matrix.caret) + 'x' + matrix.insert.slice(matrix.caret);
    expect(parse(tail)).toMatchObject({malformed: false, stack: []});
    expect(latexSuggestions("\\frac", '', '', 3, {after: '}'}).at(0)).toMatchObject({insert: '{', caret: 1});
    expect(latexSuggestions("\\begin{matrix}x\\end{mat", '', '').at(0)).toMatchObject({insert: 'rix}'});
    expect(latexSuggestions("\\begin{matrix}x\\end{pm", '', '')).toEqual([]);
    expect(latexCommandPrefix("x+\\frac")).toBe('');
    expect(unfinishedMath({text: "a $\\fr$", start: 6, end: 6})).toMatchObject({math: "\\fr", typed: "\\fr", start: 3});
  });

  it('tracks nested declarations and only boosts a typed given relation', () => {
    const declarations: DeclaredSymbol[] = [
      {symbol: 'U', role: 'set', ambient: 'Y'}, {symbol: 'f', role: 'map', domain: 'X', codomain: 'Y'},
      {symbol: 'x', role: 'bound', ambient: 'U', binder: {id: 'outer'}},
      {symbol: 'x', role: 'bound', ambient: 'X', binder: {id: 'inner', parent: 'outer'}},
    ];
    expect(declaredOperand("U \\subseteq ", declarations)).toBe('Y');
    expect(declaredOperand("f:X\\to", declarations)).toBe('Y');
    expect(declaredOperand("f:Y\\to", declarations)).toBeUndefined();
    expect(declaredOperand("(\\forall x\\in", declarations)).toBe('U');
    expect(declaredOperand("(\\forall x \\in U, (\\exists x \\in", declarations)).toBe('X');
    expect(declaredOperand("(\\forall x \\in U, (\\exists x \\in X) x\\in", declarations)).toBe('U');
    expect(declaredOperand("(\\forall x \\in U) x\\in", declarations)).toBeUndefined();
    expect(declaredOperand("(\\forall x_1∈", [
      {symbol: 'x_1', role: 'bound', ambient: 'Α', binder: {id: 'indexed'}},
    ])).toBe('Α');
    expect(activeSymbolDeclarations('', [
      {symbol: 'U', role: 'set', ambient: 'Y'}, {symbol: 'U', role: 'set', ambient: 'X'},
    ])).toEqual([{symbol: 'U', role: 'unknown'}]);
  });

  it('bounds the replacement to the incomplete command at the caret', () => {
    expect(unfinishedMath({text: 'Given $\\alpha + x$.', start: 10, end: 10})).toMatchObject({
      math: '\\al', typed: '\\al', start: 7, end: 13,
    });
    expect(unfinishedMath({text: 'Given $\\sqrt{x}$.', start: 12, end: 12})).toMatchObject({
      math: '\\sqrt', typed: '', start: 12, end: 12,
    });
    const before = String.raw`$$\\begin{matrix}x\\\\al`;
    expect(unfinishedMath({text: before + String.raw`pha\\end{matrix}$$`, start: before.length, end: before.length})).toMatchObject({
      typed: '', start: before.length, end: before.length,
    });
  });

  it('keeps a set and point with distinct case separate in ambient and map relations', () => {
    const declarations: DeclaredSymbol[] = [
      {symbol: 'X', role: 'set', ambient: 'U'}, {symbol: 'x', role: 'unknown'},
      {symbol: 'F', role: 'map', domain: 'X', codomain: 'Y'}, {symbol: 'f', role: 'map', domain: 'x', codomain: 'y'},
    ];
    expect(declaredOperand('X \\subseteq', declarations)).toBe('U');
    expect(declaredOperand('x \\in', declarations)).toBeUndefined();
    expect(declaredOperand('F:X\\to', declarations)).toBe('Y');
    expect(declaredOperand('F:x\\to', declarations)).toBeUndefined();
    expect(declaredOperand('f:x\\to', declarations)).toBe('y');
  });
});
