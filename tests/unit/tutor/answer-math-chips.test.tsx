// @vitest-environment jsdom
import {describe, expect, test} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {answerEquations, readTutorAnswer, renderTutorAnswer, setTutorAnswerSelection} from '../../../src/features/tutor/TutorAnswerEditor';

// N221 (Owner task): an equation in the answer is an inline component showing rendered TeX, stored as $…$.
function editor(value: string) {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.replaceChildren(root);
  renderTutorAnswer(root, value, [], false);
  return root;
}

describe('equation chips in the answer', () => {
  test('a finished $…$ is one rendered, atomic chip; the text it stands for is unchanged', () => {
    const root = editor('The circle $x^2+y^2=1$ has radius $$\\sqrt{1}$$.');
    const chips = root.querySelectorAll<HTMLElement>('[data-math]');
    expect([...chips].map(chip => chip.dataset.math)).toEqual(['$x^2+y^2=1$', '$$\\sqrt{1}$$']);
    expect(chips[0].getAttribute('contenteditable')).toBe('false');
    expect(chips[0].querySelector('button')?.getAttribute('aria-label')).toBe('Edit equation x^2+y^2=1');
    expect(chips[0].querySelector('.katex')).not.toBeNull();
    expect(chips[1].hasAttribute('data-display')).toBe(true);
    expect(readTutorAnswer(root).text).toBe('The circle $x^2+y^2=1$ has radius $$\\sqrt{1}$$.');
  });

  test('an unfinished $ stays text to type into', () => {
    const root = editor('Let $x^2');
    expect(root.querySelectorAll('[data-math]')).toHaveLength(0);
    expect(readTutorAnswer(root).text).toBe('Let $x^2');
    expect(answerEquations('Let $x^2$ and $y$').map(segment => segment.tex)).toEqual(['x^2', 'y']);
  });

  test('the caret moves around a chip as one piece', () => {
    const value = 'a $x$ b';
    const root = editor(value);
    root.focus();
    setTutorAnswerSelection(root, padEdit(value, 5));
    expect(readTutorAnswer(root).start).toBe(5);
    setTutorAnswerSelection(root, padEdit(value, 2));
    expect(readTutorAnswer(root).start).toBe(2);
  });
});
