import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {Download, LoaderCircle, Maximize2, Minimize2, Pencil, RotateCcw, ScanText, Trash2, Undo2} from 'lucide-react';
import {MathText} from '../../../ui/MathText';
import {InkCanvas,type InkCanvasHandle} from '../../../ui/v7/ink/InkCanvas';
import {clearPadInk, initializePadInk, PAD_PAPER, undoPadInk, type PadInkHistory, type PadStrokes} from '../../../ui/v7/ink/ink';
import {haptic} from '../../../ui/v7/haptics';
import {EQUATION_MODEL_BYTES} from './equationModel';
import {equationModelCached, prepareEquationModel, recognizeEquation} from './equationRecognizer';
import {symbolById} from './symbolCatalog';
import {PaperEraserControl,PencilOnlyControl,usePaperInput} from '../PaperInputTools';
import {FullscreenPaper} from '../FullscreenPaper';

type Reading =
  | {phase: 'idle' | 'ask' | 'reading'}
  | {phase: 'download'; loaded: number}
  | {phase: 'result'; latex: string}
  | {phase: 'error'; message: string};

/** The paper's dragged extra height, remembered while the app runs. */
let equationExtra = 0;

export type EquationSymbols = {
  /** Draw single symbols is on: the drawing is also read as one symbol, on the device, as it is drawn. */
  enabled: boolean;
  ids: readonly string[];
  actionable: boolean;
  /** The ink as drawn, in pixels of the paper, for the symbol reader. */
  onInk: (strokes: PadStrokes, size: {width: number; height: number}) => void;
};

/**
 * N223 (Owner: "keep the drawing by hand and remove all these symbols so the scratch pad can become bigger"; "use manual
 * trigger if it is faster, not for detexify"): equation mode is paper in the keys' place. A single symbol is read as it
 * is drawn (Draw single symbols, fast and on the device) and offered in the strip; the whole equation is read by
 * Pix2Text MFR only when the learner taps Read, so writing is never slowed by readings of half an equation. Either
 * goes into the answer as an equation chip, and the paper clears for the next one. The paper scrolls both ways (two
 * fingers, a wheel or the scroll bars), and the model starts loading when the paper opens.
 */
