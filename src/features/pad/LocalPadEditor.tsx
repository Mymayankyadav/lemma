import {useDeferredValue, useId, useLayoutEffect, useRef, useState, type PointerEvent} from 'react';
import {LOCAL_TUTOR_EXCERPT_LIMIT, previewLocalTutorExcerpt} from '../../data/tutor/local-excerpt';
import {LocalPadPreview} from './LocalPadPreview';
import {
  PAD_SYMBOLS, PAD_TEMPLATES, applyPadSuggestion, insertPadSymbol, insertPadTemplate,
  nextPadSlot, padEdit, padSuggestions, type PadEdit,
} from './padEdit';
import './local-pad.css';

function snapshot(node: HTMLTextAreaElement) {
  return padEdit(node.value, node.selectionStart, node.selectionEnd, node.selectionDirection);
}

interface LocalPadEditorProps {
  value: PadEdit;
  onEdit: (value: PadEdit) => void;
  onSendSelection?: (text: string) => void;
}

/**
 * Controlled, device-only editor. Its caller restores and saves snapshots for the
 * currently authorized owner/checkpoint; this component has no storage or transport.
 * Key it by the authorized draft binding when changing checkpoint or account.
 */
export function LocalPadEditor({value, onEdit, onSendSelection}: LocalPadEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [frozenSource, setFrozenSource] = useState<string | null>(null);
  const compositionActive = frozenSource !== null;
  const source = useDeferredValue(frozenSource ?? value.text);
  const id = useId();
  const valueSelection = padEdit(value.text, value.start, value.end, value.direction);

  // Only change the DOM selection when it actually differs. In particular do not
  // interfere with a native IME's ongoing candidate selection.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node || composing.current) return;
    const {start, end, direction} = padEdit(value.text, value.start, value.end, value.direction);
    if (node.selectionStart !== start || node.selectionEnd !== end
      || (start !== end && node.selectionDirection !== direction)) node.setSelectionRange(start, end, direction);
  }, [value.text, value.start, value.end, value.direction, compositionActive]);

  function publish(next: PadEdit) {
    if (value.text !== next.text || value.start !== next.start || value.end !== next.end || value.direction !== next.direction) {
      onEdit(next);
    }
  }

  // Native touch selection handles can update a textarea without a key or mouse event.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    const selectionChanged = () => {if (!composing.current) publish(snapshot(node));};
    node.addEventListener('select', selectionChanged);
    node.addEventListener('selectionchange', selectionChanged);
    return () => {
      node.removeEventListener('select', selectionChanged);
      node.removeEventListener('selectionchange', selectionChanged);
    };
  });

  function edit(operation: (current: PadEdit) => PadEdit | null) {
    const node = field.current;
    if (!node || composing.current) return;
    // Read the actual native selection, including selections made since the last render.
    const next = operation(snapshot(node));
    if (!next) return;
    node.focus({preventScroll: true});
    publish(next);
  }

  function keepSelection(event: PointerEvent<HTMLButtonElement>) {
    if (document.activeElement === field.current) event.preventDefault();
  }

  const selection = previewLocalTutorExcerpt(value.text.slice(valueSelection.start, valueSelection.end));
  const suggestions = compositionActive ? [] : padSuggestions(valueSelection);
  return <section aria-label="Local Pad editor" className="local-pad">
    <label htmlFor={id}>Pad notes</label>
    <p id={id + '-hint'}>Write normally, or use $…$ for inline math and $$…$$ for display math.</p>
    <textarea ref={field} id={id} aria-describedby={id + '-hint'} className="local-pad-paper" rows={7}
      value={value.text}
      onChange={event => publish(snapshot(event.currentTarget))}
      onSelect={event => publish(snapshot(event.currentTarget))}
      onCompositionStart={event => {composing.current = true; setFrozenSource(event.currentTarget.value);}}
      onCompositionEnd={event => {
        composing.current = false;
        publish(snapshot(event.currentTarget));
        setFrozenSource(null);
      }}/>
    <div className="local-pad-controls" role="group" aria-label="Math symbols">
      {PAD_SYMBOLS.map(symbol => <button key={symbol.tex} type="button" aria-label={symbol.label} disabled={compositionActive}
        onPointerDown={keepSelection} onClick={() => edit(current => insertPadSymbol(current, symbol))}>{symbol.glyph}</button>)}
    </div>
    <div className="local-pad-controls" role="group" aria-label="Math templates">
      {PAD_TEMPLATES.map(template => <button key={template} type="button" disabled={compositionActive}
        onPointerDown={keepSelection} onClick={() => edit(current => insertPadTemplate(current, template))}>{template}</button>)}
      <button type="button" disabled={compositionActive || !nextPadSlot(valueSelection)}
        onPointerDown={keepSelection} onClick={() => edit(nextPadSlot)}>Next slot</button>
    </div>
    {onSendSelection && <div className="local-pad-controls">
      <button type="button" disabled={compositionActive || selection.kind !== 'preview'}
        onPointerDown={keepSelection} onClick={() => {
          const node = field.current;
          if (!node || composing.current) return;
          const reviewed = previewLocalTutorExcerpt(node.value.slice(node.selectionStart, node.selectionEnd));
          if (reviewed.kind === 'preview') onSendSelection(reviewed.text);
        }}>Send selection to tutor</button>
      {selection.kind === 'too-long' && <p role="status">Select up to {LOCAL_TUTOR_EXCERPT_LIMIT} characters.</p>}
    </div>}
    {suggestions.length > 0 && <div className="local-pad-controls" role="group" aria-label="Local math suggestions">
      {suggestions.map(({command}) => <button key={command} type="button" onPointerDown={keepSelection}
        onClick={() => edit(current => {
          const suggestion = padSuggestions(current).find(entry => entry.command === command);
          return suggestion ? applyPadSuggestion(current, suggestion) : null;
        })}>{command}</button>)}
    </div>}
    <LocalPadPreview source={source}/>
  </section>;
}
