import {useLayoutEffect, useRef, type RefObject} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {imageReference, tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';
import {padEdit, scanPad, type PadEdit} from '../pad/padEdit';
import './answer-editor.css';

export interface AnswerImage {id: string; kind: 'drawing' | 'photo'}

/** An atomic inline element: a drawing or photo chip, or (N221) a rendered equation. */
const atomic = (node: Node): node is HTMLElement => node instanceof HTMLElement && Boolean(node.dataset.imageId || node.dataset.math);

function content(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement && node.dataset.imageId) return imageReference(node.dataset.imageId);
  // N221: an equation is stored as its LaTeX source with its delimiters; the editor shows it rendered.
  if (node instanceof HTMLElement && node.dataset.math) return node.dataset.math;
  if (node instanceof HTMLBRElement) return '\n';
  return [...node.childNodes].reduce((text, child) => {
    const line = child instanceof HTMLDivElement && text && !text.endsWith('\n') ? '\n' : '';
    return text + line + content(child);
  }, '');
}

/** The text the editor shows, as stored: chips as their source, no selection work. */
function domText(root: HTMLElement): string {
  return root.childNodes.length === 1 && root.firstChild instanceof HTMLBRElement ? '' : content(root);
}

/**
 * N232: a tap on the answer keyboard changes the text by a few characters. When that change sits inside one plain text
 * node (no chip, no $, no backslash next to a $), patch that node instead of rebuilding every chip and KaTeX rendering.
 * Returns false when the editor has to be rebuilt.
 */
function patchText(root: HTMLElement, from: string, to: string): boolean {
  if (domText(root) !== from) return false;
  let p = 0;
  const max = Math.min(from.length, to.length);
  while (p < max && from.charCodeAt(p) === to.charCodeAt(p)) p++;
  let q = 0;
  while (q < max - p && from.charCodeAt(from.length - 1 - q) === to.charCodeAt(to.length - 1 - q)) q++;
  const removed = from.slice(p, from.length - q), inserted = to.slice(p, to.length - q);
  const risky = /[$\\\[\]]/u;
  if (risky.test(removed) || risky.test(inserted) || risky.test(to.slice(Math.max(0, p - 1), p)) ||
      risky.test(to.slice(p + inserted.length, p + inserted.length + 1))) return false;
  let offset = 0;
  for (const child of root.childNodes) {
    const length = content(child).length;
    if (child.nodeType === Node.TEXT_NODE && p >= offset && p + removed.length <= offset + length) {
      const node = child as Text, local = p - offset;
      node.data = node.data.slice(0, local) + inserted + node.data.slice(local + removed.length);
      return true;
    }
    offset += length;
  }
  return false;
}

/** Mathematical chips contribute their source length, without cloning their rendered DOM. */
function textBefore(container: Node, boundary: Node, index: number, beforeNode = false): string {
  if (atomic(container)) return content(container);
  if (container.nodeType === Node.TEXT_NODE) return (container.textContent ?? '').slice(0, index);
  let result = '';
  const limit = container === boundary ? index : container.childNodes.length;
  for (let at = 0; at < limit; at++) {
    const child = container.childNodes[at];
    if (beforeNode && child === boundary) return result;
    if (child instanceof HTMLDivElement && result && !result.endsWith('\n')) result += '\n';
    if (child.contains(boundary)) return result + textBefore(child, boundary, index, beforeNode);
    result += content(child);
  }
  return result;
}

export function readTutorAnswer(editor: HTMLElement): PadEdit {
  const text = editor.childNodes.length === 1 && editor.firstChild instanceof HTMLBRElement ? '' : content(editor);
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode))
    return padEdit(text);
  const anchor = textBefore(editor, selection.anchorNode, selection.anchorOffset).length;
  const focus = selection.isCollapsed ? anchor : textBefore(editor, selection.focusNode, selection.focusOffset).length;
  return padEdit(text, anchor, focus, anchor > focus ? 'backward' : 'forward');
}

