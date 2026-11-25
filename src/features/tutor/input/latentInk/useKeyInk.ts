/**
 * N249 · The tutor's keys double as paper for one symbol at a time. A touch that stays put is a key tap; one that
 * moves more than SLOP_PX draws over the keys, and the key under it is not pressed. Delete keeps its press-and-repeat
 * (and clears a held drawing); Space keeps its sideways caret slide. The readings take the strip's three
 * slots; when a drawn symbol goes in is decided by latentInkPolicy.ts. Nothing is added to the keyboard's layout: the
 * ink is drawn on a canvas laid over the keys.
 */
import {useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent} from 'react';
import {createInkRecognizer, TUTOR_MODEL_ASSET_SET} from '../inkRecognizer';
import {resampleInkPath} from '../inkGeometry';
import {matchPartialSymbols} from '../partialSymbolMatcher';
import type {SymbolDefinition} from '../symbolCatalog';
import type {InkPoint, InkReadiness, InkSnapshot, InkStroke} from '../types';
import {
  adaptiveThreshold, boxOf, continuesDrawing, decideOnPenUp, IDLE_COMMIT_MS, insertsOnIdle, insertsOnMove, readAutoInsertRecord,
  readLatentInk, RETRACT_WINDOW_MS, SETTLE_MS, writeAutoInsertRecord, type Box, type HoldDecision, type LatentChoice, type LatentReading,
} from './latentInkPolicy';

export const SLOP_PX = 10;
/** A key tapped while the drawing is still being read waits at most this long for the reading. */
export const DEFERRED_TAP_MS = 800;
const MAX_STROKES = 12, MAX_POINTS = 96;
/** Space slides the caret sideways: a stroke starts there only when it first moves more up or down than across. */
const SLIDING_KEY = 'Space';

export interface KeyInkHandlers {
  /** Insert at the caret, or (replace) in place of the symbol this layer inserted last. False when refused. */
  onInsert: (symbol: SymbolDefinition, replace: boolean) => boolean;
  /** Take back the symbol this layer inserted last, if nothing has changed since. */
  onRetract: () => boolean;
}

type Held = {epoch: number; strokes: InkStroke[]; box?: Box; liftAt: number; reading?: LatentReading; decision?: HoldDecision};
type Inserted = {strokes: InkStroke[]; box?: Box; at: number; liftAt: number; decision: HoldDecision; symbol: SymbolDefinition;
  alternatives: readonly LatentChoice[]; auto: boolean};
type Pointer = {id: number; type: InkStroke['pointerType']; start: InkPoint; points: InkPoint[]; drawing: boolean; key: HTMLElement | null;
  sliding: boolean};

/** What the strip shows for the drawing: its readings while held, or after an insert the symbol and its alternatives. */
export type KeyInkView =
  | {kind: 'idle'; message?: string}
  | {kind: 'reading'}
  | {kind: 'held'; choices: readonly LatentChoice[]; preferred: boolean}
  | {kind: 'inserted'; symbol: SymbolDefinition; alternatives: readonly LatentChoice[]};

const keyLabel = (target: EventTarget | null) =>
  target instanceof Element ? target.closest('button')?.getAttribute('aria-label') ?? null : null;

/** Let the key under a stroke end its press the way it ends any cancelled press (no preview, no long-press digit). */
function cancelKeyPress(key: HTMLElement | null, pointerId: number) {
  if (!key) return;
  const event = typeof PointerEvent === 'function'
    ? new PointerEvent('pointercancel', {bubbles: true, pointerId})
    : Object.assign(new Event('pointercancel', {bubbles: true}), {pointerId});
  key.dispatchEvent(event);
}

