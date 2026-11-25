import {useDeferredValue, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent} from 'react';
import {LOCAL_TUTOR_EXCERPT_LIMIT, previewLocalTutorExcerpt} from '../../data/tutor/local-excerpt';
import {isFlagOn} from '../../flags';
import {LocalPadPreview} from './LocalPadPreview';
import {EquationAssist} from './equationAssist/EquationAssist';
import {applyEquationCandidate} from './equationAssist/candidates';
import {PadMathKeyboard, type PadKeyboardAction} from './PadMathKeyboard';
import {PAD_NOTE_MAX} from './padDraftStore';
import {
  applyPadNotation, applyPadSuggestion, changePadText, createPadTextHistory, deletePadBackward, insertPadSymbol, insertPadTemplate,
  insertPadText, movePadCaret, nextPadSlot, padEdit, padNotationSuggestion, padSuggestions, redoPadText, undoPadText, type PadEdit,
} from './padEdit';
import './local-pad.css';

function snapshot(node: HTMLTextAreaElement) {
  return padEdit(node.value, node.selectionStart, node.selectionEnd, node.selectionDirection);
}

interface LocalPadEditorProps {
  value: PadEdit;
  onEdit: (value: PadEdit) => void;
  onSendSelection?: (text: string) => void;
  /** Owner/checkpoint-scoped preference key supplied by the authorized host. Stores only shown/hidden. */
  keyboardPreferenceKey?: string;
}

/**
 * Controlled, device-only editor. Its caller restores and saves snapshots for the
 * currently authorized owner/checkpoint; this component has no storage or transport.
 * Key it by the authorized draft binding when changing checkpoint or account.
 */