export function setTutorAnswerSelection(editor: HTMLElement, {start, end, direction}: PadEdit) {
  function point(target: number): [Node, number] {
    let offset = 0;
    for (let index = 0; index < editor.childNodes.length; index++) {
      const child = editor.childNodes[index];
      const length = content(child).length;
      if (target <= offset + length) {
        if (child.nodeType === Node.TEXT_NODE) return [child, target - offset];
        if (atomic(child)) return [editor, index + Number(target > offset)];
        if (child instanceof HTMLBRElement) return [editor, index + Number(target > offset)];
        const walker = editor.ownerDocument.createTreeWalker(child, NodeFilter.SHOW_TEXT);
        let position = offset;
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
          const width = text.textContent?.length ?? 0;
          if (target <= position + width) return [text, target - position];
          position += width;
        }
      }
      offset += length;
    }
    return [editor, editor.childNodes.length];
  }
  const [from, to] = direction === 'backward' ? [end, start] : [start, end];
  const selection = editor.ownerDocument.getSelection();
  if (!selection) return;
  const [focus, focusOffset] = point(to);
  const startPoint = from === to ? [focus, focusOffset] as const : point(from);
  selection.setBaseAndExtent(...startPoint, focus, focusOffset);
  const caret = editor.ownerDocument.createRange();
  caret.setStart(focus, focusOffset);
  const box = caret.getBoundingClientRect?.();
  if (!box?.height) return;
  const bounds = editor.getBoundingClientRect();
  if (box.bottom > bounds.bottom) editor.scrollTop += box.bottom - bounds.bottom;
  else if (box.top < bounds.top) editor.scrollTop -= bounds.top - box.top;
}

function chip(editor: HTMLElement, id: string, image: AnswerImage | undefined, disabled: boolean) {
  const doc = editor.ownerDocument;
  const wrapper = doc.createElement('span');
  wrapper.className = 'tutor-answer-chip';
  wrapper.setAttribute('contenteditable', 'false');
  wrapper.dataset.imageId = id;
  const name = image?.kind === 'drawing' ? 'Drawing' : image?.kind === 'photo' ? 'Photo' : 'Image unavailable';
  const edit = doc.createElement('button');
  edit.type = 'button';
  edit.dataset.chipAction = 'edit';
  edit.textContent = name;
  edit.setAttribute('aria-label', image?.kind === 'drawing' ? 'Edit drawing' : image ? 'View photo' : name);
  edit.disabled = disabled || !image;
  const remove = doc.createElement('button');
  remove.type = 'button';
  remove.dataset.chipAction = 'remove';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Remove ' + name.toLowerCase());
  remove.disabled = disabled;
  wrapper.append(edit, remove);
  return wrapper;
}

/**
 * N221 (Owner): an equation in the answer is an inline component that shows the rendered TeX, not its source. It is
 * one atomic piece of the text (stored as $…$, so the tutor still receives LaTeX); a tap opens it for editing.
 */
function mathChip(editor: HTMLElement, source: string, tex: string, display: boolean, disabled: boolean) {
  const doc = editor.ownerDocument;
  const wrapper = doc.createElement('span');
  wrapper.className = 'tutor-math-chip';
  wrapper.setAttribute('contenteditable', 'false');
  wrapper.dataset.math = source;
  if (display) wrapper.dataset.display = '';
  const edit = doc.createElement('button');
  edit.type = 'button';
  edit.dataset.chipAction = 'math';
  edit.setAttribute('aria-label', 'Edit equation ' + tex.trim());
  edit.disabled = disabled;
  const rendered = doc.createElement('span');
  rendered.className = 'tutor-math-chip-tex';
  rendered.setAttribute('aria-hidden', 'true');
  try {
    rendered.innerHTML = katex.renderToString(tex, {throwOnError: false, output: 'html', displayMode: false, strict: 'ignore', trust: false});
  } catch {
    rendered.textContent = tex;
  }
  edit.append(rendered);
  wrapper.append(edit);
  return wrapper;
}

/** The finished equations in an answer's text, in order. */
export const answerEquations = (value: string) => tutorAnswerParts(value)
  .flatMap(part => part.type === 'text' ? scanPad(part.text).filter(segment => segment.kind === 'math') : []);

export function renderTutorAnswer(editor: HTMLElement, value: string, images: readonly AnswerImage[], readOnly: boolean,
  marked?: {start: number; end: number}) {
  const map = new Map(images.map(image => [image.id.toLowerCase(), image]));
  let offset = 0;
  const nodes: Node[] = [];
  const text = (piece: string) => {
    const start = marked ? marked.start - offset : -1, end = marked ? marked.end - offset : -1;
    if (!readOnly && start >= 0 && start < end && end <= piece.length) {
      nodes.push(editor.ownerDocument.createTextNode(piece.slice(0, start)));
      const source = editor.ownerDocument.createElement('span');
      source.dataset.writingAidSource = '';
      source.textContent = piece.slice(start, end);
      nodes.push(source, editor.ownerDocument.createTextNode(piece.slice(end)));
    } else nodes.push(editor.ownerDocument.createTextNode(piece));
    offset += piece.length;
  };
  for (const part of tutorAnswerParts(value)) {
    if (part.type === 'image') {
      nodes.push(chip(editor, part.id, map.get(part.id), readOnly));
      offset += imageReference(part.id).length;
      continue;
    }
    for (const segment of scanPad(part.text)) {
      if (segment.kind !== 'math') {text(segment.source); continue;}
      nodes.push(mathChip(editor, segment.source, segment.tex ?? '', Boolean(segment.display), readOnly));
      offset += segment.source.length;
    }
  }
  editor.replaceChildren(...nodes);
  editor.toggleAttribute('data-empty', !value);
}

