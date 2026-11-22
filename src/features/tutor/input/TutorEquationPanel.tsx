import {useEffect, useRef, useState, type ReactNode} from 'react';
import {CornerDownLeft, Delete, Download, LoaderCircle, Maximize2, Minimize2, RotateCcw, Search, Trash2, Undo2} from 'lucide-react';
import {MathText} from '../../../ui/MathText';
import {InkCanvas} from '../../../ui/v7/ink/InkCanvas';
import {clearPadInk, initializePadInk, PAD_PAPER, undoPadInk, type PadInkHistory, type PadStrokes} from '../../../ui/v7/ink/ink';
import {haptic} from '../../../ui/v7/haptics';
import {EQUATION_MODEL_BYTES} from './equationModel';
import {equationModelCached, recognizeEquation} from './equationRecognizer';
import {symbolById} from './symbolCatalog';
import {useAutoeqReadings} from './useAutoeqReadings';

type Reading =
  | {phase: 'empty' | 'ask' | 'reading'}
  | {phase: 'download'; loaded: number}
  | {phase: 'result'; latex: string}
  | {phase: 'error'; message: string};

/** A pause this long after the last stroke reads the equation, as Gboard's handwriting does. */
const PAUSE = 650;

/**
 * N223 (Owner): the composer's keys around its paper. Operations along the top, variables down the left, digits on the
 * right, symbols along the bottom. Each is [label, what it adds to the composition, accessible name].
 */
export const EQUATION_OPERATIONS = [['+', ' + '], ['−', ' − ', 'Minus'], ['×', ' × ', 'Times'], ['/', '/', 'Divided by'],
  ['=', ' = ', 'Equals'], ['<', ' < ', 'Less than'], ['>', ' > ', 'Greater than'], ['(', '('], [')', ')'], ['^', '^', 'Power']] as const;
export const EQUATION_VARIABLES = ['x', 'y', 'n', 'z', 'k', 'i', 't', 'a', 'b', 'c', 'f', 'g'] as const;
export const EQUATION_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.'] as const;
export const EQUATION_SYMBOLS = [['_', '_', 'Subscript'], ['√', '√', 'Square root'], ['π', 'π', 'Pi'], ['∞', '∞', 'Infinity'],
  ['∑', '∑', 'Sum'], ['∫', '∫', 'Integral'], ['≤', ' ≤ ', 'At most'], ['≥', ' ≥ ', 'At least'], ['≠', ' ≠ ', 'Not equal']] as const;

export type EquationSymbols = {
  /** Draw single symbols is on: the drawing is also read as one symbol, on the device. */
  enabled: boolean;
  ids: readonly string[];
  actionable: boolean;
  /** The ink as drawn, in pixels of the paper, for the symbol reader. */
  onInk: (strokes: PadStrokes, size: {width: number; height: number}) => void;
};

/** Delete one written token: a sign with its spaces, or one character. */
export const deleteComposed = (composition: string) => composition.replace(/\s*\S\s*$/u, '');

/**
 * N223 (Owner): the equation composer, in the keys' place and at their height. The learner writes an equation as
 * they would say it, `x1 + y1 = 1`, with the keys around the paper or by drawing on it; the strip offers what N222's
 * autoeq reads in it (useAutoeqReadings) and a tap puts the chosen reading in the answer as an equation. While there
 * is ink on the paper the strip offers what the drawing reads instead (the whole equation from Pix2Text MFR after a
 * one-time download the learner agrees to, single symbols from Draw single symbols), and a tap adds it to the
 * composition. The paper scrolls both ways (two fingers, a wheel or the scroll bars).
 */
