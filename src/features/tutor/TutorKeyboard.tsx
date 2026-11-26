import {memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode, type RefObject} from 'react';
import {ArrowBigUp, ArrowBigUpDash, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, Delete, Keyboard, Search} from 'lucide-react';
import {haptic} from '../../ui/v7/haptics';
import {notation} from './notation';
import {correctTap, needsTapCorrection, prepareTapCorrection, type KeyBox} from './tapCorrection';
import type {KeyboardLayout} from './keyboardLayout';
import type {KeyTouch} from './writingAid/decoder/ngramSpatial';

const keepSelection = (event: PointerEvent) => event.preventDefault();
/** How long a key's enlarged preview stays after the finger lifts (Gboard keeps it briefly, so a quick tap is seen). */
const PREVIEW_LINGER = 110;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  || typeof document !== 'undefined' && document.documentElement.hasAttribute('data-v7-reduce-effects');

/** N249: drawing one symbol over the keys (useKeyInk). Absent when the flag is off or the answer cannot be edited. */
export interface KeyboardInk {
  bind?: Pick<HTMLAttributes<HTMLElement>, 'onPointerDownCapture' | 'onPointerMoveCapture' | 'onPointerUpCapture'
    | 'onPointerCancelCapture' | 'onClickCapture'>;
  attach: (node: HTMLElement | null) => void;
  canvas: RefObject<HTMLCanvasElement | null>;
  /** Spoken only: what happened to the drawing. */
  status: string;
}

/** N252: the letter rows, top to bottom. */
const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
/** Where each letter row starts in Gboard's frame, in key pitches from Q (the decoder's touch model is in that frame). */
const GBOARD_ROW_START = [0, .5, 1.5];
/** iPadOS's secondary characters: grey above the letter, typed by holding the key. The top row keeps its digits. */
const IPAD_ALTS: Readonly<Record<string, string>> = {
  a: '@', s: '#', d: '$', f: '&', g: '*', h: '(', j: ')', k: "'", l: '"', z: '%', x: '-', c: '+', v: '=', b: '/', n: ';', m: ':',
};
/** iPad key widths in letter keys, each row 12.6 keys across, as iPadOS's full-size keyboard. */
const IPAD = {tab: 1.3, back: 1.3, caps: 1.75, enter: 1.85, wideEnter: 2.6, shiftL: 2.3, shiftR: 1.3, maths: 1.3, mode: 1.6, space: 6.8, hide: 1.3};