export function useKeyInk(enabled: boolean, handlers: KeyInkHandlers) {
  const area = useRef<HTMLElement | null>(null), canvas = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef(handlers);
  latest.current = handlers;
  const [view, setView] = useState<KeyInkView>({kind: 'idle'});
  const held = useRef<Held | null>(null), inserted = useRef<Inserted | null>(null), pointer = useRef<Pointer | null>(null);
  const epoch = useRef(0), suppressClickUntil = useRef(0), replaying = useRef(false);
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
    const node = canvas.current, host = area.current;
    if (!node || !host) return;
    const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
    const width = host.clientWidth, height = host.clientHeight;
    if (node.width !== Math.round(width * ratio) || node.height !== Math.round(height * ratio)) {
      node.width = Math.round(width * ratio); node.height = Math.round(height * ratio);
    }
    const context = node.getContext?.('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const strokes = [...(held.current?.strokes ?? []), ...(pointer.current?.drawing ? [{points: pointer.current.points}] : [])];
    if (!strokes.length) return;
    const style = getComputedStyle(host);
    context.lineWidth = 3.5; context.lineCap = context.lineJoin = 'round';
    context.strokeStyle = style.getPropertyValue('--v7-role-action-bg').trim() || style.color || '#3b3bc4';
    for (const stroke of strokes) {
      context.beginPath();
      stroke.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
    }
  }

  function saveRecord(change: {inserted?: number; corrected?: number}) {
    const current = record.current ?? {inserted: 0, corrected: 0};
    record.current = {inserted: Math.max(0, current.inserted + (change.inserted ?? 0)), corrected: current.corrected + (change.corrected ?? 0)};
    writeAutoInsertRecord(typeof localStorage === 'undefined' ? undefined : localStorage, record.current);
  }

  function discard() {
    clearTimeout(timer.current);
    clearTimeout(deferred.current?.timer); deferred.current = null;
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
    const allowed = Boolean(choice) || (reason === 'move' ? insertsOnMove(decision) : insertsOnIdle(decision));
    const picked = choice ?? current.reading?.choices[0];
    if (allowed && picked && latest.current.onInsert(picked.symbol, false)) {
      const auto = !choice;
      if (auto) saveRecord({inserted: 1});
      const alternatives = (current.reading?.choices ?? []).filter(item => item.symbol.id !== picked.symbol.id);
      inserted.current = {strokes: current.strokes, box: current.box, at: Date.now(), liftAt: current.liftAt, decision,
        symbol: picked.symbol, alternatives, auto};
      setView({kind: 'inserted', symbol: picked.symbol, alternatives});
    } else {
      inserted.current = null;
      setView({kind: 'idle', message: current.reading?.choices.length
        ? 'Drawing left out: it was unclear. Draw it again, or choose a reading before moving on.'
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

  function settleReading(current: Held, reading: LatentReading) {
    current.reading = reading;
    current.decision = decideOnPenUp(reading, adaptiveThreshold(record.current));
    setView(reading.choices.length ? {kind: 'held', choices: reading.choices, preferred: current.decision !== 'choose' && current.decision !== 'none'}
      : {kind: 'held', choices: [], preferred: false});
    if (deferred.current) {flushDeferred(); return;}
    if (!pointer.current?.drawing) schedule(current);
  }

  function recognise(current: Held) {
    const host = area.current;
    const snapshot: InkSnapshot = {
      target: {scopeKey: 'tutor-key-ink', mountId: 'keys', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
      sessionId: 'tutor-key-ink', inkEpoch: current.epoch, inkRevision: current.strokes.length, sampledAtMs: Date.now(),
      assetSetVersion: TUTOR_MODEL_ASSET_SET, strokes: current.strokes,
      viewport: {width: host?.clientWidth || 1, height: host?.clientHeight || 1},
      overBudget: current.strokes.length > MAX_STROKES, interrupted: false, completedRevision: current.strokes.length,
    };
    lastSnapshot.current = snapshot;
    if (readiness.current === 'unavailable' || snapshot.overBudget) {
      settleReading(current, readLatentInk(undefined, matchPartialSymbols(snapshot)));
      return;
    }
    recognizer.current ??= createInkRecognizer({
      onReadiness: state => {
        readiness.current = state;
        if (state === 'unavailable' && held.current && !held.current.decision) recognise(held.current);
      },
      // Results are matched to the held drawing by epoch and stroke count, and read against its newest snapshot.
      onResult: result => {
        const now = held.current, latestSnapshot = lastSnapshot.current;
        if (!now || !latestSnapshot || now.epoch !== result.inkEpoch || now.strokes.length !== result.inkRevision) return;
        settleReading(now, readLatentInk(result, matchPartialSymbols(latestSnapshot)));
      },
    });
    recognizer.current.submit(snapshot);
    setView({kind: 'reading'});
  }

  function point(event: PointerEvent<HTMLElement>): InkPoint {
    const rect = area.current!.getBoundingClientRect();
    return {
      x: Math.max(0, event.clientX - rect.left), y: Math.max(0, event.clientY - rect.top), t: event.timeStamp,
      ...(event.pointerType === 'pen' && event.pressure > 0 ? {pressure: Math.min(1, event.pressure)} : {}),
    };
  }

  function startStroke(active: Pointer) {
    const now = Date.now();
    clearTimeout(timer.current);
    const current = held.current;
    // A stroke away from the held drawing starts the next symbol: the held one is settled first and stays put.
    if (current && !continuesDrawing(current.box, active.start, now - current.liftAt, current.decision)) {
      commit('move'); inserted.current = null;
    }
    if (!held.current) {
      const last = inserted.current;
      // Only an extendable symbol that went in because the learner paused is taken back.
      if (last && last.auto && last.decision === 'insert-on-move' && now - last.at < RETRACT_WINDOW_MS
        && continuesDrawing(last.box, active.start, now - last.liftAt, last.decision) && latest.current.onRetract()) {
        saveRecord({inserted: -1});
        held.current = {epoch: ++epoch.current, strokes: last.strokes, box: last.box, liftAt: last.liftAt};
      } else held.current = {epoch: ++epoch.current, strokes: [], liftAt: now};
      inserted.current = null;
    }
  }

  function onPointerDownCapture(event: PointerEvent<HTMLElement>) {
    if (!enabled || !event.isPrimary || event.button !== 0) return;
    suppressClickUntil.current = 0;
    const label = keyLabel(event.target);
    if (label === 'Delete') {
      // Delete clears a held drawing instead of the answer; straight after an automatic insert it is a correction.
      if (held.current) {
        event.preventDefault(); event.stopPropagation();
        discard();
        return;
      }
      if (inserted.current?.auto) saveRecord({corrected: 1});
      if (inserted.current) {inserted.current = null; setView({kind: 'idle'});}
      return;
    }
    const start = point(event);
    const key = event.target instanceof Element ? event.target.closest('button') : null;
    pointer.current = {id: event.pointerId, start, points: [start], drawing: false, key, sliding: label === SLIDING_KEY,
      type: event.pointerType === 'pen' || event.pointerType === 'touch' || event.pointerType === 'mouse' ? event.pointerType : 'unknown'};
  }

  function onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const next = point(event);
    if (!active.drawing) {
      const dx = next.x - active.start.x, dy = next.y - active.start.y;
      if (Math.hypot(dx, dy) < SLOP_PX) return;
      // Sideways on Space is the caret slide (its first step is 12 px, past the slop), unless a drawing is held or has
      // just gone in: then it is the next stroke (the bar of a ≤ often lands on the space bar).
      const drawingNow = Boolean(held.current) || Boolean(inserted.current && Date.now() - inserted.current.at < RETRACT_WINDOW_MS);
      if (active.sliding && !drawingNow && Math.abs(dx) >= Math.abs(dy)) {pointer.current = null; return;}
      // The key ends its press first (its cancel passes through here while the pointer is not yet drawing).
      cancelKeyPress(active.key, event.pointerId);
      active.drawing = true;
      try {area.current?.setPointerCapture(event.pointerId);} catch {/* the pointer is already gone */}
      startStroke(active);
    }
    event.stopPropagation();
    active.points.push(next);
    paint();
  }

  function onPointerUpCapture(event: PointerEvent<HTMLElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    if (!active.drawing) return;
    event.stopPropagation();
    // The click that may follow a stroke is not a key tap. Some browsers send none after a captured pointer.
    suppressClickUntil.current = Date.now() + 400;
    const current = held.current;
    if (!current) return;
    current.strokes = [...current.strokes, {pointerType: active.type, points: resampleInkPath(active.points, Math.min(MAX_POINTS, active.points.length))}];
    current.box = boxOf(current.strokes.flatMap(stroke => stroke.points));
    current.liftAt = Date.now();
    current.reading = undefined; current.decision = undefined;
    paint();
    recognise(current);
  }

  function onPointerCancelCapture(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id !== event.pointerId || !pointer.current.drawing) {
      if (pointer.current?.id === event.pointerId && event.target === area.current) pointer.current = null;
      return;
    }
    pointer.current = null;
    paint();
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
  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!enabled || replaying.current) return;
    if (Date.now() < suppressClickUntil.current) {
      suppressClickUntil.current = 0;
      event.preventDefault(); event.stopPropagation();
      return;
    }
    const button = event.target instanceof Element ? event.target.closest('button') : null;
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
      // The key goes in after the symbol, so the symbol can no longer be replaced in place.
      if (inserted.current) setView({kind: 'idle'});
      inserted.current = null;
      return;
    }
    if (inserted.current) {inserted.current = null; setView({kind: 'idle'});}
  }

  /** A reading tapped in the strip: insert it, or replace the symbol just inserted with it. */
  function choose(choice: LatentChoice) {
    if (held.current) {commit('move', choice); return;}
    const last = inserted.current;
    if (!last) return;
    if (choice.symbol.id === last.symbol.id) {inserted.current = null; setView({kind: 'idle'}); return;}
    if (!latest.current.onInsert(choice.symbol, true)) {inserted.current = null; setView({kind: 'idle'}); return;}
    if (last.auto) saveRecord({corrected: 1});
    const alternatives = [{symbol: last.symbol, confidence: 0}, ...last.alternatives.filter(item => item.symbol.id !== choice.symbol.id)];
    inserted.current = {...last, symbol: choice.symbol, alternatives, auto: false};
    setView({kind: 'inserted', symbol: choice.symbol, alternatives});
  }

  /** Something else changed the answer (typing in the field, a suggestion): the symbol can no longer be replaced. */
  const forgetInsert = useCallback(() => {
    if (!inserted.current) return;
    inserted.current = null;
    setView(current => current.kind === 'inserted' ? {kind: 'idle'} : current);
  }, []);

  const attach = useCallback((node: HTMLElement | null) => {
    if (area.current && !node) {
      clearTimeout(timer.current);
      held.current = null; pointer.current = null; inserted.current = null;
      setView({kind: 'idle'});
    }
    area.current = node;
  }, []);

  return {
    view, choose, forgetInsert, attach, canvas,
    bind: enabled ? {onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture, onPointerCancelCapture, onClickCapture} : undefined,
  };
}
