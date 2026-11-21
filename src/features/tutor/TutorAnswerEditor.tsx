import {useLayoutEffect, useRef, type RefObject} from 'react';
import {imageReference, tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';
import {padEdit, type PadEdit} from '../pad/padEdit';
import './answer-editor.css';

export interface AnswerImage {id: string; kind: 'drawing' | 'photo'}

function content(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement && node.dataset.imageId) return imageReference(node.dataset.imageId);
  if (node instanceof HTMLBRElement) return '\n';
  return [...node.childNodes].reduce((text, child) => {
    const line = child instanceof HTMLDivElement && text && !text.endsWith('\n') ? '\n' : '';
    return text + line + content(child);
  }, '');
}

export function readTutorAnswer(editor: HTMLElement): PadEdit {
  const text = editor.childNodes.length === 1 && editor.firstChild instanceof HTMLBRElement ? '' : content(editor);
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode))
    return padEdit(text);
  function offset(node: Node, index: number) {
    const range = editor.ownerDocument.createRange();
    range.selectNodeContents(editor);
    range.setEnd(node, index);
    return content(range.cloneContents()).length;
  }
  const anchor = offset(selection.anchorNode, selection.anchorOffset);
  const focus = offset(selection.focusNode, selection.focusOffset);
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
        if (child instanceof HTMLElement && child.dataset.imageId) return [editor, index + Number(target > offset)];
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
  selection.setBaseAndExtent(...point(from), focus, focusOffset);
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

export function renderTutorAnswer(editor: HTMLElement, value: string, images: readonly AnswerImage[], readOnly: boolean) {
  const map = new Map(images.map(image => [image.id.toLowerCase(), image]));
  editor.replaceChildren(...tutorAnswerParts(value).map(part => part.type === 'image'
    ? chip(editor, part.id, map.get(part.id), readOnly) : editor.ownerDocument.createTextNode(part.text)));
  editor.toggleAttribute('data-empty', !value);
}

type Events = Pick<React.ComponentProps<'div'>,
  'onCopy' | 'onCut' | 'onFocus' | 'onPointerDown' | 'onInput' | 'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd' | 'onPaste' | 'onDrop'>;

export function TutorAnswerEditor({editor, value, images, composing, placeholder, readOnly, onSelection, onChip, ...events}: Events & {
  editor: RefObject<HTMLDivElement | null>;
  value: string;
  images: readonly AnswerImage[];
  composing: boolean;
  placeholder: string;
  readOnly: boolean;
  onSelection: () => void;
  onChip: (id: string, offset: number, action: 'edit' | 'remove') => void;
}) {
  const rendered = useRef<{signature: string; readOnly: boolean}>(null);
  useLayoutEffect(() => {
    const root = editor.current;
    if (!root || composing) return;
    const signature = images.map(image => image.id + image.kind).join('|');
    const previous = rendered.current;
    rendered.current = {signature, readOnly};
    const references = tutorAnswerParts(value).filter(part => part.type === 'image');
    const chips = root.querySelectorAll('[data-image-id]');
    const staleChips = references.length !== chips.length || references.some((part, index) => chips[index]?.getAttribute('data-image-id') !== part.id);
    const nestedText = [...root.childNodes].some(node => node.nodeType !== Node.TEXT_NODE &&
      !(node instanceof HTMLElement && node.dataset.imageId));
    if (readTutorAnswer(root).text !== value || staleChips || nestedText || previous?.signature !== signature || previous?.readOnly !== readOnly) {
      const saved = readTutorAnswer(root);
      renderTutorAnswer(root, value, images, readOnly);
      if (root.ownerDocument.activeElement === root) setTutorAnswerSelection(root, padEdit(value, saved.start, saved.end, saved.direction));
    }
    root.toggleAttribute('data-empty', !value);
  }, [editor, value, images, readOnly, composing]);

  return <div {...events} ref={editor} className="tutor-answer-editor" role="textbox" aria-label="Your answer"
    aria-multiline="true" aria-readonly={readOnly} aria-placeholder={placeholder} data-placeholder={placeholder}
    tabIndex={0} contentEditable={!readOnly} suppressContentEditableWarning inputMode="none" autoCorrect="off" autoCapitalize="off" spellCheck={false}
    onPointerDown={event => {
      if (event.target instanceof Element && event.target.closest('[data-chip-action]')) event.preventDefault();
      else events.onPointerDown?.(event);
    }}
    onSelect={onSelection} onClick={event => {
      const action = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-chip-action]') : null;
      const wrapper = action?.closest<HTMLElement>('[data-image-id]');
      const id = wrapper?.dataset.imageId;
      if (!id || !action || !wrapper || readOnly) {onSelection(); return;}
      const range = event.currentTarget.ownerDocument.createRange();
      range.selectNodeContents(event.currentTarget);
      range.setEndBefore(wrapper);
      onChip(id, content(range.cloneContents()).length, action.dataset.chipAction === 'remove' ? 'remove' : 'edit');
    }}/>;
}
