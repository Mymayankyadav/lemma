import {describe, expect, it} from 'vitest';
import {compositionLatex} from '../../../src/features/tutor/input/useAutoeqReadings';
import {deleteComposed} from '../../../src/features/tutor/input/TutorEquationPanel';
import {localEquationCandidates} from '../../../src/features/pad/equationAssist/candidates';

// N223 (Owner): "write x1 + y1 = 1 in the composer which will be later picked by auto eq".
describe('equation composer', () => {
  it('writes the composition as LaTeX without changing what the learner wrote', () => {
    expect(compositionLatex('x1 + y1 = 1')).toBe('x1+y1=1');
    expect(compositionLatex('a × b ≤ √2')).toBe('a \\times b \\le \\sqrt{2}');
    expect(compositionLatex('√(x + 1)')).toBe('\\sqrt{x+1}');
    expect(compositionLatex('∀ x ∈ ℝ')).toBe('\\forall x \\in \\mathbb{R}');
    expect(compositionLatex('∑ π ∞ …')).toMatch(/^\\sum \\pi \\infty \\dots$/);
  });

  it('deletes one written token: a sign with its spaces, or one character', () => {
    expect(deleteComposed('x1 + y1 = ')).toBe('x1 + y1');
    expect(deleteComposed('x1 + y1')).toBe('x1 + y');
    expect(deleteComposed('x')).toBe('');
  });

  it('is read by autoeq as subscripts, powers and coefficients, ordered by the words before it', () => {
    const read = (context: string) => localEquationCandidates({text: 'x1 + y1 = 1', context, start: 0, end: 11, inMath: false})
      .map(candidate => candidate.latex);
    expect(read('')).toEqual(['x_{1}+y_{1}=1', 'x^{1}+y^{1}=1', '1x+1y=1']);
    expect(read('The circle')[0]).toBe('x^{1}+y^{1}=1');
    expect(read('The linear equation')[0]).toBe('1x+1y=1');
  });
});
