import {describe, expect, test} from 'vitest';
import {
  applyAutoEquation, autoEquation, equationReadings, equationStart, equationSuggestions, questionVariables,
} from '../../../src/features/tutor/input/autoEquation';

// N222 (Owner task): equation mode turns typed maths into symbols as each piece is finished.
/** Type `text` one character at a time, converting as equation mode does. */
function type(text: string): string {
  let draft = '';
  for (const char of text) {
    draft += char;
    const change = autoEquation(draft, draft.length);
    if (change) draft = applyAutoEquation(draft, draft.length, change).text;
  }
  return draft;
}

describe('auto-equation', () => {
  test('roots, powers and indices', () => {
    expect(type('root 2 ')).toBe('√2 ');
    expect(type('sqrt(2) ')).toBe('√2 ');
    expect(type('sqrt(x+1) ')).toBe('√(x+1) ');
    expect(type('square root of x ')).toBe('√x ');
    expect(type('cube root 8 ')).toBe('∛8 ');
    expect(type('x^2+1')).toBe('x²+1');
    expect(type('x^{-1} ')).toBe('x⁻¹ ');
    expect(type('(a+b)^n ')).toBe('(a+b)ⁿ ');
    expect(type('x squared ')).toBe('x² ');
    expect(type('a_n ')).toBe('aₙ ');
    // A variable with a digit is ambiguous and never changed by itself.
    expect(type('x1 + x2 ')).toBe('x1 + x2 ');
  });

  test('operators, fractions, names and number sets', () => {
    expect(type('x<=y')).toBe('x≤y');
    expect(type('a != b')).toBe('a ≠ b');
    expect(type('f: A -> B')).toBe('f: A → B');
    expect(type('p => q ')).toBe('p ⇒ q ');
    expect(type('1, 2, ..., n')).toBe('1, 2, …, n');
    expect(type('2*3')).toBe('2·3');
    expect(type('x = 1/2 ')).toBe('x = ½ ');
    expect(type('alpha + beta ')).toBe('α + β ');
    expect(type('pi theta sigma epsilon phi ')).toBe('π θ σ ε φ ');
    expect(type('x in RR ')).toBe('x ∈ ℝ ');
    expect(type('n to infinity ')).toBe('n → ∞ ');
  });

  test('leaves ordinary words, unfinished pieces and LaTeX-like text alone', () => {
    expect(type('let x be such that ')).toBe('let x be such that ');
    expect(type('since')).toBe('since');
    expect(type('x^2')).toBe('x^2');
    expect(type('2x1 ')).toBe('2x1 ');
    expect(type('<<= ')).toBe('<<= ');
  });
});

describe('ambiguous equations', () => {
  const labels = (text: string) => equationReadings(text, text.length).map(item => item.label);
  test('x2+y2=1 offers the quadratic and the linear reading, likelier first', () => {
    expect(labels('x2+y2=1')).toEqual(['x²+y²=1', 'x₂+y₂=1']);
    expect(labels('a2 + b2 = c2')).toEqual(['a² + b² = c²', 'a₂ + b₂ = c₂']);
    expect(labels('x1 + x2 = 1')).toEqual(['x₁ + x₂ = 1', 'x¹ + x² = 1']);
    expect(labels('a1, a2, a3')).toEqual(['a₁, a₂, a₃', 'a¹, a², a³']);
    expect(labels('x + y = 1')).toEqual([]);
  });

  test('a reading replaces only the equation, not the prose before it', () => {
    const text = 'Let x2+y2=1';
    expect(equationStart(text, text.length)).toBe(4);
    expect(equationReadings(text, text.length)[0]).toMatchObject({start: 4, end: text.length, insert: 'x²+y²=1'});
    expect(equationStart('sin x2 = 1', 10)).toBe(0);
  });

  test('the strip offers both readings and a next piece', () => {
    expect(equationSuggestions('x2+y2=1', 7).map(item => item.label)).toEqual(['x²+y²=1', 'x₂+y₂=1', '…']);
  });
});

describe('equation strip', () => {
  test('offers the usual next pieces', () => {
    expect(equationSuggestions('f(x) = x', 8).map(item => item.label)).toEqual(['x²', 'x₁', 'xₙ']);
    expect(equationSuggestions('(a+b)', 5).map(item => item.label)).toEqual(['²', '⁻¹', '³']);
    expect(equationSuggestions('a₁, a₂, ', 8).map(item => item.label)[0]).toBe('…');
    expect(equationSuggestions('= ', 2, ['ε', 'n']).map(item => item.label)).toEqual(['ε', '0', '…']);
    const [square] = equationSuggestions('y = x', 5);
    expect(square).toMatchObject({start: 4, end: 5, insert: 'x²'});
  });

  test("takes the question's own variables", () => {
    expect(questionVariables(['For every ε > 0 there is N with |a_n - L| < ε for n ≥ N'])[0]).toBe('ε');
  });
});
