import {describe, expect, it} from 'vitest';
import {compositionLatex} from '../../../src/features/tutor/input/useAutoeqReadings';
import {localEquationCandidates} from '../../../src/features/pad/equationAssist/candidates';

// N223 (Owner): what autoeq offers for an equation typed in the answer (x1 + y1 = 1), and the equation as written.
describe('typed equation readings', () => {
  it('writes the composition as LaTeX without changing what the learner wrote', () => {
    expect(compositionLatex('x1 + y1 = 1')).toBe('x1+y1=1');
    expect(compositionLatex('a × b ≤ √2')).toBe('a \\times b \\le \\sqrt{2}');
    expect(compositionLatex('√(x + 1)')).toBe('\\sqrt{x+1}');
    expect(compositionLatex('∀ x ∈ ℝ')).toBe('\\forall x \\in \\mathbb{R}');
    expect(compositionLatex('∑ π ∞ …')).toMatch(/^\\sum \\pi \\infty \\dots$/);
  });

  it('is read by autoeq as subscripts, powers and coefficients, ordered by the words before it', () => {
    const read = (context: string) => localEquationCandidates({text: 'x1 + y1 = 1', context, start: 0, end: 11, inMath: false})
      .map(candidate => candidate.latex);
    expect(read('')).toEqual(['x_{1}+y_{1}=1', 'x^{1}+y^{1}=1', '1x+1y=1']);
    expect(read('The circle')[0]).toBe('x^{1}+y^{1}=1');
    expect(read('The linear equation')[0]).toBe('1x+1y=1');
  });
});

// Review of #1830: the equation as written kept a slot; a symbol read by hand always has LaTeX for an equation chip.
import {slotReadings} from '../../../src/features/tutor/input/useAutoeqReadings';
import {symbolLatex} from '../../../src/features/tutor/input/symbolEdit';
import {symbolByGlyph} from '../../../src/features/tutor/input/symbolCatalog';

describe('the strip\'s three slots and handwritten symbols', () => {
  it('keeps the equation as written selectable when autoeq has three readings', () => {
    const found = localEquationCandidates({text: 'x1+x2=4', context: '', start: 0, end: 7, inMath: false});
    expect(found).toHaveLength(3);
    expect(slotReadings(found, 'x1+x2=4').map(item => item.latex)).toEqual(['x_{1}+x_{2}=4', 'x^{1}+x^{2}=4', 'x1+x2=4']);
    // When a reading already is the equation as written, it takes no extra slot.
    const plain = localEquationCandidates({text: 'a+b=c', context: '', start: 0, end: 5, inMath: false});
    expect(slotReadings(plain, 'a+b=c').map(item => item.latex)).toEqual(plain.map(item => item.latex));
  });
  it('gives every handwritten symbol LaTeX, commands with arguments included', () => {
    expect(symbolLatex(symbolByGlyph('∀')!.id)).toBe('\\forall');
    expect(symbolLatex(symbolByGlyph('ℝ')!.id)).toBe('\\mathbb{R}');
    expect(symbolLatex('no-such-symbol')).toBeNull();
  });
});
