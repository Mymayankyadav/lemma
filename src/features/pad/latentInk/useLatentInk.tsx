/**
 * N248 · The Pad's math keys double as paper for one symbol at a time. A touch that stays put is a key tap; one
 * that moves more than SLOP_PX draws. When the drawn symbol goes in is decided by latentInkPolicy.ts.
 */
import {useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent} from 'react';
import {createInkRecognizer, TUTOR_MODEL_ASSET_SET} from '../../tutor/input/inkRecognizer';
import {resampleInkPath} from '../../tutor/input/inkGeometry';
import {matchPartialSymbols} from '../../tutor/input/partialSymbolMatcher';
import type {SymbolDefinition} from '../../tutor/input/symbolCatalog';
import type {InkInferenceResult, InkPoint, InkReadiness, InkSnapshot, InkStroke} from '../../tutor/input/types';
import type {PadSymbol} from '../padEdit';
import {
  adaptiveThreshold, boxOf, continuesDrawing, decideOnPenUp, IDLE_COMMIT_MS, insertsOnIdle, insertsOnMove, readAutoInsertRecord,
  readLatentInk, RETRACT_WINDOW_MS, SETTLE_MS, writeAutoInsertRecord, type Box, type HoldDecision, type LatentChoice, type LatentReading,
} from './latentInkPolicy';

export const SLOP_PX = 10;
/** A key tapped while the reading is still being computed waits at most this long for it. */
export const DEFERRED_TAP_MS = 800;
const MAX_STROKES = 12, MAX_POINTS = 96;

export interface LatentInkHandlers {
  /** Insert at the caret, or (replace) in place of the symbol this layer inserted last. False when refused. */
  onInsert: (symbol: PadSymbol, replace: boolean) => boolean;
  /** Take back the symbol this layer inserted last, if nothing has changed since. */
  onRetract: () => boolean;
}

type Held = {epoch: number; strokes: InkStroke[]; box?: Box; liftAt: number; reading?: LatentReading; decision?: HoldDecision};
type Inserted = {strokes: InkStroke[]; box?: Box; at: number; liftAt: number; decision: HoldDecision; symbolId: string;
  alternatives: readonly LatentChoice[]; auto: boolean};
type Pointer = {id: number; type: InkStroke['pointerType']; start: InkPoint; points: InkPoint[]; drawing: boolean};
export type LatentView =
  | {kind: 'idle'}
  | {kind: 'reading'}
  | {kind: 'held'; choices: readonly LatentChoice[]; preferred: boolean}
  | {kind: 'inserted'; symbol: SymbolDefinition; alternatives: readonly LatentChoice[]}
  | {kind: 'notice'; message: string};

export const toPadSymbol = (symbol: SymbolDefinition): PadSymbol => ({label: symbol.name, glyph: symbol.glyph, tex: symbol.tex});

