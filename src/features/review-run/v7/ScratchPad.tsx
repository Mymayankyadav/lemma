import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react';

/**
 * N157 · U4 S6 scratch paper (flag v7Scratch). Before "Show answer", a sheet of graph paper for an attempt: finger, stylus
 * (its pressure sets the line where the device reports it) or the keyboard. After the reveal it stays beside the answer;
 * grading moves to the next card, which starts a clean sheet. Nothing is stored or sent.
 */
export function ScratchPad({cardKey}: {cardKey: string}) {
  const canvas = useRef<HTMLCanvasElement>(null), last = useRef<{x: number; y: number} | null>(null);
  const [open, setOpen] = useState(false), [typed, setTyped] = useState(''), [marked, setMarked] = useState(false);
  // A new card starts a clean sheet.
  useEffect(() => {setTyped(''); setMarked(false); last.current = null; const node = canvas.current; node?.getContext('2d')?.clearRect(0, 0, node.width, node.height);}, [cardKey]);
  useEffect(() => {
    const node = canvas.current;
    if (!open || !node) return;
    const fit = () => {
      const box = node.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      if (node.width === Math.round(box.width * ratio)) return;
      node.width = Math.round(box.width * ratio); node.height = Math.round(box.height * ratio);
      node.getContext('2d')?.scale(ratio, ratio);
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [open]);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {const box = event.currentTarget.getBoundingClientRect(); return {x: event.clientX - box.left, y: event.clientY - box.top};};
  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {event.currentTarget.setPointerCapture(event.pointerId); last.current = point(event);};
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const from = last.current, context = canvas.current?.getContext('2d');
    if (!from || !context) return;
    const to = point(event), pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    context.strokeStyle = getComputedStyle(event.currentTarget).color; context.lineCap = 'round'; context.lineJoin = 'round';
    context.lineWidth = 1 + pressure * 2.5;
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
    last.current = to; if (!marked) setMarked(true);
  };
  const clear = () => {const node = canvas.current; node?.getContext('2d')?.clearRect(0, 0, node.width, node.height); setTyped(''); setMarked(false);};
  if (!open) return <button type="button" className="v7-scratch-open" onClick={() => setOpen(true)}>Scratch paper</button>;
  return <section className="v7-scratch" aria-label="Scratch paper">
    <canvas ref={canvas} className="v7-scratch-sheet" role="img" aria-label={marked ? 'Your working, drawn' : 'Graph paper: draw with a finger or stylus'}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => {last.current = null;}} onPointerCancel={() => {last.current = null;}}/>
    <label className="v7-sr-only" htmlFor={'v7-scratch-' + cardKey}>Type an attempt</label>
    <textarea id={'v7-scratch-' + cardKey} className="v7-field v7-scratch-typed" placeholder="Or type an attempt…" value={typed} onChange={event => setTyped(event.target.value)}/>
    <div className="v7-scratch-actions">
      <button type="button" className="v7-scratch-link" onClick={clear}>Clear</button>
      <button type="button" className="v7-scratch-link" onClick={() => setOpen(false)}>Put away</button>
      <span className="v7-meta">Not saved</span>
    </div>
  </section>;
}
