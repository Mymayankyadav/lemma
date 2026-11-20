import {useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import {ArrowBigUp, ArrowBigUpDash, ArrowDown, ArrowUp, ChevronDown, CornerDownLeft, Delete, HelpCircle, Keyboard, Paperclip, Camera, Pencil, Undo2} from 'lucide-react';
import {TutorInkTray,type TutorInkState} from './TutorInk';
import {Button,IconButton} from '../../ui/v7/components';
import {MathText} from '../../ui/MathText';
import {haptic} from '../../ui/v7/haptics';
import {
  changePadText, createPadTextHistory, deletePadBackward, movePadCaret, padEdit, redoPadText, undoPadText,
  type PadEdit, type PadTextHistory,
} from '../pad/padEdit';
import {applyNotationSuggestion, findNotationSlot, insertNotation, notation, notationSuggestions, typedNotation} from './notation';

const keepSelection = (event: PointerEvent) => event.preventDefault();
const EMPTY_CONTEXT: readonly string[] = [];

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  onAsk: (kind: 'hint' | 'stuck' | 'notation') => void;
  hintLevel?: number;
  canSend: boolean;
  readOnly: boolean;
  pending: boolean;
  onContext: () => void;
  hasContext: boolean;
  notationContext?: readonly string[];
  ink?: TutorInkState;
  canQueueImage?: boolean;
}