interface KeyHold {
  key: string;
  pointer: number;
  x: number;
  fired: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * N252: on an iPad (layout `ipad`) the keys follow iPadOS's own full-size keyboard instead: tab and delete beside the top
 * row, caps lock and return beside the second, a shift at each end of the third with `!,` and `?.` keys, and a bottom
 * row of the maths key (where iPadOS has its emoji key) · .?123 · space · .?123 · hide keyboard. Secondary characters
 * stand grey above their letters and are typed by holding the key (a flick would draw over the keys, N249); there is
 * no enlarged preview, as on iPadOS.
 *
 * N220: elsewhere the answer keyboard follows Gboard's phone layout. Three staggered letter rows with number hints, Shift and Delete
 * a key and a half wide, and a bottom row of ?123 · comma · maths · a four-key space bar · full stop · Enter. A pressed
 * letter shows an enlarged preview above the finger, every key gives the system's keyboard tap, and a touch near the
 * edge of a letter counts for its neighbour when only the neighbour continues a word (tap correction).
 */
export const TutorKeyboard = memo(function TutorKeyboard({view, lastMath, onView, disabled, onInsert, onDelete, onMove, onBrowse, wordBefore, ink,
  layout = 'gboard', onTab, onHide}: {
  view: string; lastMath: string; onView: (view: string) => void; disabled: boolean;
  /** `touch`: where a letter was tapped, in key pitches and rows from the top-left of the letter rows (N221 decoder). */
  onInsert: (text: string, typed?: boolean, touch?: KeyTouch) => void; onDelete: () => void;
  onMove: (direction: 'left' | 'right', count: number) => void;
  onBrowse: () => void;
  /** The letters of the word before the caret, for tap correction. */
  wordBefore?: () => string;
  ink?: KeyboardInk;
  /** N252: `ipad` draws iPadOS's keyboard; anything else Gboard's. */
  layout?: KeyboardLayout;
  /** The iPad's tab key; without it, tab types a tab. */
  onTab?: () => void;
  /** The iPad's hide-keyboard key (Gboard's layouts hide the keyboard from the strip). */
  onHide?: () => void;
}) {
  const ipad = layout === 'ipad';
  const [phrasePage, setPhrasePage] = useState(0);
  const [shift, setShift] = useState<'off' | 'once' | 'locked'>('off');
  const lastShift = useRef(0);
  const hold = useRef<KeyHold | null>(null);
  const skipClick = useRef<string | null>(null);
  const pressed = useRef<HTMLButtonElement | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const attachInk = ink?.attach;
  const setRows = useCallback((node: HTMLDivElement | null) => {rows.current = node; attachInk?.(node);}, [attachInk]);
  /** `first`: on an iPad, the first letter of the pressed key's row (its rows are staggered differently from Gboard's). */
  const touch = useRef<{x: number; y: number; at: number; q?: DOMRect; first?: DOMRect} | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actions = useRef({onInsert, onDelete, onMove, disabled});
  useLayoutEffect(() => {actions.current = {onInsert, onDelete, onMove, disabled};}, [onInsert, onDelete, onMove, disabled]);
  useEffect(() => {if (view === 'abc') void prepareTapCorrection();}, [view]);
  const hidePreview = (linger: boolean) => {
    const preview = popup.current;
    clearTimeout(previewTimer.current);
    if (!preview) return;
    if (!linger || preview.style.visibility === 'hidden' || reducedMotion()) {preview.style.visibility = 'hidden'; preview.removeAttribute('data-leaving'); return;}
    preview.setAttribute('data-leaving', '');
    previewTimer.current = setTimeout(() => {preview.style.visibility = 'hidden'; preview.removeAttribute('data-leaving');}, PREVIEW_LINGER);
  };
  useEffect(() => () => {
    clearTimeout(hold.current?.timer);
    hold.current = null;
    pressed.current?.style.removeProperty('--tutor-key-press');
    pressed.current?.classList.remove('sliding');
    pressed.current = null;
    clearTimeout(previewTimer.current);
    if (popup.current) {popup.current.style.visibility = 'hidden'; popup.current.removeAttribute('data-leaving');}
  }, [view, disabled]);
  /** The letter keys' boxes, for tap correction. */
  const letterBoxes = (): KeyBox[] => [...(rows.current?.querySelectorAll<HTMLButtonElement>('.row .k.ch[data-letter]') ?? [])].map(button => {
    const box = button.getBoundingClientRect();
    return {letter: button.dataset.letter!, x: box.left, y: box.top, width: box.width, height: box.height};
  });
  /** A tap in the decoder's key units: q's cell is the unit (a pitch wide, a row tall), measured from its top-left. */
  const keyTouch = (point: {x: number; y: number}, q?: Pick<KeyBox, 'x' | 'y' | 'width' | 'height'>): KeyTouch | undefined =>
    q && q.width > 0 && q.height > 0 ? {x: (point.x - q.x) / q.width, y: (point.y - q.y) / q.height} : undefined;
  /** N252: an iPad tap moved into Gboard's frame: its distance from the first letter of its row, plus where that row
   *  starts on Gboard, so the decoder's key centres hold on either layout. */
  const iPadTouch = (point: {x: number; y: number; q?: DOMRect; first?: DOMRect}, row: number): KeyTouch | undefined => {
    const {q, first} = point;
    return q && first && q.width > 0 && q.height > 0
      ? {x: (point.x - first.left) / q.width + GBOARD_ROW_START[row]!, y: (point.y - q.top) / q.height} : undefined;
  };
  function key(label: string, action: () => void, options: {style?: string; icon?: ReactNode; alt?: string; printable?: boolean; letter?: string;
    /** N252: the key's width in letter keys (iPad rows); `id` tells apart two keys with one label (the iPad's two shifts). */
    grow?: number; id?: string;} = {}) {
    const {style = '', icon, alt, printable, letter, grow, id} = options;
    const swallowing = (event: PointerEvent<HTMLButtonElement>) => {
      const current = hold.current;
      if (!current || current.pointer !== event.pointerId) return;
      clearTimeout(current.timer);
      if (current.fired) skipClick.current = current.key;
      hold.current = null;
      event.currentTarget.style.removeProperty('--tutor-key-press');
      event.currentTarget.classList.remove('sliding');
      hidePreview(event.type === 'pointerup');
    };
    return <button type="button" key={id ?? label} className={'k ' + style} aria-label={label} disabled={disabled}
      data-letter={letter} style={grow === undefined ? undefined : {flexGrow: grow}}
      aria-pressed={label === 'Shift' || label === 'Caps lock on' ? shift !== 'off' : label === 'Caps lock' ? shift === 'locked' : undefined}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        keepSelection(event);
        skipClick.current = null;
        haptic('key');
        const preview = printable && !ipad ? popup.current : null;
        const keyboard = preview?.parentElement?.getBoundingClientRect();
        const cell = preview ? event.currentTarget.querySelector('.kl')?.getBoundingClientRect() : undefined;
        const q = letter ? rows.current?.querySelector('[data-letter="q"]')?.getBoundingClientRect() : undefined;
        const first = letter && ipad ? event.currentTarget.parentElement?.querySelector('[data-letter]')?.getBoundingClientRect() : undefined;
        touch.current = {x: event.clientX, y: event.clientY, at: Date.now(), q, first};
        pressed.current = event.currentTarget;
        event.currentTarget.style.setProperty('--tutor-key-press', 'var(--key-down)');
        const current: KeyHold = {key: label, pointer: event.pointerId, x: event.clientX, fired: false};
        hold.current = current;
        clearTimeout(previewTimer.current);
        if (popup.current && !preview) {popup.current.style.visibility = 'hidden'; popup.current.removeAttribute('data-leaving');}
        if (preview && keyboard && cell) {
          preview.style.minWidth = Math.round(Math.max(48, cell.width + 16)) + 'px';
          preview.style.left = Math.max(30, Math.min(keyboard.width - 30, cell.left + cell.width / 2 - keyboard.left)) + 'px';
          preview.style.top = cell.top - keyboard.top + 6 + 'px';
          if (preview.firstChild) preview.firstChild.nodeValue = label;
          preview.toggleAttribute('data-glyph', !/^[A-Za-z0-9.,]$/.test(label));
          preview.removeAttribute('data-leaving');
          preview.style.visibility = 'visible';
        }
        if (label === 'Space' || label === 'Delete') event.currentTarget.setPointerCapture?.(event.pointerId);
        if (label === 'Delete') {
          const started = Date.now();
          function repeat() {
            if (actions.current.disabled) return;
            actions.current.onDelete();
            haptic('key');
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
            if (preview?.firstChild) preview.firstChild.nodeValue = alt;
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
        haptic('key');
        actions.current.onMove(steps > 0 ? 'right' : 'left', Math.abs(steps));
      }}
      onPointerUp={swallowing} onPointerCancel={swallowing} onLostPointerCapture={swallowing}
      onPointerLeave={event => {if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) swallowing(event);}}
      onClick={event => {
        if (event.detail && skipClick.current === label) {skipClick.current = null; return;}
        if (!event.detail || pressed.current !== event.currentTarget) {haptic('key'); touch.current = null;}
        pressed.current = null;
        action();
      }}>
      <span className="kl">{icon ?? label}</span>{alt && <sup>{alt}</sup>}
    </button>;
  }
  function letters(text: string, edges = false) {
    const row = LETTER_ROWS.indexOf(text);
    return [...text].map((char, index) => {
      const letter = shift === 'off' ? char : char.toUpperCase();
      const digit = 'qwertyuiop'.indexOf(char);
      const alt = digit >= 0 ? String((digit + 1) % 10) : ipad ? IPAD_ALTS[char] : undefined;
      const edge = edges && index === 0 ? ' edgeL' : edges && index === text.length - 1 ? ' edgeR' : '';
      return key(letter, () => {
        const point = touch.current;
        touch.current = null;
        const recent = point && Date.now() - point.at < 1500 ? point : null;
        const before = recent && wordBefore ? wordBefore() : '';
        const boxes = recent && needsTapCorrection(letter, before) ? letterBoxes() : [];
        const q = boxes.find(box => box.letter === 'q') ?? recent?.q;
        const typed = recent && boxes.length ? correctTap(letter, recent, boxes, before) : letter;
        onInsert(typed, true, !recent ? undefined : ipad ? iPadTouch(recent, row) : keyTouch(recent, q));
        if (shift === 'once') setShift('off');
      }, {style: 'ch' + edge + (ipad && alt ? ' dual' : ''), printable: true, letter: char, alt});
    });
  }
  /** Shift: once, twice quickly to lock, once more to release. */
  const toggleShift = () => {
    const now = Date.now();
    setShift(shift === 'off' ? 'once' : shift === 'once' && now - lastShift.current < 350 ? 'locked' : 'off');
    lastShift.current = now;
  };
  const back = key('Delete', onDelete, {style: 'fn w15 bk', icon: <Delete/>});
  const chars = (list: string[]) => list.map(char => key(char, () => onInsert(char, true), {style: 'ch sym', printable: true}));
  const hideKey = (grow?: number) => onHide && key('Hide keyboard', onHide, {grow, style: 'fn ip-hide' + (grow === undefined ? ' phrase-page' : ''),
    icon: <span className="ip-hide-icon" aria-hidden="true"><Keyboard/><ChevronDown/></span>});
  /** N252 · iPadOS's rows. Each is 12.6 letter keys across, so the letters line up as they do on the iPad. */
  function iPadRows() {
    const tab = key('Tab', () => onTab ? onTab() : onInsert('\t', true), {grow: IPAD.tab, style: 'fn ip-txt ip-l', icon: 'tab'});
    const del = key('Delete', onDelete, {grow: IPAD.back, style: 'fn ip-txt ip-r', icon: 'delete'});
    const enter = (grow: number) => key('Return', () => onInsert('\n', true), {grow, style: 'fn ip-txt ip-r', icon: 'return'});
    const shiftKey = (id: string, grow: number, side: string) => key('Shift', toggleShift, {
      id, grow, style: 'fn ip-txt ip-' + side + (shift === 'off' ? '' : ' lit'), icon: 'shift'});
    const page = (label: string, next: string, id: string, grow: number, side: string) =>
      key(label, () => onView(next), {id, grow, style: 'fn ip-txt ip-' + side});
    const punctuation = (char: string, alt: string) => key(char, () => onInsert(char, true), {style: 'ch dual', printable: true, alt});
    if (view === 'abc') return <>
      <div className="row">{tab}{letters('qwertyuiop')}{del}</div>
      <div className="row">{key('Caps lock', () => setShift(shift === 'locked' ? 'off' : 'locked'), {
        grow: IPAD.caps, style: 'fn ip-txt ip-l' + (shift === 'locked' ? ' lit' : ''),
        icon: <><span className="ip-led" aria-hidden="true"/>caps lock</>,
      })}{letters('asdfghjkl')}{enter(IPAD.enter)}</div>
      <div className="row">{shiftKey('shift-left', IPAD.shiftL, 'l')}{letters('zxcvbnm')}{punctuation(',', '!')}{punctuation('.', '?')}
        {shiftKey('shift-right', IPAD.shiftR, 'r')}</div>
    </>;
    if (view === 'num') return <>
      <div className="row">{tab}{chars([...'1234567890'])}{del}</div>
      <div className="row">{chars(['+', '−', '×', '÷', '=', '<', '>', '(', ')', '/'])}{enter(IPAD.wideEnter)}</div>
      <div className="row">{page('#+=', 'num2', 'more-left', IPAD.shiftL, 'l')}{chars(['^', '_', "'", ':', ';', '!', '?', ',', '.'])}
        {page('#+=', 'num2', 'more-right', IPAD.shiftR, 'r')}</div>
    </>;
    return <>
      <div className="row">{tab}{chars(['²', '³', 'ⁿ', '⁻¹', '₀', '₁', 'ₙ', '°', '′', '″'])}{del}</div>
      <div className="row">{chars(['[', ']', '{', '}', '|', '\\', '%', '#', '&', '@'])}{enter(IPAD.wideEnter)}</div>
      <div className="row">{page('123', 'num', 'digits-left', IPAD.shiftL, 'l')}{chars(['·', '…', '∘', '≈', '±', '∞', '~', '*', '$'])}
        {page('123', 'num', 'digits-right', IPAD.shiftR, 'r')}</div>
    </>;
  }
  function iPadBottom() {
    const mode = view === 'abc' ? '.?123' : 'ABC';
    const toggle = () => onView(view === 'abc' ? 'num' : 'abc');
    return <div className="row bottom">
      {key('Maths symbols', () => onView(lastMath), {grow: IPAD.maths, style: 'fn ip-sym', icon: lastMath === 'Phrases' ? 'Aa' : '∀∃'})}
      {key(mode, toggle, {id: 'mode-left', grow: IPAD.mode, style: 'fn ip-txt'})}
      {key('Space', () => onInsert(' ', true), {grow: IPAD.space, style: 'space', icon: <span aria-hidden="true"/>})}
      {key(mode, toggle, {id: 'mode-right', grow: IPAD.mode, style: 'fn ip-txt'})}
      {hideKey(IPAD.hide)}
    </div>;
  }
  const phrases = view === 'Phrases';
  const math = phrases ? notation[view].slice(phrasePage * 9, (phrasePage + 1) * 9) : notation[view];
  return <div className="rows" data-view={view} data-layout={ipad ? 'ipad' : undefined} ref={setRows} data-key-ink={ink?.bind ? '' : undefined} {...ink?.bind}>
    <div className="tutor-key-preview" aria-hidden="true" ref={popup} style={{visibility: 'hidden'}}>{'\u00a0'}</div>
    {ink?.bind && <canvas className="tutor-key-ink" ref={ink.canvas} aria-hidden="true"/>}
    {ink && <span className="tutor-key-ink-status" role="status" aria-live="polite">{ink.status}</span>}
    {math ? <>
      <div className="cats" role="group" aria-label="Math categories">{Object.keys(notation).map(name =>
        <button key={name} type="button" disabled={disabled} className={view === name ? 'cur' : ''} aria-pressed={view === name}
          onPointerDown={keepSelection} onClick={() => {haptic('key'); onView(name);}}>{name}</button>)}</div>
      <div className={'grid' + (phrases ? ' two' : '')} role="group" aria-label={view + ' keys'}>
        {math.map(([label, text]) => key(label, () => onInsert(text), {
          style: phrases ? 'txt' : label.length <= 2 ? 'sym' : 'mid',
          printable: !phrases && label.length <= 2,
        }))}
      </div>
      <div className="row bottom catbar">
        {key('ABC', () => onView('abc'), {style: 'fn pill lbl abc'})}
        {key('Browse symbols', onBrowse, {style: 'fn phrase-page', icon: <Search aria-hidden="true"/>})}
        {phrases && key(phrasePage ? 'Previous phrase page' : 'Next phrase page', () => setPhrasePage(page => 1 - page), {
          style: 'fn phrase-page', icon: phrasePage ? <ChevronLeft aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>,
        })}
        {back}
        {ipad && hideKey()}
      </div>
    </> : ipad ? <>{iPadRows()}{iPadBottom()}</> : <>
      {view === 'abc' ? <>
        <div className="row">{letters('qwertyuiop')}</div>
        <div className="row">{letters('asdfghjkl', true)}</div>
        <div className="row">{key(shift === 'locked' ? 'Caps lock on' : 'Shift', toggleShift, {style: 'fn w15' + (shift === 'off' ? '' : ' lit'), icon: shift === 'locked' ? <ArrowBigUpDash fill="currentColor"/> : <ArrowBigUp fill={shift === 'once' ? 'currentColor' : 'none'}/>})}{letters('zxcvbnm')}{back}</div>
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
        {key(',', () => onInsert(',', true), {style: 'ch tint', printable: true})}
        {key('Maths symbols', () => onView(lastMath), {style: 'fn sym2', icon: lastMath === 'Phrases' ? 'Aa' : '∀∃'})}
        {key('Space', () => onInsert(' ', true), {style: 'space', icon: <span aria-hidden="true"/>})}
        {key('.', () => onInsert('.', true), {style: 'ch tint', printable: true})}
        {key('New line', () => onInsert('\n', true), {style: 'go w15', icon: <CornerDownLeft/>})}
      </div>
    </>}
  </div>;
});