export function useLatentInk(enabled: boolean, handlers: LatentInkHandlers) {
  const body = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const mountId = useId();
  const latest = useRef(handlers);
  latest.current = handlers;
  const [view, setView] = useState<LatentView>({kind: 'idle'});
  const held = useRef<Held | null>(null), inserted = useRef<Inserted | null>(null), pointer = useRef<Pointer | null>(null);
  const scroll = useRef<{ids: Set<number>; y: number} | null>(null);
  const epoch = useRef(0), suppressClick = useRef(false), replaying = useRef(false);
  const deferred = useRef<{button: HTMLElement; timer: ReturnType<typeof setTimeout>} | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readiness = useRef<InkReadiness>('unloaded');
  const recognizer = useRef<ReturnType<typeof createInkRecognizer> | null>(null);
  const lastSnapshot = useRef<InkSnapshot | null>(null);
  const record = useRef(readAutoInsertRecord(typeof localStorage === 'undefined' ? undefined : localStorage));

  useEffect(() => () => {
    clearTimeout(timer.current); clearTimeout(deferred.current?.timer);
    recognizer.current?.dispose(); recognizer.current = null;
  }, []);
  useEffect(() => {if (!enabled) discard();}, [enabled]);

  function paint() {
    const node = canvas.current, area = body.current;
    if (!node || !area) return;
    const width = area.scrollWidth, height = area.scrollHeight;
    if (node.width !== width || node.height !== height) {node.width = width; node.height = height;}
    const context = node.getContext?.('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.lineWidth = 3; context.lineCap = context.lineJoin = 'round';
    context.strokeStyle = getComputedStyle(area).getPropertyValue('--accent').trim() || 'currentColor';
    const strokes = [...(held.current?.strokes ?? []), ...(pointer.current?.drawing ? [{points: pointer.current.points}] : [])];
    for (const stroke of strokes) {
      context.beginPath();
      stroke.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
    }
  }

  function saveRecord(change: {inserted?: number; corrected?: number}) {
    const current = record.current ?? {inserted: 0, corrected: 0};
    record.current = {inserted: current.inserted + (change.inserted ?? 0), corrected: current.corrected + (change.corrected ?? 0)};
    writeAutoInsertRecord(typeof localStorage === 'undefined' ? undefined : localStorage, record.current);
  }

  function discard() {
    clearTimeout(timer.current);
    recognizer.current?.cancel();
    held.current = null; pointer.current = null; inserted.current = null;
    setView({kind: 'idle'}); paint();
  }

  /** Insert the held reading (or leave it out), clear the paper and keep the alternatives for a one-tap replace. */
  function commit(reason: 'settle' | 'idle' | 'move', choice?: LatentChoice) {
    const current = held.current;
    if (!current) return;
    clearTimeout(timer.current);
    recognizer.current?.cancel();
    held.current = null;
    const decision = current.decision ?? 'none';
    const allowed = choice || (reason === 'move' ? insertsOnMove(decision) : insertsOnIdle(decision));
    const picked = choice ?? current.reading?.choices[0];
    if (allowed && picked && latest.current.onInsert(toPadSymbol(picked.symbol), false)) {
      const auto = !choice;
      if (auto) saveRecord({inserted: 1});
      const alternatives = (current.reading?.choices ?? []).filter(item => item.symbol.id !== picked.symbol.id);
      inserted.current = {strokes: current.strokes, box: current.box, at: Date.now(), liftAt: current.liftAt, decision,
        symbolId: picked.symbol.id, alternatives, auto};
      setView({kind: 'inserted', symbol: picked.symbol, alternatives});
    } else if (reason === 'move' || !allowed) {
      inserted.current = null;
      setView({kind: 'notice', message: current.reading?.choices.length
        ? 'Drawing left out: it was unclear. Draw it again, or choose before moving on.'
        : 'Drawing left out: no symbol was recognised.'});
    }
    paint();
  }

  function schedule(current: Held) {
    clearTimeout(timer.current);
    const since = Date.now() - current.liftAt;
    if (current.decision === 'insert-after-settle') timer.current = setTimeout(() => commit('settle'), Math.max(0, SETTLE_MS - since));
    else if (current.decision === 'insert-on-move') timer.current = setTimeout(() => commit('idle'), Math.max(0, IDLE_COMMIT_MS - since));
  }

  function received(result: InkInferenceResult, snapshot: InkSnapshot) {
    const current = held.current;
    if (!current || current.epoch !== result.inkEpoch || current.strokes.length !== result.inkRevision) return;
    const reading = readLatentInk(result, matchPartialSymbols(snapshot));
    current.reading = reading;
    current.decision = decideOnPenUp(reading, adaptiveThreshold(record.current));
    setView({kind: 'held', choices: reading.choices, preferred: current.decision !== 'choose' && current.decision !== 'none'});
    if (deferred.current) {flushDeferred(); return;}
    if (!pointer.current?.drawing) schedule(current);
  }

  function recognise(current: Held) {
    const area = body.current;
    const snapshot: InkSnapshot = {
      target: {scopeKey: 'pad-latent-ink', mountId, editorRevision: 0, selectionRevision: 0, modeRevision: 0},
      sessionId: mountId, inkEpoch: current.epoch, inkRevision: current.strokes.length, sampledAtMs: Date.now(),
      assetSetVersion: TUTOR_MODEL_ASSET_SET, strokes: current.strokes,
      viewport: {width: area?.scrollWidth || 1, height: area?.scrollHeight || 1},
      overBudget: current.strokes.length > MAX_STROKES, interrupted: false, completedRevision: current.strokes.length,
    };
    if (readiness.current === 'unavailable' || snapshot.overBudget) {
      current.reading = readLatentInk(undefined, matchPartialSymbols(snapshot));
      current.decision = decideOnPenUp(current.reading, adaptiveThreshold(record.current));
      setView(current.reading.choices.length ? {kind: 'held', choices: current.reading.choices, preferred: false}
        : {kind: 'notice', message: snapshot.overBudget ? 'Too many strokes for one symbol. Clear the drawing and try again.'
          : 'The symbol reader is unavailable on this device. Use the keys.'});
      if (deferred.current) flushDeferred();
      return;
    }
    recognizer.current ??= createInkRecognizer({
      onReadiness: state => {
        readiness.current = state;
        if (state === 'unavailable' && held.current) recognise(held.current);
      },
      // Results are matched to the held drawing by epoch and revision, and read against its newest snapshot.
      onResult: result => {if (lastSnapshot.current) received(result, lastSnapshot.current);},
    });
    lastSnapshot.current = snapshot;
    recognizer.current.submit(snapshot);
    setView({kind: 'reading'});
  }

  function point(event: PointerEvent<HTMLElement>): InkPoint {
    const area = body.current!, rect = area.getBoundingClientRect();
    return {
      x: Math.max(0, event.clientX - rect.left + area.scrollLeft), y: Math.max(0, event.clientY - rect.top + area.scrollTop),
      t: event.timeStamp, ...(event.pointerType === 'pen' && event.pressure > 0 ? {pressure: Math.min(1, event.pressure)} : {}),
    };
  }

  function startStroke(active: Pointer) {
    const now = Date.now();
    clearTimeout(timer.current);
    const current = held.current;
    // A stroke away from the held drawing starts the next symbol: the held one is settled first and stays put.
    if (current && !continuesDrawing(current.box, active.start, now - current.liftAt, current.decision)) {commit('move'); inserted.current = null;}
    if (!held.current) {
      const last = inserted.current;
      // Only an extendable symbol that went in because the learner paused is taken back.
      if (last && last.auto && last.decision === 'insert-on-move' && now - last.at < RETRACT_WINDOW_MS
        && continuesDrawing(last.box, active.start, now - last.liftAt, last.decision) && latest.current.onRetract()) {
        if (last.auto) saveRecord({inserted: -1});
        held.current = {epoch: ++epoch.current, strokes: last.strokes, box: last.box, liftAt: last.at};
      } else held.current = {epoch: ++epoch.current, strokes: [], liftAt: now};
      inserted.current = null;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0) return;
    if (pointer.current && pointer.current.id !== event.pointerId) {
      // A second finger: scroll the keys with two fingers instead of drawing.
      if (event.pointerType !== 'touch' || pointer.current.type === 'pen') return;
      scroll.current = {ids: new Set([pointer.current.id, event.pointerId]), y: event.clientY};
      pointer.current = null; paint();
      return;
    }
    const start = point(event);
    pointer.current = {id: event.pointerId, type: event.pointerType === 'pen' || event.pointerType === 'touch' || event.pointerType === 'mouse'
      ? event.pointerType : 'unknown', start, points: [start], drawing: false};
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (scroll.current?.ids.has(event.pointerId)) {
      if (body.current) body.current.scrollTop -= event.clientY - scroll.current.y;
      scroll.current.y = event.clientY;
      return;
    }
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const next = point(event);
    if (!active.drawing) {
      if (Math.hypot(next.x - active.start.x, next.y - active.start.y) < SLOP_PX) return;
      active.drawing = true;
      try {event.currentTarget.setPointerCapture(event.pointerId);} catch {/* already released */}
      startStroke(active);
    }
    active.points.push(next);
    paint();
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (scroll.current?.ids.has(event.pointerId)) {
      scroll.current.ids.delete(event.pointerId);
      if (!scroll.current.ids.size) scroll.current = null;
      suppressClick.current = true;
      return;
    }
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    if (!active.drawing) return;
    suppressClick.current = true;
    const current = held.current;
    if (!current) return;
    current.strokes = [...current.strokes, {pointerType: active.type, points: resampleInkPath(active.points, Math.min(MAX_POINTS, active.points.length))}];
    current.box = boxOf(current.strokes.flatMap(stroke => stroke.points));
    current.liftAt = Date.now();
    current.reading = undefined; current.decision = undefined;
    paint();
    recognise(current);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    scroll.current?.ids.delete(event.pointerId);
    if (pointer.current?.id === event.pointerId) {pointer.current = null; paint();}
  }

  function flushDeferred() {
    const pending = deferred.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    deferred.current = null;
    commit('move');
    if (inserted.current) setView({kind: 'idle'});
    inserted.current = null;
    replaying.current = true;
    try {pending.button.click();} finally {replaying.current = false;}
  }

  /** A key tapped while a drawing is held: the drawing goes in first (or is left out), then the key. */
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!enabled || replaying.current) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault(); event.stopPropagation();
      return;
    }
    const button = (event.target as HTMLElement).closest('button');
    if (!button) return;
    const current = held.current;
    if (current && !current.decision && readiness.current !== 'unavailable') {
      event.preventDefault(); event.stopPropagation();
      clearTimeout(deferred.current?.timer);
      deferred.current = {button, timer: setTimeout(flushDeferred, DEFERRED_TAP_MS)};
      return;
    }
    if (current) {
      commit('move');
      // The key goes in after the symbol, so it can no longer be replaced in place.
      if (inserted.current) setView({kind: 'idle'});
      inserted.current = null;
      return;
    }
    inserted.current = null;
    if (view.kind !== 'idle') setView({kind: 'idle'});
  }

  function choose(choice: LatentChoice) {
    if (held.current) {commit('move', choice); return;}
    const last = inserted.current;
    if (!last || !latest.current.onInsert(toPadSymbol(choice.symbol), true)) {inserted.current = null; setView({kind: 'idle'}); return;}
    if (last.auto) saveRecord({corrected: 1});
    const previous = last.alternatives.find(item => item.symbol.id === choice.symbol.id);
    const alternatives = [...last.alternatives.filter(item => item !== previous)];
    inserted.current = {...last, symbolId: choice.symbol.id, alternatives, auto: false};
    setView({kind: 'inserted', symbol: choice.symbol, alternatives});
  }

  /** The keyboard's Undo straight after an automatic insert counts as a correction. */
  function noteUndo() {
    if (inserted.current?.auto) saveRecord({corrected: 1});
    inserted.current = null;
    if (view.kind === 'inserted') setView({kind: 'idle'});
  }

  return {
    body, canvas, view, choose, noteUndo, clear: discard,
    bind: enabled ? {onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture} : {},
  };
}