export function LocalPadEditor({value, onEdit, onSendSelection, keyboardPreferenceKey}: LocalPadEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const compositionBefore = useRef<PadEdit | null>(null);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const [frozenSource, setFrozenSource] = useState<string | null>(null);
  const [shown, setShown] = useState(() => {
    try {return !keyboardPreferenceKey || localStorage.getItem(keyboardPreferenceKey) !== 'hidden';} catch {return true;}
  });
  const [mode, setMode] = useState<'device' | 'math'>('device');
  const [nativeKeyboardOpen, setNativeKeyboardOpen] = useState(false);
  const [warning, setWarning] = useState('');
  const history = useRef(createPadTextHistory(value));
  const [, refreshHistory] = useState(0);
  const focusAfterEdit = useRef(false);
  const compositionActive = frozenSource !== null;
  const source = useDeferredValue(frozenSource ?? value.text);
  const id = useId();
  const valueSelection = padEdit(value.text, value.start, value.end, value.direction);

  // Imported/replaced drafts begin their own undo history; local edits update the
  // history before notifying the host. No account's text survives an editor remount.
  useLayoutEffect(() => {
    if (history.current.present.text !== value.text) {
      history.current = createPadTextHistory(value); refreshHistory(tick => tick + 1);
    } else history.current = {...history.current, present:value};
  }, [value.text, value.start, value.end, value.direction]);

  // Only change the DOM selection when it actually differs. In particular do not
  // interfere with a native IME's ongoing candidate selection.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node || composing.current) return;
    const {start, end, direction} = padEdit(value.text, value.start, value.end, value.direction);
    if (node.selectionStart !== start || node.selectionEnd !== end
      || (start !== end && node.selectionDirection !== direction)) node.setSelectionRange(start, end, direction);
    if (focusAfterEdit.current) {
      focusAfterEdit.current = false;
      node.focus({preventScroll:true});
      const box = node.getBoundingClientRect(), viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0, bottom = top + (viewport?.height ?? window.innerHeight);
      if (box.top < top || box.bottom > bottom) node.scrollIntoView?.({block:'nearest'});
    }
  }, [value.text, value.start, value.end, value.direction, compositionActive, mode, shown]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let width = window.innerWidth, fullHeight = Math.max(window.innerHeight, viewport?.height ?? 0);
    let open = false, resizesLayout = false, reducedHeight = window.innerHeight;
    function measure() {
      const layoutHeight = window.innerHeight, height = viewport?.height ?? layoutHeight;
      const rotated = width !== window.innerWidth;
      if (rotated) {
        width = window.innerWidth; fullHeight = layoutHeight;
        if (open) {
          reducedHeight = layoutHeight;
          resizesLayout = resizesLayout || layoutHeight - height <= 120;
        }
      }
      fullHeight = Math.max(fullHeight, layoutHeight, height);
      if (mode !== 'device' || document.activeElement !== field.current) {
        open = false; resizesLayout = false;
      } else if (open && resizesLayout) {
        // Android adjustResize shrinks both viewports. Rotation changes the
        // baseline, not the observed open IME: wait for height recovery, blur,
        // or an explicit input-mode choice before showing another keyboard.
        if (!rotated && layoutHeight - reducedHeight > 120 && layoutHeight - height <= 120) {
          open = false; resizesLayout = false; fullHeight = Math.max(layoutHeight, height);
        } else reducedHeight = Math.min(reducedHeight, layoutHeight);
      } else {
        open = (rotated && open) || fullHeight - height > 120;
        resizesLayout = open && fullHeight - layoutHeight > 120;
        if (resizesLayout) reducedHeight = layoutHeight;
      }
      setNativeKeyboardOpen(open);
    }
    measure();
    viewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    document.addEventListener('focusin', measure); document.addEventListener('focusout', measure);
    return () => {
      viewport?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('focusin', measure); document.removeEventListener('focusout', measure);
    };
  }, [mode]);

  function restore(next: PadEdit) {
    const node = field.current;
    if (node) {node.value = next.text; node.setSelectionRange(next.start, next.end, next.direction);}
  }

  function publish(next: PadEdit) {
    if (next.text.length > PAD_NOTE_MAX) {
      setWarning('Pad notes can contain up to 65,536 characters. That edit was not added.');
      restore(compositionBefore.current ?? history.current.present);
      return false;
    }
    if (value.text !== next.text) setWarning('');
    history.current = changePadText(history.current, next);
    refreshHistory(tick => tick + 1);
    if (value.text !== next.text || value.start !== next.start || value.end !== next.end || value.direction !== next.direction) {
      onEdit(next);
    }
    return true;
  }

  function trackSelection(node: HTMLTextAreaElement) {
    // React can dispatch select later in the same keydown that performed Undo,
    // before its controlled value has reached the DOM. It is not a new text edit.
    if (!composing.current && node.value === history.current.present.text) publish(snapshot(node));
  }

  // Native touch selection handles can update a textarea without a key or mouse event.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    const selectionChanged = () => trackSelection(node);
    node.addEventListener('select', selectionChanged);
    node.addEventListener('selectionchange', selectionChanged);
    return () => {
      node.removeEventListener('select', selectionChanged);
      node.removeEventListener('selectionchange', selectionChanged);
    };
  });

  function edit(operation: (current: PadEdit) => PadEdit | null, mathKeyboard = true) {
    const node = field.current;
    if (!node || composing.current) return false;
    // Read the actual native selection, including selections made since the last render.
    const current = snapshot(node);
    history.current = changePadText(history.current, current);
    const next = operation(current);
    if (!next) return false;
    // Math keys choose the custom keyboard. Equation Assist keeps the current
    // input method, including an open system keyboard.
    if (mathKeyboard) {setMode('math'); node.inputMode = 'none';}
    focusAfterEdit.current = true;
    node.focus({preventScroll: true});
    return publish(next);
  }

  function historyStep(direction: 'undo' | 'redo') {
    if (composing.current) return;
    const next = direction === 'undo' ? undoPadText(history.current) : redoPadText(history.current);
    if (next === history.current) return;
    history.current = next; focusAfterEdit.current = true;
    setWarning(''); refreshHistory(tick => tick + 1); onEdit(next.present);
  }

  function keyboardAction(action: PadKeyboardAction) {
    if (action === 'undo' || action === 'redo') {historyStep(action); return;}
    edit(current => action === 'backspace' ? deletePadBackward(current)
      : action === 'enter' ? insertPadText(current, '\n') : action === 'space' ? insertPadText(current, ' ')
      : action === 'slot' ? nextPadSlot(current) : movePadCaret(current, action));
  }

  function chooseMode(next: 'device' | 'math') {
    if (composing.current) return;
    const node = field.current;
    // Android may retain an already-open native keyboard until focus changes.
    // This happens only after the learner explicitly chooses their input method.
    if (node) {node.inputMode = next === 'math' ? 'none' : 'text'; node.blur();}
    setMode(next); focusAfterEdit.current = true;
    node?.focus({preventScroll:true});
  }

  function showKeyboard(next: boolean) {
    if (composing.current) return;
    setShown(next);
    if (keyboardPreferenceKey) {try {localStorage.setItem(keyboardPreferenceKey, next ? 'shown' : 'hidden');} catch { /* In-memory preference still works. */ }}
    chooseMode(next ? 'math' : 'device');
  }

  function keepSelection(event: PointerEvent<HTMLButtonElement>) {
    if (document.activeElement === field.current) event.preventDefault();
  }

  const selection = previewLocalTutorExcerpt(value.text.slice(valueSelection.start, valueSelection.end));
  const suggestions = compositionActive ? [] : padSuggestions(valueSelection);
  const assist = isFlagOn('equationAssist');
  const notation = assist && !compositionActive ? padNotationSuggestion(valueSelection) : null;
  return <section aria-label="Local Pad editor" className="local-pad">
    <label htmlFor={id}>Pad notes</label>
    <p id={id + '-hint'}>Write normally, or use $…$ for inline math and $$…$$ for display math.</p>
    <textarea ref={field} id={id} aria-describedby={id + '-hint'} className="local-pad-paper" rows={7}
      value={compositionText ?? value.text} inputMode={mode === 'math' ? 'none' : 'text'}
      onBeforeInput={() => {
        if (!composing.current && field.current) history.current = changePadText(history.current, snapshot(field.current));
      }}
      onChange={event => {
        if (composing.current) setCompositionText(event.currentTarget.value);
        else publish(snapshot(event.currentTarget));
      }}
      onSelect={event => trackSelection(event.currentTarget)}
      onKeyDown={event => {
        if (composing.current || event.nativeEvent.isComposing || (!event.ctrlKey && !event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 'z' || key === 'y') {event.preventDefault(); historyStep(key === 'y' || event.shiftKey ? 'redo' : 'undo');}
      }}
      onCompositionStart={event => {
        composing.current = true; compositionBefore.current = snapshot(event.currentTarget);
        setFrozenSource(event.currentTarget.value); setCompositionText(event.currentTarget.value);
      }}
      onCompositionEnd={event => {
        composing.current = false;
        publish(snapshot(event.currentTarget));
        compositionBefore.current = null; setFrozenSource(null); setCompositionText(null);
      }}/>
    {warning && <p role="status" className="pad-edit-warning">{warning}</p>}
    {assist && <EquationAssist value={valueSelection} composing={compositionActive} keepSelection={keepSelection}
      syncSelection={() => {if (field.current) trackSelection(field.current);}}
      onApply={(previous, selection, candidate) => edit(current =>
        current.text === previous.text && current.start === previous.start && current.end === previous.end
          ? applyEquationCandidate(current, selection, candidate) : null, false)}/>}
    {notation && <div className="local-pad-controls" role="group" aria-label="Notation suggestions">
      <button type="button" onPointerDown={keepSelection} onClick={() => edit(current => {
        const match = padNotationSuggestion(current);
        return match?.template === notation.template ? applyPadNotation(current, match) : null;
      }, false)}>{notation.template} slot</button>
    </div>}
    <PadMathKeyboard shown={shown} mode={mode} nativeKeyboardOpen={nativeKeyboardOpen} composing={compositionActive}
      canUndo={history.current.past.length > 0} canRedo={history.current.future.length > 0} hasSlot={!!nextPadSlot(valueSelection)}
      onShown={showKeyboard} onMode={chooseMode} keepSelection={keepSelection}
      onSymbol={symbol => edit(current => insertPadSymbol(current, symbol))}
      onTemplate={template => edit(current => insertPadTemplate(current, template))} onAction={keyboardAction}/>
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
