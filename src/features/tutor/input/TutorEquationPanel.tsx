import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Delete, Download, LoaderCircle, NotebookPen, RotateCcw, Trash2, Undo2} from 'lucide-react';
import {MathText} from '../../../ui/MathText';
import {InkCanvas} from '../../../ui/v7/ink/InkCanvas';
import {clearPadInk, initializePadInk, PAD_PAPER, undoPadInk, type PadInkHistory, type PadStrokes} from '../../../ui/v7/ink/ink';
import {haptic} from '../../../ui/v7/haptics';
import {EQUATION_MODEL_BYTES} from './equationModel';
import {equationModelCached, recognizeEquation} from './equationRecognizer';
import {symbolById} from './symbolCatalog';

type Reading =
  | {phase: 'empty' | 'ask' | 'reading'}
  | {phase: 'download'; loaded: number}
  | {phase: 'result'; latex: string}
  | {phase: 'error'; message: string};

/** A pause this long after the last stroke reads the equation, as Gboard's handwriting does. */
const PAUSE = 650;

/** The pieces an equation is built from, after the drawing: common variables, relations and structures. */
export const EQUATION_KEYS: readonly (readonly [label: string, insert: string, name?: string])[] = [
  ['x', 'x'], ['y', 'y'], ['z', 'z'], ['n', 'n'], ['k', 'k'], ['i', 'i'], ['f', 'f'],
  ['=', ' = '], ['+', ' + '], ['−', ' − '], ['<', ' < '], ['≤', ' ≤ '], ['(', '('], [')', ')'],
  ['a/b', '(□)/(□)', 'Fraction'], ['xⁿ', '^', 'Superscript'], ['xₙ', '_', 'Subscript'], ['√', '√(□)', 'Square root'],
  ['∞', '∞'], ['…', '…'],
];

export type EquationSymbols = {
  /** Draw single symbols is on: the drawing is also read as one symbol, on the device. */
  enabled: boolean;
  ids: readonly string[];
  actionable: boolean;
  onAccept: (id: string) => void;
  /** The ink as drawn, in pixels of the paper, for the symbol reader. */
  onInk: (strokes: PadStrokes, size: {width: number; height: number}) => void;
};

/**
 * N221 (Owner): equation mode. The keys give way to paper while the strip stays: draw a symbol or a whole equation
 * and the strip offers what it reads, the equation (Pix2Text MFR, on the device, after a one-time download the
 * learner agrees to) first and the single symbols (the Draw single symbols reader) after it. Under the paper, one
 * row of the variables and structures an equation is built from. The paper is wider and taller than the panel and
 * scrolls both ways: two fingers, a wheel or the scroll bars.
 */
