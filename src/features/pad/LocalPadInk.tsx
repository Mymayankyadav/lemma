import {Button} from '../../ui/v7/components';
import {useId, useMemo, useRef, useState, type PointerEvent} from 'react';
import {
  PAD_INK_LIMIT, PAD_PAPER, appendPadPoint, clearPadInk, finishPadStroke, padStrokePath,
  paperPoint, undoPadInk, type PadInkHistory, type PadStroke,
} from './padInk';
import './local-pad.css';

interface LocalPadInkProps {
  history: PadInkHistory;
  onInk: (history: PadInkHistory) => void;
}

/** The live pointer is transient. Only a completed stroke leaves the drawing area. */
export function LocalPadInk({history, onInk}: LocalPadInkProps) {
  const active = useRef<{id: number; stroke: PadStroke} | null>(null);
  const [pending, setPending] = useState<PadStroke>([]);
  const [mode, setMode] = useState<'draw' | 'scroll'>('draw');
  const [message, setMessage] = useState('');
  const heading = useId();
  const completed = useMemo(() => history.strokes.map(padStrokePath), [history.strokes]);

  function locate(event: PointerEvent<SVGSVGElement>) {
    return paperPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }
  function cancel() {
    active.current = null;
    setPending([]);
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (mode !== 'draw' || event.button !== 0 || active.current) return;
    if (history.strokes.length >= PAD_INK_LIMIT.strokes) {
      setMessage('Ink is full. Export, undo, or clear to continue.');
      return;
    }
    const point = locate(event);
    if (!point) return;
    try {event.currentTarget.setPointerCapture(event.pointerId);}
    catch {return;}
    active.current = {id: event.pointerId, stroke: [point]};
    setPending(active.current.stroke);
    setMessage('');
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const drawing = active.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    const point = locate(event);
    if (!point) return;
    drawing.stroke = appendPadPoint(drawing.stroke, point);
    setPending(drawing.stroke);
    if (drawing.stroke.length >= PAD_INK_LIMIT.points) {
      setMessage('Stroke limit reached. Lift and start a new stroke to continue.');
    }
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    const drawing = active.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    const point = locate(event);
    const stroke = point ? appendPadPoint(drawing.stroke, point) : drawing.stroke;
    const next = finishPadStroke(history, stroke);
    cancel();
    if (next !== history) onInk(next);
  }
  function cancelPointer(event: PointerEvent<SVGSVGElement>) {
    if (active.current?.id === event.pointerId) cancel();
  }
  function pickMode(next: typeof mode) {
    cancel();
    setMessage('');
    setMode(next);
  }
  function edit(next: PadInkHistory, status: string) {
    cancel();
    if (next === history) return;
    onInk(next);
    setMessage(status);
  }

  return <section className="local-pad" aria-labelledby={heading}>
    <h3 id={heading}>Ink on graph paper</h3>
    <div className="local-pad-controls" role="group" aria-label="Ink controls">
      <Button aria-pressed={mode === 'draw'} onClick={() => pickMode('draw')}>Draw</Button>
      <Button aria-pressed={mode === 'scroll'} onClick={() => pickMode('scroll')}>Scroll</Button>
      <Button disabled={!history.undo.length} onClick={() => edit(undoPadInk(history), 'Last ink change undone.')}>Undo ink</Button>
      <Button disabled={!history.strokes.length} onClick={() => edit(clearPadInk(history), 'Ink cleared. Undo to restore it.')}>Clear ink</Button>
    </div>
    <svg className="local-pad-ink" data-mode={mode} role="img" aria-label="Pad drawing"
      viewBox={'0 0 ' + PAD_PAPER.width + ' ' + PAD_PAPER.height} preserveAspectRatio="none"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}>
      <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {completed.map((path, index) => <path key={index} d={path}/>)}
        {pending.length > 0 && <path d={padStrokePath(pending)} opacity={0.65}/>}
      </g>
    </svg>
    <p className="local-pad-ink-status" role="status">{message}</p>
  </section>;
}