export function TutorComposer(props: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [scratch,setScratch]=useState(false),[photo,setPhoto]=useState(false);
  const [shown, setShown] = useState(false);
  const [view, setView] = useState('abc');
  const [lastMath, setLastMath] = useState('∀∃');
  const [native, setNative] = useState(false);
  const composition = useRef(false);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const composing = compositionText !== null;
  const history = useRef(createPadTextHistory(padEdit(props.value)));
  const [cursor, setCursor] = useState(history.current.present);
  const pendingSelection = useRef<PadEdit | null>(history.current.present);
  const [recent, setRecent] = useState<string[]>([]);
  const [keptWords, setKeptWords] = useState<readonly string[]>([]);
  const automatic = useRef<{before: PadTextHistory; after: PadEdit} | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const keyboard = useRef<HTMLDivElement>(null);
  const context = props.notationContext ?? EMPTY_CONTEXT;
  const suggestions = useMemo(() => notationSuggestions(cursor, context, recent), [cursor, context, recent]);
  const incomplete = props.value.includes('□');
  const hasImage=Boolean(props.ink?.draft.strokes.length||props.ink?.draft.photos.length);
  const queue=props.canQueueImage&&hasImage;
  const blocked = !queue&&(!props.canSend || props.readOnly) || incomplete || composing;
  const editingDisabled = props.readOnly || composing;

  useLayoutEffect(() => {
    const input = field.current;
    const page = input?.closest<HTMLElement>('.lemma-tutor');
    const viewport = window.visualViewport;
    if (!native || !input || !page || !viewport) return;

    function fit() {
      if (!input || !page || !viewport) return;
      // Mobile Safari and Chrome can leave the layout viewport full-height
      // while the keyboard covers its lower portion. Android adjustResize
      // already resizes the layout, so the page continues to use 100dvh.
      const focused = document.activeElement === input;
      const covered = viewport.scale === 1 && window.innerHeight - viewport.height > 120;
      if (focused && covered) page.style.setProperty('--tutor-visual-height', Math.floor(viewport.height) + 'px');
      else page.style.removeProperty('--tutor-visual-height');

      if (!focused || viewport.scale !== 1) return;
      const box = input.getBoundingClientRect();
      const bottom = viewport.height + viewport.offsetTop;
      if (box.top < viewport.offsetTop || box.bottom > bottom) input.scrollIntoView?.({block: 'nearest'});
    }
    fit();
    viewport.addEventListener('resize', fit);
    window.addEventListener('resize', fit);
    input.addEventListener('focus', fit);
    input.addEventListener('blur', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      window.removeEventListener('resize', fit);
      input.removeEventListener('focus', fit);
      input.removeEventListener('blur', fit);
      page.style.removeProperty('--tutor-visual-height');
    };
  }, [native]);

  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    input.style.height = '44px';
    input.style.height = Math.min(120, Math.max(44, input.scrollHeight)) + 'px';
    if (history.current.present.text !== props.value) {
      automatic.current = null;
      history.current = createPadTextHistory(padEdit(props.value));
      setCursor(history.current.present);
      pendingSelection.current = history.current.present;
    }
    const edit = pendingSelection.current;
    if (edit) {
      input.setSelectionRange(edit.start, edit.end, edit.direction);
      pendingSelection.current = null;
    }
  }, [props.value, compositionText]);

  useLayoutEffect(() => {
    if (strip.current) strip.current.scrollLeft = 0;
  }, [cursor]);

  useLayoutEffect(() => {
    const board = keyboard.current;
    const page = board?.closest<HTMLElement>('.lemma-tutor');
    if (!board || !page?.clientHeight) return;
    const bottom = page.getBoundingClientRect().top + page.clientTop + page.clientHeight;
    const clipped = Math.ceil(board.getBoundingClientRect().bottom - bottom);
    // Move only the outer tutor pane. The transcript and the key rows each
    // have their own scrolling and should retain their positions.
    if (clipped > 0) page.scrollTop += clipped;
  }, [shown, view]);

  function fieldSelection(input: HTMLTextAreaElement) {
    return padEdit(input.value, input.selectionStart, input.selectionEnd, input.selectionDirection);
  }
  function remember() {
    const input = field.current;
    if (!input || composition.current) return;
    const edit = fieldSelection(input);
    const present = history.current.present;
    if (edit.text !== present.text || (edit.start === present.start && edit.end === present.end && edit.direction === present.direction)) return;
    history.current = {...history.current, present: edit};
    setCursor(edit);
  }
  function commit(next: PadTextHistory, focus = false, restore = true) {
    const edit = next.present;
    if (props.readOnly || edit.text.length > 2000) return;
    const changed = edit.text !== history.current.present.text;
    if (focus && !(document.activeElement instanceof HTMLButtonElement)) field.current?.focus({preventScroll: true});
    history.current = next;
    setCursor(edit);
    if (changed) {
      automatic.current = null;
      if (restore) pendingSelection.current = edit;
      props.onChange(edit.text);
    } else if (restore) {
      field.current?.setSelectionRange(edit.start, edit.end, edit.direction);
    }
  }
  function change(edit: PadEdit, focus = false) {
    commit(changePadText(history.current, edit), focus);
  }
  function noteRecent(text: string) {
    const symbol = text.trim();
    if (!symbol || symbol.includes('□') || /^[\w\s]+$/u.test(symbol) || symbol.length > 12) return;
    setRecent(old => [symbol, ...old.filter(item => item !== symbol)].slice(0, 6));
  }
  function typeText(edit: PadEdit, text: string, focus: boolean, onlyAutomatic = false) {
    const plain = insertNotation(edit, text);
    const replacement = typedNotation(edit, text, context, new Set(keptWords));
    const corrected = replacement.text !== plain.text;
    if (onlyAutomatic && !corrected) return false;
    if (replacement.text.length > 2000) return false;
    const before = history.current;
    change(replacement, focus);
    if (corrected) automatic.current = {before, after: replacement};
    return true;
  }
  function insert(text: string, typed = false) {
    remember();
    const edit = history.current.present;
    if (typed) typeText(edit, text, true);
    else change(insertNotation(edit, text), true);
    if (!typed || /[^\w\s]/u.test(text)) noteRecent(text);
  }
  function undoAutomatic(focus: boolean) {
    const fix = automatic.current;
    const edit = history.current.present;
    if (!fix || edit.text !== fix.after.text || edit.start !== fix.after.start || edit.end !== fix.after.end) return false;
    const {text, start} = fix.before.present;
    const word = text.slice(0, start).match(/[a-z]{3,24}$/i)?.[0]?.toLowerCase();
    if (word) setKeptWords(old => [word, ...old.filter(item => item !== word)].slice(0, 32));
    commit(fix.before, focus);
    return true;
  }
  function nextSlot(backward = false) {
    remember();
    const slot = findNotationSlot(history.current.present, backward);
    if (slot) change(slot, true);
  }
  function undo(redo = false) {
    commit(redo ? redoPadText(history.current) : undoPadText(history.current), true);
  }
  function changeView(next: string) {
    setView(next);
    if (notation[next]) setLastMath(next);
  }
  function send() {
    if (!blocked && (props.value.trim()||hasImage)) props.onSend(props.value);
  }

  function keys() {
    setScratch(false);
    if (native) field.current?.blur();
    setNative(false);
    setShown(true);
  }
  return <div className="keyboard-composer" data-keyboard={native ? 'native' : shown ? 'math' : 'hidden'}>
    {props.value.includes('$') && <div className="composer-preview"><MathText source={props.value}/></div>}
    {incomplete && <p className="composer-status" role="status">Fill each □ before sending.</p>}
    <form className="composer" onSubmit={event => {event.preventDefault(); send();}}>
      <div className="field">
        <textarea ref={field} aria-label="Your answer" placeholder={props.pending ? 'Draft your next answer…' : 'Write your answer…'}
          inputMode={native ? 'text' : 'none'} rows={1} maxLength={2000} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={compositionText ?? props.value} readOnly={props.readOnly} onSelect={remember} onClick={remember} onFocus={event=>{
            remember();
            if(event.currentTarget.inputMode!=='text'&&!props.readOnly){setShown(true);setScratch(false);}
          }}
          onPointerDown={() => {
            if (!shown && !native && !props.readOnly) {
              setShown(true);
            }
          }}
          onCompositionStart={event => {
            remember();
            composition.current = true;
            setCompositionText(event.currentTarget.value);
          }}
          onCompositionEnd={event => {
            composition.current = false;
            commit(changePadText(history.current, fieldSelection(event.currentTarget)), false, false);
            setCompositionText(null);
          }}
          onChange={event => {
            const edit = fieldSelection(event.currentTarget);
            if (composition.current) setCompositionText(edit.text);
            else commit(changePadText(history.current, edit), false, false);
          }}
          onKeyDown={event => {
            if (composition.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
            const modified = event.ctrlKey || event.metaKey;
            if (event.key === 'Enter' && modified) {
              event.preventDefault();
              send();
            }
            if (!modified && !event.altKey && event.key === 'Escape' && shown) {
              event.preventDefault();
              setShown(false);
            }
            if (props.readOnly) return;
            const key = event.key.toLowerCase();
            if (modified && !event.altKey && (key === 'z' || key === 'y')) {
              event.preventDefault();
              undo(key === 'y' || event.shiftKey);
              return;
            }
            remember();
            const edit = history.current.present;
            if (!modified && !event.altKey && event.key === 'Tab' && edit.text.slice(edit.start, edit.end) === '□') {
              const slot = findNotationSlot(edit, event.shiftKey);
              if (slot && (event.shiftKey ? slot.start < edit.start : slot.start > edit.start)) {
                event.preventDefault();
                change(slot);
              }
            }
            if (modified || event.altKey) return;
            if (event.key === 'Backspace' && undoAutomatic(false)) event.preventDefault();
            if (/^[ ,.;]$/.test(event.key) && typeText(edit, event.key, false, true)) event.preventDefault();
          }}/>
        <IconButton label={queue?'Queue answer':'Send'} data-tutor-send="" type="submit" disabled={blocked || !props.value.trim()&&!hasImage}
          onPointerDown={keepSelection}><ArrowUp aria-hidden="true"/></IconButton>
      </div>
    </form>
    <div className="tbar" role="group" aria-label="Answer tools">
      {props.ink ? <>
        <Button small variant="ghost" disabled={Boolean(props.ink.draft.queuedText!==undefined)} aria-pressed={scratch}
          onClick={()=>{field.current?.blur();setNative(false);setShown(false);setScratch(value=>!value);}}><Pencil aria-hidden="true"/>Scratch</Button>
        <Button small variant="ghost" disabled={Boolean(props.ink.draft.queuedText!==undefined)} onClick={()=>setPhoto(true)}><Camera aria-hidden="true"/>Photo</Button>
      </>:<>
        <Button small variant="ghost" onClick={props.onContext}><Paperclip aria-hidden="true"/>Context</Button>
        <Button small variant="ghost" disabled={!history.current.past.length||editingDisabled}
          onPointerDown={keepSelection} onClick={()=>undo()}><Undo2 aria-hidden="true"/>Undo</Button>
      </>}
      <Button small variant="ghost" disabled={!props.canSend||editingDisabled} onClick={()=>props.onAsk('hint')}>
        <HelpCircle aria-hidden="true"/>Hint {Math.max(1,Math.min(4,props.hintLevel??1))}/4
      </Button>
      <Button small variant="ghost" disabled={!props.canSend||editingDisabled} onClick={()=>props.onAsk('stuck')}><ArrowDown aria-hidden="true"/>Stuck</Button>
      <Button small variant="ghost" aria-label="Symbols" aria-pressed={view!=='abc'&&shown} disabled={composing}
        onClick={()=>{haptic('snap');keys();changeView(!shown||view==='abc'?lastMath:'abc');}}>∑ Symbols</Button>
      <Button small variant="ghost" aria-pressed={shown&&!native} disabled={editingDisabled}
        onClick={()=>shown&&!native?setShown(false):keys()}><Keyboard aria-hidden="true"/>Keys</Button>
    </div>
    {props.ink&&<TutorInkTray ink={props.ink} shown={scratch} photoOpen={photo} onClosePhoto={()=>setPhoto(false)} onKeys={keys}/>}
    {shown ? <div className="kb" data-v7-keyboard="" ref={keyboard} role="group" aria-label="Answer keyboard">
      <div className="strip">
        <div className="sugg" ref={strip} role="group" aria-label="Suggestions">
          {incomplete && <button type="button" className="next" disabled={editingDisabled}
            onPointerDown={keepSelection} onClick={() => {haptic('snap'); nextSlot();}}>Next □</button>}
          {suggestions.map(item => <button className={item.kind} type="button" key={item.text}
            disabled={editingDisabled} onPointerDown={keepSelection} onClick={() => {
              remember();
              const edit = history.current.present;
              const next = notationSuggestions(edit, context, recent).find(suggestion => suggestion.text === item.text);
              if (!next) return;
              haptic('snap');
              change(applyNotationSuggestion(edit, next), true);
              noteRecent(item.text);
            }} aria-description={item.kind === 'fix' ? 'Spelling correction' : undefined}>{item.text}</button>)}
          {!props.pending&&<button type="button" aria-label="Ask about notation" disabled={!props.canSend||editingDisabled}
            onPointerDown={keepSelection} onClick={()=>props.onAsk('notation')}>Ask</button>}
        </div>
        <button className="sbtn" type="button" aria-label="Use device keyboard" disabled={editingDisabled} onClick={() => {
          haptic('snap');
          setNative(true);
          setShown(false);
          const input = field.current;
          if (input) {
            // Re-focus inside the gesture so iOS can open its IME from an
            // already-focused field whose input mode was set to none.
            if (document.activeElement === input) input.blur();
            input.inputMode = 'text';
            input.focus();
          }
        }}><Keyboard aria-hidden="true"/></button>
        <button className="sbtn" type="button" aria-label="Hide keyboard" onClick={() => {haptic('snap'); setShown(false);}}><ChevronDown aria-hidden="true"/></button>
      </div>
      <TutorKeyboard view={view} lastMath={lastMath} onView={changeView} disabled={editingDisabled} onInsert={insert}
        onDelete={() => {
          remember();
          if (!undoAutomatic(true)) change(deletePadBackward(history.current.present), true);
        }}
        onMove={(direction, count) => {
          remember();
          let edit = history.current.present;
          for (let step = 0; step < count; step++) edit = movePadCaret(edit, direction);
          change(edit, true);
        }}/>
    </div> : null}
  </div>;
}
interface KeyHold {
  key: string;
  pointer: number;
  x: number;
  fired: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

function TutorKeyboard({view, lastMath, onView, disabled, onInsert, onDelete, onMove}: {
  view: string; lastMath: string; onView: (view: string) => void; disabled: boolean;
  onInsert: (text: string, typed?: boolean) => void; onDelete: () => void;
  onMove: (direction: 'left' | 'right', count: number) => void;
}) {
  const [shift, setShift] = useState<'off' | 'once' | 'locked'>('off');
  const lastShift = useRef(0);
  const hold = useRef<KeyHold | null>(null);
  const skipClick = useRef<string | null>(null);
  const pressTick = useRef<string | null>(null);
  const actions = useRef({onInsert, onDelete, onMove, disabled});
  useLayoutEffect(() => {actions.current = {onInsert, onDelete, onMove, disabled};}, [onInsert, onDelete, onMove, disabled]);
  useEffect(() => () => clearTimeout(hold.current?.timer), [view, disabled]);
  const activeCategory = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const selected = activeCategory.current;
    const categories = selected?.parentElement;
    if (!selected || !categories) return;
    const item = selected.getBoundingClientRect();
    const strip = categories.getBoundingClientRect();
    if (item.left < strip.left || item.right > strip.right)
      categories.scrollLeft += (item.left + item.right - strip.left - strip.right) / 2;
  }, [view]);

  function key(label: string, action: () => void, options: {style?: string; icon?: ReactNode; alt?: string; printable?: boolean} = {}) {
    const {style = '', icon, alt, printable} = options;
    const swallowing = (event: PointerEvent<HTMLButtonElement>) => {
      const current = hold.current;
      if (!current || current.pointer !== event.pointerId) return;
      clearTimeout(current.timer);
      if (current.fired) skipClick.current = current.key;
      hold.current = null;
      event.currentTarget.classList.remove('down', 'pressed', 'sliding');
    };
    return <button type="button" key={label} className={'k ' + style} aria-label={label} disabled={disabled}
      aria-pressed={label === 'Shift' || label === 'Caps lock on' ? shift !== 'off' : undefined}
      data-k={printable ? label : undefined}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        keepSelection(event);
        skipClick.current = null;
        pressTick.current = haptic('snap') ? label : null;
        event.currentTarget.classList.add('down');
        const current: KeyHold = {key: label, pointer: event.pointerId, x: event.clientX, fired: false};
        hold.current = current;
        if (printable) event.currentTarget.classList.add('pressed');
        if (label === 'Space' || label === 'Delete') event.currentTarget.setPointerCapture?.(event.pointerId);
        if (label === 'Delete') {
          const started = Date.now();
          function repeat() {
            if (actions.current.disabled) return;
            actions.current.onDelete();
            current.fired = true;
            current.timer = setTimeout(repeat, Date.now() - started > 1300 ? 40 : 75);
          }
          current.timer = setTimeout(repeat, 420);
          actions.current.onDelete();
          current.fired = true;
        } else if (alt) {
          current.timer = setTimeout(() => {
            if (actions.current.disabled) return;
            haptic('reveal');
            actions.current.onInsert(alt, true);
            current.fired = true;
          }, 380);
        }
      }}
      onPointerMove={event => {
        const current = hold.current;
        if (label !== 'Space' || current?.pointer !== event.pointerId) return;
        const steps = Math.trunc((event.clientX - current.x) / 12);
        if (!steps) return;
        current.x += steps * 12;
        current.fired = true;
        event.currentTarget.classList.add('sliding');
        haptic('snap');
        actions.current.onMove(steps > 0 ? 'right' : 'left', Math.abs(steps));
      }}
      onPointerUp={swallowing} onPointerCancel={swallowing} onLostPointerCapture={swallowing}
      onPointerLeave={event => {if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) swallowing(event);}}
      onClick={event => {
        if (event.detail && skipClick.current === label) {skipClick.current = null; return;}
        if (!event.detail || pressTick.current !== label) haptic('snap');
        pressTick.current = null;
        action();
      }}>
      <span className="kl">{icon ?? label}</span>{alt && <sup>{alt}</sup>}
    </button>;
  }
  function letters(text: string, edges = false) {
    return [...text].map((char, index) => {
      const letter = shift === 'off' ? char : char.toUpperCase();
      const digit = 'qwertyuiop'.indexOf(char);
      const edge = edges && index === 0 ? ' edgeL' : edges && index === text.length - 1 ? ' edgeR' : '';
      return key(letter, () => {
        onInsert(letter, true);
        if (shift === 'once') setShift('off');
      }, {style: 'ch' + edge, printable: true, alt: digit < 0 ? undefined : String((digit + 1) % 10)});
    });
  }
  const back = key('Delete', onDelete, {style: 'fn w15 bk', icon: <Delete/>});
  const chars = (list: string[]) => list.map(char => key(char, () => onInsert(char, true), {style: 'ch sym', printable: true}));
  const math = notation[view];
  return <div className="rows" data-view={view}>
    {math ? <>
      <div className={'grid' + (view === 'Phrases' ? ' two' : '')} role="group" aria-label={view + ' keys'}>
        {math.map(([label, text]) => key(label, () => onInsert(text), {
          style: view === 'Phrases' ? 'txt' : label.length <= 2 ? 'sym' : 'mid',
          printable: view !== 'Phrases' && label.length <= 2,
        }))}
      </div>
      <div className="row bottom catbar">
        {key('ABC', () => onView('abc'), {style: 'fn pill lbl abc'})}
        <div className="cats" role="group" aria-label="Math categories">{Object.keys(notation).map(name =>
          <button key={name} type="button" className={view === name ? 'cur' : ''} aria-pressed={view === name}
            ref={view === name ? activeCategory : undefined}
            onPointerDown={keepSelection} onClick={() => {haptic('snap'); onView(name);}}>{name}</button>)}</div>
        {back}
      </div>
    </> : <>
      {view === 'abc' ? <>
        <div className="row">{letters('qwertyuiop')}</div>
        <div className="row">{letters('asdfghjkl', true)}</div>
        <div className="row">{key(shift === 'locked' ? 'Caps lock on' : 'Shift', () => {
          const now = Date.now();
          setShift(shift === 'off' ? 'once' : shift === 'once' && now - lastShift.current < 350 ? 'locked' : 'off');
          lastShift.current = now;
        }, {style: 'fn w15' + (shift === 'off' ? '' : ' lit'), icon: shift === 'locked' ? <ArrowBigUpDash fill="currentColor"/> : <ArrowBigUp fill={shift === 'once' ? 'currentColor' : 'none'}/>})}{letters('zxcvbnm')}{back}</div>
      </> : view === 'num' ? <>
        <div className="row">{chars([...'1234567890'])}</div>
        <div className="row">{chars(['+', '−', '×', '÷', '=', '<', '>', '(', ')', '/'])}</div>
        <div className="row">{key('=\\<', () => onView('num2'), {style: 'fn w15 lbl'})}{chars(['^', '_', "'", ':', ';', '!', '?'])}{back}</div>
      </> : <>
        <div className="row">{chars(['²', '³', 'ⁿ', '⁻¹', '₀', '₁', 'ₙ', '°', '′', '″'])}</div>
        <div className="row">{chars(['[', ']', '{', '}', '|', '\\', '%', '#', '&', '@'])}</div>
        <div className="row">{key('?123', () => onView('num'), {style: 'fn w15 lbl'})}{chars(['·', '…', '∘', '≈', '±', '∞', '~'])}{back}</div>
      </>}
      <div className="row bottom">
        {key(view === 'abc' ? '?123' : 'ABC', () => onView(view === 'abc' ? 'num' : 'abc'), {style: 'fn pill w15 lbl'})}
        {key(',', () => onInsert(',', true), {style: 'ch', printable: true})}
        {key('Maths symbols', () => onView(lastMath), {style: 'fn sym2', icon: lastMath === 'Phrases' ? 'Aa' : '∀∃'})}
        {key('Space', () => onInsert(' ', true), {style: 'space', icon: 'Lemma'})}
        {key('.', () => onInsert('.', true), {style: 'ch', printable: true})}
        {key('New line', () => onInsert('\n', true), {style: 'go w15', icon: <CornerDownLeft/>})}
      </div>
    </>}
  </div>;
}
