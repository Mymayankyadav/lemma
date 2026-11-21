import {useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import {ArrowBigUp, ArrowBigUpDash, ChevronLeft, ChevronRight, CornerDownLeft, Delete, MoveRight, Search} from 'lucide-react';
import {haptic} from '../../ui/v7/haptics';
import {notation} from './notation';

const keepSelection = (event: PointerEvent) => event.preventDefault();

interface KeyHold {
  key: string;
  pointer: number;
  x: number;
  fired: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export function TutorKeyboard({view, lastMath, onView, disabled, onInsert, onDelete, onMove, onNextSlot, onBrowse}: {
  view: string; lastMath: string; onView: (view: string) => void; disabled: boolean;
  onInsert: (text: string, typed?: boolean) => void; onDelete: () => void;
  onMove: (direction: 'left' | 'right', count: number) => void;
  onNextSlot?: () => void;
  onBrowse: () => void;
}) {
  const [phrasePage, setPhrasePage] = useState(0);
  const [shift, setShift] = useState<'off' | 'once' | 'locked'>('off');
  const lastShift = useRef(0);
  const hold = useRef<KeyHold | null>(null);
  const skipClick = useRef<string | null>(null);
  const pressed = useRef<HTMLButtonElement | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const actions = useRef({onInsert, onDelete, onMove, disabled});
  useLayoutEffect(() => {actions.current = {onInsert, onDelete, onMove, disabled};}, [onInsert, onDelete, onMove, disabled]);
  useEffect(() => () => {
    clearTimeout(hold.current?.timer);
    hold.current = null;
    pressed.current?.classList.remove('down', 'sliding');
    pressed.current = null;
    if (popup.current) popup.current.hidden = true;
  }, [view, disabled]);
  function key(label: string, action: () => void, options: {style?: string; icon?: ReactNode; alt?: string; printable?: boolean} = {}) {
    const {style = '', icon, alt, printable} = options;
    const swallowing = (event: PointerEvent<HTMLButtonElement>) => {
      const current = hold.current;
      if (!current || current.pointer !== event.pointerId) return;
      clearTimeout(current.timer);
      if (current.fired) skipClick.current = current.key;
      hold.current = null;
      event.currentTarget.classList.remove('down', 'sliding');
      if (popup.current) popup.current.hidden = true;
    };
    return <button type="button" key={label} className={'k ' + style} aria-label={label} disabled={disabled}
      aria-pressed={label === 'Shift' || label === 'Caps lock on' ? shift !== 'off' : undefined}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        keepSelection(event);
        skipClick.current = null;
        haptic('snap');
        pressed.current = event.currentTarget;
        event.currentTarget.classList.add('down');
        const current: KeyHold = {key: label, pointer: event.pointerId, x: event.clientX, fired: false};
        hold.current = current;
        const preview = printable ? popup.current : null;
        if (preview) {
          const keyboard = preview.parentElement!.getBoundingClientRect();
          const cell = event.currentTarget.querySelector('.kl')!.getBoundingClientRect();
          preview.style.left = Math.max(27, Math.min(keyboard.width - 27, cell.left + cell.width / 2 - keyboard.left)) + 'px';
          preview.style.top = cell.top - keyboard.top + 5 + 'px';
          preview.textContent = label;
          preview.hidden = false;
        }
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
        haptic('snap');
        actions.current.onMove(steps > 0 ? 'right' : 'left', Math.abs(steps));
      }}
      onPointerUp={swallowing} onPointerCancel={swallowing} onLostPointerCapture={swallowing}
      onPointerLeave={event => {if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) swallowing(event);}}
      onClick={event => {
        if (event.detail && skipClick.current === label) {skipClick.current = null; return;}
        if (!event.detail || pressed.current !== event.currentTarget) haptic('snap');
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
        onInsert(letter, true);
        if (shift === 'once') setShift('off');
      }, {style: 'ch' + edge, printable: true, alt: digit < 0 ? undefined : String((digit + 1) % 10)});
    });
  }
  const back = key('Delete', onDelete, {style: 'fn w15 bk', icon: <Delete/>});
  const chars = (list: string[]) => list.map(char => key(char, () => onInsert(char, true), {style: 'ch sym', printable: true}));
  const phrases = view === 'Phrases';
  const math = phrases ? notation[view].slice(phrasePage * 9, (phrasePage + 1) * 9) : notation[view];
  const slot = onNextSlot && key('Next □', onNextSlot, {style: 'fn quick-action', icon: <MoveRight aria-hidden="true"/>});
  const quick = (symbol: string) => key(symbol, () => onInsert(symbol), {style: 'fn sym', printable: true});
  return <div className="rows" data-view={view}>
    <div className="tutor-key-preview" aria-hidden="true" ref={popup} hidden/>
    {math ? <>
      <div className="cats" role="group" aria-label="Math categories">{Object.keys(notation).map(name =>
        <button key={name} type="button" disabled={disabled} className={view === name ? 'cur' : ''} aria-pressed={view === name}
          onPointerDown={keepSelection} onClick={() => {haptic('snap'); onView(name);}}>{name}</button>)}</div>
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
        {slot}{back}
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
        <div className="tutor-quick-math" role="group" aria-label="Quick math symbols">
          {quick('∀')}{quick('∈')}{slot || quick('⇒')}
        </div>
        {key('.', () => onInsert('.', true), {style: 'ch', printable: true})}
        {key('New line', () => onInsert('\n', true), {style: 'go w15', icon: <CornerDownLeft/>})}
      </div>
    </>}
  </div>;
}