export function TutorEquationPanel({disabled, replacing, leading, trailing, symbols, composition, context, onCompose, onInsert, onDelete,
  keysHidden, onKeysHidden, onSearchSymbol}: {
  disabled: boolean;
  /** Set when the learner chose Write by hand for an equation already in the answer. */
  replacing?: string;
  /** The strip's own ends: Keys at the left, Equation mode at the right, so the strip keeps its frame. */
  leading: ReactNode;
  trailing: ReactNode;
  symbols: EquationSymbols;
  composition: string;
  /** The answer just before the caret: autoeq ranks its readings by it (a circle, a sequence, a linear equation). */
  context: string;
  onCompose: (next: string) => void;
  onInsert: (latex: string) => boolean;
  /** Delete in the answer, when there is nothing composed to delete. */
  onDelete: () => void;
  /** The keys are hidden and the paper fills the composer, for writing the whole equation by hand. */
  keysHidden: boolean;
  onKeysHidden: (hidden: boolean) => void;
  /** Send the ink to Draw symbol (Detexify-style search, its own choices); what is chosen there joins the composition. */
  onSearchSymbol: (strokes: PadStrokes, size: {width: number; height: number}) => void;
}) {
  const [history, setHistory] = useState<PadInkHistory>(() => initializePadInk()!);
  const [reading, setReading] = useState<Reading>({phase: 'empty'});
  const autoeq = useAutoeqReadings(composition, context);
  /** The reader is on this device (cached, or it read something this session). */
  const ready = useRef<boolean | null>(null);
  /** The learner agreed to the one-time download. */
  const consented = useRef(false);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const megabytes = Math.round(EQUATION_MODEL_BYTES / 1e6);
  const sheet = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
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
  // Keep the end of a long composition in view.
  useEffect(() => {line.current?.scrollTo({left: line.current.scrollWidth});}, [composition]);

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
  function clearInk() {
    run.current++;
    clearTimeout(timer.current);
    setHistory(current => clearPadInk(current));
    setReading({phase: 'empty'});
    symbols.onInk([], size());
    paper.current?.scrollTo({left: 0, top: 0});
  }
  function compose(text: string) {
    if (disabled) return;
    haptic('key');
    onCompose(composition + text);
  }
  /** What the drawing reads joins the composition: a symbol as its glyph, an equation as its LaTeX. */
  function addInk(text: string) {
    if (disabled) return;
    haptic('snap');
    onCompose(composition + (composition && !/\s$/.test(composition) && /^[A-Za-z0-9\\]/.test(text) ? ' ' : '') + text);
    clearInk();
  }
  function insert(latex: string) {
    if (disabled || !onInsert(latex)) return;
    haptic('snap');
    onCompose('');
  }
  function remove() {
    if (disabled) return;
    haptic('key');
    if (composition) onCompose(deleteComposed(composition));
    else onDelete();
  }

  const inked = history.strokes.length > 0;
  const busy = reading.phase !== 'empty';
  const shownSymbols = symbols.enabled && inked ? symbols.ids.slice(0, busy ? 2 : 4) : [];
  const first = autoeq.readings[0];
  const key = (label: string, text: string, name?: string) => <button key={label} type="button" aria-label={name ?? label}
    disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => compose(text)}>{label}</button>;
  return <section className="tutor-equation" aria-label="Equation mode" data-keys={keysHidden ? 'hidden' : undefined}>
    <div className="strip tutor-equation-strip">
      {leading}
      <div className="tutor-equation-candidates" role="group" aria-label="Equation suggestions" aria-live="polite">
        {inked ? <>
          {reading.phase === 'result' && <button type="button" className="tutor-equation-reading" aria-label={'Add equation ' + reading.latex}
            disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => addInk(reading.latex)}>
            <MathText source={'$' + reading.latex + '$'}/>
          </button>}
          {shownSymbols.map(id => {
            const symbol = symbolById(id);
            return symbol && <button key={id} type="button" className="tutor-equation-symbol" aria-label={'Add symbol ' + symbol.name}
              disabled={disabled || !symbols.actionable} onPointerDown={event => event.preventDefault()} onClick={() => addInk(symbol.glyph)}>{symbol.glyph}</button>;
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
        </> : composition.trim() ? <>
          {autoeq.readings.map((item, index) => <button key={item.latex} type="button"
            className={'tutor-equation-reading' + (index ? '' : ' preferred')} aria-label={'Insert equation ' + item.latex} title={item.label}
            disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => insert(item.latex)}>
            <MathText source={'$' + item.latex + '$'}/>
          </button>)}
          {autoeq.reading && <span className="tutor-equation-status"><LoaderCircle className="tutor-ink-spinner" aria-hidden="true"/>Reading…</span>}
        </> : <span className="tutor-equation-hint">{replacing ? 'Write the equation again' : 'Type or draw an equation'}</span>}
      </div>
      {trailing}
    </div>
    {!keysHidden && <div className="tutor-equation-keys tutor-equation-operations" role="group" aria-label="Operations">
      {EQUATION_OPERATIONS.map(([label, text, name]) => key(label, text, name))}
    </div>}
    <div className="tutor-equation-middle">
      {!keysHidden && <div className="tutor-equation-keys tutor-equation-variables" role="group" aria-label="Variables">
        {EQUATION_VARIABLES.map(name => key(name, name))}
      </div>}
      <div className="tutor-equation-centre">
        {/* The composition, with the paper's tools at its end so the whole paper is for writing. */}
        <div className="tutor-equation-head">
          <div className="tutor-equation-line" ref={line} role="status" aria-label="Composition"
            data-placeholder={composition ? undefined : 'x1 + y1 = 1'}>
            {composition && <span>{composition}</span>}
            <i className="tutor-equation-caret" aria-hidden="true"/>
          </div>
          <div className="tutor-equation-tools">
            {inked && <>
              <button type="button" className="sbtn" aria-label="Search symbol" title="Find this symbol in Draw symbol" disabled={disabled}
                onPointerDown={event => event.preventDefault()} onClick={() => onSearchSymbol(history.strokes, size())}><Search aria-hidden="true"/></button>
              <button type="button" className="sbtn" aria-label="Undo stroke" disabled={disabled || !history.undo.length}
                onPointerDown={event => event.preventDefault()} onClick={() => change(undoPadInk(history))}><Undo2 aria-hidden="true"/></button>
              <button type="button" className="sbtn" aria-label="Clear writing" disabled={disabled}
                onPointerDown={event => event.preventDefault()} onClick={clearInk}><Trash2 aria-hidden="true"/></button>
            </>}
            <button type="button" className="sbtn" aria-label={keysHidden ? 'Show equation keys' : 'Hide equation keys'} aria-pressed={keysHidden}
              onPointerDown={event => event.preventDefault()} onClick={() => {haptic('snap'); onKeysHidden(!keysHidden);}}>
              {keysHidden ? <Minimize2 aria-hidden="true"/> : <Maximize2 aria-hidden="true"/>}</button>
          </div>
        </div>
        <div className="tutor-equation-paper" ref={paper}>
          <div className="tutor-equation-sheet" ref={sheet}>
            <InkCanvas history={history} onChange={change} mode={disabled ? 'hand' : 'pen'} width={3} label="Write an equation" panTouches={2}
              onPan={(dx, dy) => {const view = paper.current; if (view) {view.scrollLeft -= dx; view.scrollTop -= dy;}}}/>
          </div>
        </div>
      </div>
      {!keysHidden && <div className="tutor-equation-keys tutor-equation-digits" role="group" aria-label="Digits">
        {EQUATION_DIGITS.map(digit => key(digit, digit))}
        <button type="button" className="tutor-equation-delete" aria-label="Delete" disabled={disabled}
          onPointerDown={event => event.preventDefault()} onClick={remove}><Delete aria-hidden="true"/></button>
      </div>}
    </div>
    {!keysHidden && <div className="tutor-equation-keys tutor-equation-symbols" role="group" aria-label="Symbols">
      {EQUATION_SYMBOLS.map(([label, text, name]) => key(label, text, name))}
      <button type="button" className="tutor-equation-enter" aria-label="Insert equation" disabled={disabled || !first || inked}
        onPointerDown={event => event.preventDefault()} onClick={() => first && insert(first.latex)}><CornerDownLeft aria-hidden="true"/></button>
    </div>}
  </section>;
}
