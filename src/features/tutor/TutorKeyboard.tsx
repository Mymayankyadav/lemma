import {useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import {ArrowBigUp, ArrowBigUpDash, ChevronLeft, ChevronRight, CornerDownLeft, Delete, Search} from 'lucide-react';
import {haptic} from '../../ui/v7/haptics';
import {notation} from './notation';
import {correctTap, prepareTapCorrection, type KeyBox} from './tapCorrection';
import type {KeyTouch} from './writingAid/decoder/ngramSpatial';

const keepSelection = (event: PointerEvent) => event.preventDefault();
/** How long a key's enlarged preview stays after the finger lifts (Gboard keeps it briefly, so a quick tap is seen). */
const PREVIEW_LINGER = 110;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  || typeof document !== 'undefined' && document.documentElement.hasAttribute('data-v7-reduce-effects');

interface KeyHold {
  key: string;
  pointer: number;
  x: number;
  fired: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * N220: the answer keyboard follows Gboard's phone layout. Three staggered letter rows with number hints, Shift and Delete
 * a key and a half wide, and a bottom row of ?123 · comma · maths · a four-key space bar · full stop · Enter. A pressed
 * letter shows an enlarged preview above the finger, every key gives the system's keyboard tap, and a touch near the
 * edge of a letter counts for its neighbour when only the neighbour continues a word (tap correction).
 */
export function TutorKeyboard({view, lastMath, onView, disabled, onInsert, onDelete, onMove, onBrowse, wordBefore}: {
  view: string; lastMath: string; onView: (view: string) => void; disabled: boolean;
  /** `touch`: where a letter was tapped, in key pitches and rows from the top-left of the letter rows (N221 decoder). */
  onInsert: (text: string, typed?: boolean, touch?: KeyTouch) => void; onDelete: () => void;
  onMove: (direction: 'left' | 'right', count: number) => void;
  onBrowse: () => void;
  /** The letters of the word before the caret, for tap correction. */
  wordBefore?: () => string;
}) {
  const [phrasePage, setPhrasePage] = useState(0);
  const [shift, setShift] = useState<'off' | 'once' | 'locked'>('off');
  const lastShift = useRef(0);
  const hold = useRef<KeyHold | null>(null);
  const skipClick = useRef<string | null>(null);
  const pressed = useRef<HTMLButtonElement | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const touch = useRef<{x: number; y: number; at: number} | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actions = useRef({onInsert, onDelete, onMove, disabled});
  useLayoutEffect(() => {actions.current = {onInsert, onDelete, onMove, disabled};}, [onInsert, onDelete, onMove, disabled]);
  useEffect(() => {if (view === 'abc') void prepareTapCorrection();}, [view]);
  const hidePreview = (linger: boolean) => {
    const preview = popup.current;
    clearTimeout(previewTimer.current);
    if (!preview) return;
    if (!linger || preview.hidden || reducedMotion()) {preview.hidden = true; preview.removeAttribute('data-leaving'); return;}
    preview.setAttribute('data-leaving', '');
    previewTimer.current = setTimeout(() => {preview.hidden = true; preview.removeAttribute('data-leaving');}, PREVIEW_LINGER);
  };
  useEffect(() => () => {
    clearTimeout(hold.current?.timer);
    hold.current = null;
    pressed.current?.classList.remove('down', 'sliding');
    pressed.current = null;
    clearTimeout(previewTimer.current);
    if (popup.current) {popup.current.hidden = true; popup.current.removeAttribute('data-leaving');}
  }, [view, disabled]);
  /** The letter keys' boxes, for tap correction. */
  const letterBoxes = (): KeyBox[] => [...(rows.current?.querySelectorAll<HTMLButtonElement>('.row .k.ch[data-letter]') ?? [])].map(button => {
    const box = button.getBoundingClientRect();
    return {letter: button.dataset.letter!, x: box.left, y: box.top, width: box.width, height: box.height};
  });
  /** A tap in the decoder's key units: q's cell is the unit (a pitch wide, a row tall), measured from its top-left. */
  const keyTouch = (point: {x: number; y: number}, boxes: KeyBox[]): KeyTouch | undefined => {
    const q = boxes.find(box => box.letter === 'q');
    return q && q.width > 0 && q.height > 0 ? {x: (point.x - q.x) / q.width, y: (point.y - q.y) / q.height} : undefined;
  };
  function key(label: string, action: () => void, options: {style?: string; icon?: ReactNode; alt?: string; printable?: boolean; letter?: string} = {}) {
    const {style = '', icon, alt, printable, letter} = options;
    const swallowing = (event: PointerEvent<HTMLButtonElement>) => {
      const current = hold.current;
      if (!current || current.pointer !== event.pointerId) return;
      clearTimeout(current.timer);
      if (current.fired) skipClick.current = current.key;
      hold.current = null;
      event.currentTarget.classList.remove('down', 'sliding');
      hidePreview(event.type === 'pointerup');
    };
    return <button type="button" key={label} className={'k ' + style} aria-label={label} disabled={disabled}
      data-letter={letter}
      aria-pressed={label === 'Shift' || label === 'Caps lock on' ? shift !== 'off' : undefined}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        keepSelection(event);
        skipClick.current = null;
        haptic('key');
        touch.current = {x: event.clientX, y: event.clientY, at: Date.now()};
        pressed.current = event.currentTarget;
        event.currentTarget.classList.add('down');
        const current: KeyHold = {key: label, pointer: event.pointerId, x: event.clientX, fired: false};
        hold.current = current;
        const preview = printable ? popup.current : null;
        clearTimeout(previewTimer.current);
        if (popup.current && !preview) {popup.current.hidden = true; popup.current.removeAttribute('data-leaving');}
        if (preview) {
          const keyboard = preview.parentElement!.getBoundingClientRect();
          const cell = event.currentTarget.querySelector('.kl')!.getBoundingClientRect();
          preview.style.minWidth = Math.round(Math.max(48, cell.width + 16)) + 'px';
          preview.style.left = Math.max(30, Math.min(keyboard.width - 30, cell.left + cell.width / 2 - keyboard.left)) + 'px';
          preview.style.top = cell.top - keyboard.top + 6 + 'px';
          preview.textContent = label;
          preview.toggleAttribute('data-glyph', !/^[A-Za-z0-9.,]$/.test(label));
          preview.removeAttribute('data-leaving');
          preview.hidden = false;
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
            if (preview) preview.textContent = alt;
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
    return [...text].map((char, index) => {
      const letter = shift === 'off' ? char : char.toUpperCase();
      const digit = 'qwertyuiop'.indexOf(char);
      const edge = edges && index === 0 ? ' edgeL' : edges && index === text.length - 1 ? ' edgeR' : '';
      return key(letter, () => {
        const point = touch.current;
        touch.current = null;
        const recent = point && Date.now() - point.at < 1500 ? point : null;
        const boxes = recent ? letterBoxes() : [];
        const typed = recent && wordBefore ? correctTap(letter, recent, boxes, wordBefore()) : letter;
        onInsert(typed, true, recent ? keyTouch(recent, boxes) : undefined);
        if (shift === 'once') setShift('off');
      }, {style: 'ch' + edge, printable: true, letter: char, alt: digit < 0 ? undefined : String((digit + 1) % 10)});
    });
  }
  const back = key('Delete', onDelete, {style: 'fn w15 bk', icon: <Delete/>});
  const chars = (list: string[]) => list.map(char => key(char, () => onInsert(char, true), {style: 'ch sym', printable: true}));
  const phrases = view === 'Phrases';
  const math = phrases ? notation[view].slice(phrasePage * 9, (phrasePage + 1) * 9) : notation[view];
  return <div className="rows" data-view={view} ref={rows}>
    <div className="tutor-key-preview" aria-hidden="true" ref={popup} hidden/>
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
        {key(',', () => onInsert(',', true), {style: 'ch tint', printable: true})}
        {key('Maths symbols', () => onView(lastMath), {style: 'fn sym2', icon: lastMath === 'Phrases' ? 'Aa' : '∀∃'})}
        {key('Space', () => onInsert(' ', true), {style: 'space', icon: <span aria-hidden="true"/>})}
        {key('.', () => onInsert('.', true), {style: 'ch tint', printable: true})}
        {key('New line', () => onInsert('\n', true), {style: 'go w15', icon: <CornerDownLeft/>})}
      </div>
    </>}
  </div>;
}