export function TutorEquationPanel({disabled, replacing, leading, trailing, symbols, onInsert, onKey, onDelete, onScratch}: {
  disabled: boolean;
  /** Set when the learner chose Write by hand for an equation already in the answer. */
  replacing?: string;
  /** The strip's own ends: Keys at the left, Equation mode at the right, so the strip keeps its frame. */
  leading: ReactNode;
  trailing: ReactNode;
  symbols: EquationSymbols;
  onInsert: (latex: string) => boolean;
  onKey: (text: string) => void;
  onDelete: () => void;
  onScratch?: () => void;
}) {
  const [history, setHistory] = useState<PadInkHistory>(() => initializePadInk()!);
  const [reading, setReading] = useState<Reading>({phase: 'empty'});
  /** The reader is on this device (cached, or it read something this session). */
  const ready = useRef<boolean | null>(null);
  /** The learner agreed to the one-time download. */
  const consented = useRef(false);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const megabytes = Math.round(EQUATION_MODEL_BYTES / 1e6);
  const sheet = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const size = () => {
    const box = sheet.current?.getBoundingClientRect();
    return box?.width && box.height ? {width: box.width, height: box.height} : {width: PAD_PAPER.width, height: PAD_PAPER.height};
  };
  /** The canvas stretches its 640 × 400 paper over the sheet; read the writing in the sheet's own proportions. */
  const asWritten = (strokes: PadStrokes): PadStrokes => {
    const {width, height} = size();
    const squash = (height / PAD_PAPER.height) / (width / PAD_PAPER.width);
    return strokes.map(stroke => stroke.map(point => ({x: point.x, y: point.y * squash})));
  };

  useEffect(() => {
    let live = true;
    void equationModelCached().then(cached => {if (live) ready.current = cached;}, () => {if (live) ready.current = false;});
    return () => {live = false; run.current++; clearTimeout(timer.current);};
  }, []);

  async function read(strokes: PadStrokes) {
    const current = ++run.current;
    // Nothing downloads without the learner's yes: offer the download unless the reader is already here.
    if (!ready.current && !consented.current) {
      const cached = await equationModelCached().catch(() => false);
      if (current !== run.current) return;
      if (!cached) {setReading({phase: 'ask'}); return;}
      ready.current = true;
    }
    setReading(ready.current ? {phase: 'reading'} : {phase: 'download', loaded: 0});
    try {
      const latex = await recognizeEquation(asWritten(strokes), 3, loaded => {
        if (current === run.current) setReading(state => state.phase === 'download' ? {phase: 'download', loaded} : state);
      });
      ready.current = true;
      if (current === run.current) setReading(latex.trim() ? {phase: 'result', latex} : {phase: 'error', message: 'Nothing to read yet.'});
    } catch (error) {
      if (current === run.current) setReading({phase: 'error', message: error instanceof Error ? error.message : 'Could not read it.'});
    }
  }
  function change(next: PadInkHistory) {
    setHistory(next);
    clearTimeout(timer.current);
    run.current++;
    symbols.onInk(next.strokes, size());
    if (!next.strokes.length) {setReading({phase: 'empty'}); return;}
    if (reading.phase === 'ask' && !consented.current) return;
    if (ready.current) setReading(state => state.phase === 'result' ? state : {phase: 'reading'});
    timer.current = setTimeout(() => void read(next.strokes), PAUSE);
  }
  function clear() {
    run.current++;
    clearTimeout(timer.current);
    setHistory(current => clearPadInk(current));
    setReading({phase: 'empty'});
    symbols.onInk([], size());
    paper.current?.scrollTo({left: 0, top: 0});
  }
  function insert() {
    if (reading.phase !== 'result' || disabled || !onInsert(reading.latex)) return;
    haptic('snap');
    clear();
  }
  function insertSymbol(id: string) {
    if (disabled || !symbols.actionable) return;
    symbols.onAccept(id);
    clear();
  }

  // Room in the strip: the equation's reading or its status first, then as many single symbols as still fit.
  const busy = reading.phase !== 'empty';
  const shownSymbols = symbols.enabled && history.strokes.length ? symbols.ids.slice(0, busy ? 2 : 4) : [];
  const empty = !history.strokes.length;
  return <section className="tutor-equation" aria-label="Equation mode">
    <div className="strip tutor-equation-strip">
      {leading}
      <div className="tutor-equation-candidates" role="group" aria-label="Equation suggestions" aria-live="polite">
        {reading.phase === 'result' && <button type="button" className="tutor-equation-reading" aria-label={'Insert equation ' + reading.latex}
          disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={insert}>
          <MathText source={'$' + reading.latex + '$'}/>
        </button>}
        {shownSymbols.map(id => {
          const symbol = symbolById(id);
          return symbol && <button key={id} type="button" className="tutor-equation-symbol" aria-label={'Insert symbol ' + symbol.name}
            disabled={disabled || !symbols.actionable} onPointerDown={event => event.preventDefault()} onClick={() => insertSymbol(id)}>{symbol.glyph}</button>;
        })}
        {reading.phase === 'reading' && <span className="tutor-equation-status"><LoaderCircle className="tutor-ink-spinner" aria-hidden="true"/>Reading…</span>}
        {reading.phase === 'download' && <span className="tutor-equation-status">
          <progress max={EQUATION_MODEL_BYTES} value={reading.loaded} aria-label="Equation reader download"/>
          {Math.round(reading.loaded / 1e6)}/{megabytes} MB
        </span>}
        {reading.phase === 'ask' && <button type="button" className="tutor-equation-ask" disabled={disabled}
          aria-label={`Read equations on this device (one-time download, ${megabytes} MB)`}
          onPointerDown={event => event.preventDefault()} onClick={() => {consented.current = true; void read(history.strokes);}}>
          <Download aria-hidden="true"/><span>Read equation</span><small>{megabytes} MB</small>
        </button>}
        {reading.phase === 'error' && <span className="tutor-equation-status" role="alert"><span>{reading.message}</span>
          <button type="button" className="tutor-equation-retry" aria-label="Try again" onClick={() => void read(history.strokes)}>
            <RotateCcw aria-hidden="true"/></button></span>}
        {empty && <span className="tutor-equation-hint">{replacing ? 'Write the equation again' : 'Write a symbol or an equation'}</span>}
      </div>
      {trailing}
    </div>
    <div className="tutor-equation-paper" ref={paper}>
      <div className="tutor-equation-sheet" ref={sheet}>
        <InkCanvas history={history} onChange={change} mode={disabled ? 'hand' : 'pen'} width={3} label="Write an equation" panTouches={2}
          onPan={(dx, dy) => {const view = paper.current; if (view) {view.scrollLeft -= dx; view.scrollTop -= dy;}}}/>
      </div>
    </div>
    <div className="tutor-equation-tools">
      <button type="button" className="sbtn" aria-label="Undo stroke" disabled={disabled || !history.undo.length}
        onPointerDown={event => event.preventDefault()} onClick={() => change(undoPadInk(history))}><Undo2 aria-hidden="true"/></button>
      <button type="button" className="sbtn" aria-label="Clear writing" disabled={disabled || empty}
        onPointerDown={event => event.preventDefault()} onClick={clear}><Trash2 aria-hidden="true"/></button>
      {onScratch && <button type="button" className="sbtn" aria-label="Scratch pad" disabled={disabled}
        onPointerDown={event => event.preventDefault()} onClick={onScratch}><NotebookPen aria-hidden="true"/></button>}
    </div>
    <div className="tutor-equation-keys" role="group" aria-label="Equation keys">
      <div className="tutor-equation-key-scroll">
        {EQUATION_KEYS.map(([label, text, name]) => <button key={label} type="button" aria-label={name ?? label} disabled={disabled}
          onPointerDown={event => event.preventDefault()} onClick={() => {haptic('key'); onKey(text);}}>{label}</button>)}
      </div>
      <button type="button" className="tutor-equation-delete" aria-label="Delete" disabled={disabled}
        onPointerDown={event => event.preventDefault()} onClick={() => {haptic('key'); onDelete();}}><Delete aria-hidden="true"/></button>
    </div>
  </section>;
}