type Events = Pick<React.ComponentProps<'div'>,
  'onCopy' | 'onCut' | 'onFocus' | 'onPointerDown' | 'onInput' | 'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd' | 'onPaste' | 'onDrop'>;

export function TutorAnswerEditor({editor, value, images, composing, placeholder, readOnly, ghost, marked, restoreSelection = true, onSelection, onChip, onMath, ...events}: Events & {
  editor: RefObject<HTMLDivElement | null>;
  value: string;
  images: readonly AnswerImage[];
  composing: boolean;
  restoreSelection?: boolean;
  placeholder: string;
  ghost?: string;
  marked?: {start: number; end: number};
  readOnly: boolean;
  onSelection: () => void;
  onChip: (id: string, offset: number, action: 'edit' | 'remove') => void;
  /** N221: an equation was tapped; `source` is its $…$ text at `offset`. */
  onMath?: (source: string, offset: number) => void;
}) {
  const rendered = useRef<{signature: string; readOnly: boolean; mark: string; value: string}>(null);
  const mark = marked ? marked.start + ':' + marked.end : '';
  useLayoutEffect(() => {
    const root = editor.current;
    if (!root || composing) return;
    const signature = images.map(image => image.id + image.kind).join('|');
    const previous = rendered.current;
    rendered.current = {signature, readOnly, mark, value};
    // N232: a small text change in one text node is patched in place; see patchText.
    if (previous && previous.value !== value && previous.signature === signature && previous.readOnly === readOnly &&
        previous.mark === mark && patchText(root, previous.value, value)) {
      root.toggleAttribute('data-empty', !value);
      return;
    }
    const references = tutorAnswerParts(value).filter(part => part.type === 'image');
    const chips = root.querySelectorAll('[data-image-id]');
    const staleChips = references.length !== chips.length || references.some((part, index) => chips[index]?.getAttribute('data-image-id') !== part.id);
    const nestedText = [...root.childNodes].some(node => node.nodeType !== Node.TEXT_NODE &&
      !(atomic(node) || node instanceof HTMLElement && node.hasAttribute('data-writing-aid-source')));
    // A $…$ just closed by typing is still plain text in the editor: show it as its equation.
    const equations = answerEquations(value);
    const mathChips = [...root.querySelectorAll<HTMLElement>('[data-math]')].map(node => node.dataset.math);
    const staleMath = equations.length !== mathChips.length || equations.some((segment, index) => mathChips[index] !== segment.source);
    if (domText(root) !== value || staleChips || staleMath || nestedText || previous?.signature !== signature || previous?.readOnly !== readOnly || previous?.mark !== mark) {
      const saved = restoreSelection && root.ownerDocument.activeElement === root ? readTutorAnswer(root) : undefined;
      renderTutorAnswer(root, value, images, readOnly, marked);
      if (saved) setTutorAnswerSelection(root, padEdit(value, saved.start, saved.end, saved.direction));
    }
    root.toggleAttribute('data-empty', !value);
  }, [editor, value, images, readOnly, composing, mark, restoreSelection]);

  return <div {...events} ref={editor} className="tutor-answer-editor" role="textbox" aria-label="Your answer"
    data-completion={ghost || undefined} aria-multiline="true" aria-readonly={readOnly} aria-placeholder={placeholder} data-placeholder={placeholder}
    tabIndex={0} contentEditable={!readOnly} suppressContentEditableWarning inputMode="none" autoCorrect="off" autoCapitalize="off" spellCheck={false}
    onPointerDown={event => {
      if (event.target instanceof Element && event.target.closest('[data-chip-action]')) event.preventDefault();
      else events.onPointerDown?.(event);
    }}
    onSelect={onSelection} onClick={event => {
      const action = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-chip-action]') : null;
      const equation = action?.dataset.chipAction === 'math' ? action.closest<HTMLElement>('[data-math]') : null;
      if (equation && !readOnly && onMath) {
        onMath(equation.dataset.math!, textBefore(event.currentTarget, equation, 0, true).length);
        return;
      }
      const wrapper = action?.closest<HTMLElement>('[data-image-id]');
      const id = wrapper?.dataset.imageId;
      if (!id || !action || !wrapper || readOnly) {onSelection(); return;}
      onChip(id, textBefore(event.currentTarget, wrapper, 0, true).length, action.dataset.chipAction === 'remove' ? 'remove' : 'edit');
    }}/>;
}
