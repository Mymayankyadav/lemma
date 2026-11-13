import {useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent} from 'react';
import {Link} from 'react-router';
import {haptic} from '../../../ui/v7/haptics';
import './ruler.css';

export type RulerBlock = {id: string; start: number; end: number; klass: string; past: boolean; title: string};
const pad = (value: number) => String(value).padStart(2, '0');
/** Minutes after midnight as "17:05". */
export const rulerTime = (minute: number) => pad(Math.floor(minute / 60) % 24) + ':' + pad(Math.round(minute % 60));
/** A tick every half hour, a label every second hour, positioned by value across the window. */
export function rulerTicks([from, to]: [number, number]) {
  const ticks: {minute: number; left: number; label: string | null; hour: boolean}[] = [];
  for (let minute = Math.ceil(from / 30) * 30; minute <= to; minute += 30)
    ticks.push({minute, left: (minute - from) / (to - from) * 100, hour: minute % 60 === 0, label: minute % 120 === 0 ? rulerTime(minute) : null});
  return ticks;
}
/** Snap to five minutes inside the window. */
export const rulerSnap = (minute: number, [from, to]: [number, number]) => Math.min(to, Math.max(from, Math.round(minute / 5) * 5));
/** The first block that starts at or after the minute. */
export const nextAfter = (blocks: readonly RulerBlock[], minute: number) => [...blocks].sort((a, b) => a.start - b.start).find(block => block.start >= minute) ?? null;

/**
 * N157 · U4 S1 the ruler (flag v7Ruler), in place of Today's strip. Blocks sit on it in their subject colour (finished ones
 * grey) and an indigo needle marks now. Dragging the needle, or Left and Right on it, previews what is next from that
 * time, in five-minute steps with a light tick on Android; it is a slider with spoken times. Letting go returns it to now.
 */
export function Ruler({blocks, window, now, summary}: {blocks: RulerBlock[]; window: [number, number]; now: number; summary: string}) {
  const [probe, setProbe] = useState<number | null>(null), track = useRef<HTMLDivElement>(null), dragging = useRef(false);
  const at = probe ?? now, [from, to] = window, left = (minute: number) => (Math.min(to, Math.max(from, minute)) - from) / (to - from) * 100;
  const next = nextAfter(blocks, at);
  const set = (minute: number) => {const snapped = rulerSnap(minute, window); setProbe(previous => {if (previous !== snapped) haptic('snap'); return snapped;});};
  const fromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const box = track.current!.getBoundingClientRect();
    set(from + (event.clientX - box.left) / box.width * (to - from));
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = {ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -60, PageUp: 60}[event.key];
    if (step !== undefined) {event.preventDefault(); set(at + step);}
    else if (event.key === 'Home') {event.preventDefault(); set(from);}
    else if (event.key === 'End') {event.preventDefault(); set(to);}
    else if (event.key === 'Escape') setProbe(null);
  };
  const preview = probe === null ? null : next ? 'next at ' + rulerTime(next.start) + ' · ' + next.title : 'nothing after ' + rulerTime(probe);
  return <section className="v7-card v7-ruler-card" aria-label="Today">
    <span className="v7-card-heading"><h2>Today</h2><Link to="/calendar?view=day">{summary}</Link></span>
    <p className="v7-ruler-preview" aria-live="polite">{preview ?? (next ? 'Next at ' + rulerTime(next.start) + ' · ' + next.title : 'Nothing else planned today')}</p>
    <div ref={track} className="v7-ruler" onPointerDown={event => {dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); fromPointer(event);}}
      onPointerMove={event => {if (dragging.current) fromPointer(event);}} onPointerUp={() => {dragging.current = false; setProbe(null);}} onPointerCancel={() => {dragging.current = false; setProbe(null);}}>
      {rulerTicks(window).map(tick => <span key={tick.minute} className="v7-ruler-tick" data-hour={tick.hour || undefined} style={{left: tick.left + '%'}} aria-hidden="true">
        {tick.label && <span className="v7-ruler-label">{tick.label}</span>}</span>)}
      {blocks.map(block => <span key={block.id} className={'v7-ruler-block ' + block.klass} data-past={block.past || undefined}
        style={{left: left(block.start) + '%', width: Math.max(0.5, left(block.end) - left(block.start)) + '%'}} aria-hidden="true"/>)}
      <div className="v7-ruler-needle" role="slider" tabIndex={0} aria-label="Time" aria-valuemin={from} aria-valuemax={to} aria-valuenow={at}
        aria-valuetext={rulerTime(at) + (preview ? ', ' + preview : '')} style={{left: left(at) + '%'}} onKeyDown={key} onBlur={() => setProbe(null)}/>
    </div>
  </section>;
}
