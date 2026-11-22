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
