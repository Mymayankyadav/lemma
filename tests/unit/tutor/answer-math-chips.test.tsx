// @vitest-environment jsdom
import {describe, expect, test, vi} from 'vitest';
import {act, createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {padEdit} from '../../../src/features/pad/padEdit';
import {answerEquations, readTutorAnswer, renderTutorAnswer, setTutorAnswerSelection, TutorAnswerEditor} from '../../../src/features/tutor/TutorAnswerEditor';
import {imageReference} from '../../../supabase/functions/_shared/tutor-answer';

// N221 (Owner task): an equation in the answer is an inline component showing rendered TeX, stored as $…$.
function editor(value: string) {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.replaceChildren(root);
  renderTutorAnswer(root, value, [], false);
  return root;
}

describe('equation chips in the answer', () => {
  test('patches a canonical empty editor with plain source and still builds math and image chips', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const editorRef = createRef<HTMLDivElement>();
    const id = '00000000-0000-0000-0000-000000000001';
    const images = [{id, kind: 'photo' as const}];
    const render = (value: string, marked?: {start: number; end: number}) => act(async () => root.render(<TutorAnswerEditor editor={editorRef}
      value={value} images={images} placeholder="Answer" composing={false} readOnly={false} marked={marked}
      onSelection={() => {}} onChip={() => {}}/>));
    try {
      await render('');
      const field = editorRef.current!;
      for (const nativeBreak of [false, true]) {
        field.replaceChildren(...(nativeBreak ? [document.createElement('br')] : []));
        const source = nativeBreak ? ' 𝒰\n  x ' : 'q';
        const chipQueries = vi.spyOn(field, 'querySelectorAll');
        try {
          await render(source);
          expect(chipQueries).not.toHaveBeenCalled();
        } finally {chipQueries.mockRestore();}
        expect(field.childNodes).toHaveLength(1);
        expect(field.firstChild).toBeInstanceOf(Text);
        expect(field.textContent).toBe(source);
        expect(field.hasAttribute('data-empty')).toBe(false);
        field.focus();
        setTutorAnswerSelection(field, padEdit(source, nativeBreak ? 3 : 1));
        expect(readTutorAnswer(field)).toEqual(padEdit(source, nativeBreak ? 3 : 1));
        await render('');
      }
      for (const [source, selector] of [['$x$', '[data-math]'], [imageReference(id), '[data-image-id]']]) {
        field.replaceChildren(document.createElement('br'));
        await render(source);
        expect(field.querySelector(selector)).not.toBeNull();
        expect(readTutorAnswer(field).text).toBe(source);
        await render('');
      }
      const marked = {start: 0, end: 1};
      await render('', marked);
      field.replaceChildren(document.createElement('br'));
      await render('q', marked);
      expect(field.querySelector('[data-writing-aid-source]')?.textContent).toBe('q');
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  test('an empty editor has one logical caret offset without a native selection read', () => {
    const root = editor('');
    root.replaceChildren(document.createElement('br'));
    const selection = vi.spyOn(document, 'getSelection');
    try {
      expect(readTutorAnswer(root)).toEqual(padEdit(''));
      expect(selection).not.toHaveBeenCalled();
    } finally {selection.mockRestore();}
  });

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

  test('reads an astral caret and backward range across eight chips without cloning rendered markup', () => {
    const value = Array.from({length: 8}, (_, at) => '$x_' + at + '$').join(' ') + ' 𝒰 is given';
    const root = editor(value);
    const clone = vi.spyOn(Range.prototype, 'cloneContents');
    try {
      setTutorAnswerSelection(root, padEdit(value, value.length));
      expect(readTutorAnswer(root)).toMatchObject({start: value.length, end: value.length});
      const start = value.indexOf('𝒰') + '𝒰'.length;
      setTutorAnswerSelection(root, padEdit(value, start, value.length, 'backward'));
      expect(readTutorAnswer(root)).toMatchObject({start, end: value.length, direction: 'backward'});
      expect(clone).not.toHaveBeenCalled();
      expect(root.querySelectorAll('[data-math]')).toHaveLength(8);
    } finally {clone.mockRestore();}
  });

  test('keeps native editor line breaks in the selection offset', () => {
    const root = editor('One');
    const line = document.createElement('div');
    const text = document.createTextNode('Two');
    line.append(text);
    root.append(line);
    document.getSelection()!.setBaseAndExtent(text, 2, text, 2);
    expect(readTutorAnswer(root)).toMatchObject({text: 'One\nTwo', start: 6, end: 6});
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