export function TutorEquationPanel({disabled, replacing, leading, trailing, symbols, onInsert, onInsertSymbol}: {
  disabled: boolean;
  /** Set when the learner chose Write by hand for an equation already in the answer. */
  replacing?: string;
  /** The strip's own ends: Keys at the left, Equation mode at the right, so the strip keeps its frame. */
  leading: ReactNode;
  trailing: ReactNode;
  symbols: EquationSymbols;
  onInsert: (latex: string) => boolean;
  onInsertSymbol: (id: string) => boolean;
}) {
  const [history, setHistory] = useState<PadInkHistory>(() => initializePadInk()!);
  const [reading, setReading] = useState<Reading>({phase: 'idle'});
  /** A stroke is being drawn: the floating tools step aside. */
  const [stroking, setStroking] = useState(false);
  /** The paper holds all the strokes it can (N228). */
  const [full, setFull] = useState(false);
  /** N228 (Owner: "full screen scratch pad editing for both scratch and equation"): the strip and the paper fill the screen. */
  const input=usePaperInput();
  const canvas=useRef<InkCanvasHandle>(null);
  const [pendingDot,setPendingDot]=useState(false);
  const flushDot=()=>canvas.current?.flushPendingDot()??history;
  const [tool,setTool]=useState<'pen'|'eraser'>('pen');
  const [fullscreen, setFullscreen] = useState(false);
  /** How much taller than the keys the learner has dragged the paper (kept while the composer is open). */
  const [extra, setExtra] = useState(() => equationExtra);
  useEffect(() => {equationExtra = extra;}, [extra]);
  const resize = useRef<{pointer: number; y: number; extra: number} | null>(null);
  /** The reader is on this device (cached, or it read something this session). */
  const ready = useRef<boolean | null>(null);
  /** The learner agreed to the one-time download; a later Read does not ask again while it finishes. */
  const consented = useRef(false);
  const run = useRef(0);
  const megabytes = Math.round(EQUATION_MODEL_BYTES / 1e6);
  const sheet = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const size = () => {
    // Layout size, not the bounding box: a paper turned in landscape has its width and height swapped on screen.
    const el = sheet.current;
    return el?.offsetWidth && el.offsetHeight ? {width: el.offsetWidth, height: el.offsetHeight} : {width: PAD_PAPER.width, height: PAD_PAPER.height};
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
    // A cold start (reading 118 MB from the cache, checking it and building two sessions) happens now, not on Read.
    void prepareEquationModel();
    return () => {live = false; run.current++;};
  }, []);

  async function read(consent = false) {
    const strokes = flushDot().strokes;
    if (!strokes.length || disabled) return;
    if (consent) consented.current = true;
    const current = ++run.current;
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
    // A reading belongs to the ink it read: new ink waits for the next Read. That includes a reading still downloading
    // the model (review of #1830): the download carries on in the worker, and Read, enabled again, picks it up.
    run.current++;
    setReading({phase: 'idle'});
    symbols.onInk(next.strokes, size());
  }
  function clearInk() {
    const current=flushDot();
    run.current++;
    setHistory(clearPadInk(current));
    setReading({phase: 'idle'});
    symbols.onInk([], size());
    paper.current?.scrollTo({left: 0, top: 0});
  }
  function insert(latex: string) {
    if (disabled || !onInsert(latex)) return;
    haptic('snap');
    clearInk();
  }
  function insertSymbol(id: string) {
    if (disabled || !symbols.actionable || !onInsertSymbol(id)) return;
    haptic('snap');
    clearInk();
  }

  const inked = history.strokes.length > 0 || pendingDot;
  const maxExtra = () => Math.max(0, Math.round(window.innerHeight * 0.32));
  const clampExtra = (value: number) => Math.max(0, Math.min(maxExtra(), value));
  const busy = reading.phase !== 'idle';
  const shownSymbols = symbols.enabled && inked && !pendingDot ? symbols.ids.slice(0, busy ? 2 : 4) : [];
  return <FullscreenPaper active={fullscreen} onExit={() => {flushDot();setFullscreen(false);}} label="Equation mode, full screen">
  <section className="tutor-equation" aria-label="Equation mode" data-fullscreen={fullscreen || undefined}>
    <div className="strip tutor-equation-strip">
      {leading}
      <div className="tutor-equation-candidates" role="group" aria-label="Equation suggestions" aria-live="polite">
        {!pendingDot && reading.phase === 'result' && <button type="button" className="tutor-equation-reading preferred" aria-label={'Insert equation ' + reading.latex}
          disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => insert(reading.latex)}>
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
          onPointerDown={event => event.preventDefault()} onClick={() => void read(true)}>
          <Download aria-hidden="true"/><span>Download reader</span><small>{megabytes} MB</small>
        </button>}
        {reading.phase === 'error' && <span className="tutor-equation-status" role="alert"><span>{reading.message}</span>
          <button type="button" className="tutor-equation-retry" aria-label="Try again" onClick={() => void read()}>
            <RotateCcw aria-hidden="true"/></button></span>}
        {!inked && <span className="tutor-equation-hint">{replacing ? 'Write the equation again' : 'Write a symbol or an equation'}</span>}
      </div>
      {/* Keep mode controls in the strip. Widening the floating actions covers
          inkable paper at phone widths and can swallow a stroke's pointerdown. */}
      {tool==='eraser'&&<button type="button" className="tutor-paper-input-button" aria-label="Pen"
        disabled={disabled} onClick={()=>setTool('pen')}><Pencil aria-hidden="true"/></button>}
      <PaperEraserControl kind={input.eraserKind} active={tool==='eraser'} disabled={disabled}
        onSelect={()=>setTool('eraser')} onKind={input.setEraserKind}/>
      {input.isIPad&&<PencilOnlyControl enabled={input.enabled} onToggle={input.toggle}/>}
      {trailing}
    </div>
    {/* N227 (Owner: "these options waste the row; float them and hide them while drawing"; "expandable as in the
        scratch pad"): the paper takes the whole place. Read, Undo and Clear float in its corner and step aside while a
        stroke is drawn; a grip on its top edge drags it taller. Two fingers scroll the paper, three the chat. */}
    <div className="tutor-equation-body" style={{'--equation-extra': extra + 'px'} as CSSProperties}>
      <div className="tutor-equation-grip" role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Resize writing paper"
        aria-valuenow={Math.round(extra)} aria-valuemin={0} aria-valuemax={Math.round(maxExtra())}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          resize.current = {pointer: event.pointerId, y: event.clientY, extra};
        }}
        onPointerMove={event => {
          const drag = resize.current;
          if (drag?.pointer === event.pointerId) setExtra(clampExtra(drag.extra + drag.y - event.clientY));
        }}
        onLostPointerCapture={() => {resize.current = null;}}
        onKeyDown={event => {
          const step = event.key === 'ArrowUp' ? 32 : event.key === 'ArrowDown' ? -32 : 0;
          if (!step) return;
          event.preventDefault();
          setExtra(current => clampExtra(current + step));
        }}><span aria-hidden="true"/></div>
      <div className="tutor-equation-paper" ref={paper}>
        <div className="tutor-equation-sheet" ref={sheet}>
          <InkCanvas apiRef={canvas} onPendingDot={setPendingDot} pencilOnly={input.isIPad&&input.enabled} pencilTipEraser={input.isIPad} eraserKind={input.eraserKind} history={history} onChange={change} mode={disabled ? 'hand' : tool} width={3} label="Write an equation" panTouches={2}
            onStroke={() => {setStroking(true); setFull(false);}} onStrokeEnd={() => setStroking(false)} onFull={() => setFull(true)}
            onPan={(dx, dy, _gesture, fingers) => {
              // Three fingers scroll the chat; in full screen no chat is in view.
              if (fullscreen && fingers && fingers >= 3) return;
              const view = fingers && fingers >= 3 ? paper.current?.closest('.lemma-tutor')?.querySelector<HTMLElement>('[role="log"]') : paper.current;
              if (!view) return;
              if (!(fingers && fingers >= 3)) view.scrollLeft -= dx;
              view.scrollTop -= dy;
            }}/>
        </div>
      </div>
      {full && <p className="tutor-equation-full" role="status">The paper is full. Read it, or clear it to keep writing.</p>}
      <div className="tutor-equation-float" role="group" aria-label="Paper tools" data-hidden={stroking || undefined}>
        <button type="button" className="tutor-equation-read" aria-label="Read equation" disabled={disabled || !inked || reading.phase === 'reading' || reading.phase === 'download'}
          onPointerDown={event => event.preventDefault()} onClick={() => {haptic('snap'); void read();}}><ScanText aria-hidden="true"/><span>Read</span></button>
        <button type="button" className="sbtn" aria-label="Undo stroke" disabled={disabled || (!history.undo.length&&!pendingDot)}
          onPointerDown={event => event.preventDefault()} onClick={() => change(undoPadInk(flushDot()))}><Undo2 aria-hidden="true"/></button>
        <button type="button" className="sbtn" aria-label="Clear writing" disabled={disabled || !inked}
          onPointerDown={event => event.preventDefault()} onClick={clearInk}><Trash2 aria-hidden="true"/></button>
        <button type="button" className="sbtn" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} aria-pressed={fullscreen}
          data-fullscreen-toggle="" onPointerDown={event => event.preventDefault()}
          onClick={() => {flushDot();setFullscreen(on => !on);}}>{fullscreen ? <Minimize2 aria-hidden="true"/> : <Maximize2 aria-hidden="true"/>}</button>
      </div>
    </div>
  </section>
  </FullscreenPaper>;
}
