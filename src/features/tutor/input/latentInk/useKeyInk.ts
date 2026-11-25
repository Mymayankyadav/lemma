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
import type {KeyTouch} from '../../writingAid/decoder/ngramSpatial';
import {
  adaptiveThreshold, boxOf, continuesDrawing, decideOnPenUp, IDLE_COMMIT_MS, insertsOnIdle, insertsOnMove, readAutoInsertRecord,
  readLatentInk, RETRACT_WINDOW_MS, SETTLE_MS, writeAutoInsertRecord, type Box, type HoldDecision, type LatentChoice, type LatentReading,
} from './latentInkPolicy';

export const SLOP_PX = 10;
/** Keys tapped while the drawing is still being read wait, in order, at most this long for the reading. */
export const DEFERRED_TAP_MS = 800;
const MAX_STROKES = 12, MAX_POINTS = 96;
/** Space slides the caret sideways: a stroke starts there only when it first moves more up or down than across. */
const SLIDING_KEY = 'Space';

/** A keyboard edit, as data: queued while a drawing is read, it is applied later through the host's current guards. */
export type KeyEdit =
  | Readonly<{kind: 'insert'; text: string; typed?: boolean; touch?: KeyTouch}>
  | Readonly<{kind: 'delete'}>
  | Readonly<{kind: 'move'; direction: 'left' | 'right'; count: number}>;

/** What became of a drawing and the keyboard edits that waited for it. */
export type FlushResult = 'inserted' | 'skipped' | 'refused';

export interface KeyInkHandlers {
  /** A new drawing starts: the host records the answer and selection it belongs to. */
  onBegin: () => void;
  /**
   * In one step, where the drawing began: insert its symbol (or none), then the edits made while it was read. The
   * host refuses all of it ('refused') when the answer or its selection changed since onBegin, or it can no longer
   * be edited; nothing is then applied anywhere else.
   */
  onFlush: (symbol: SymbolDefinition | null, edits: readonly KeyEdit[]) => FlushResult;
  /** A keyboard edit made now, with no drawing waiting. */
  onKeyEdit: (edit: KeyEdit) => void;
  /** Replace the symbol this layer inserted last, while nothing else has changed. False when refused. */
  onReplace: (symbol: SymbolDefinition) => boolean;
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

/** A pointer the keys refused (a palm or finger while a pen is down or a stroke is under way, or the Delete press
 *  that cleared a drawing): its click is consumed once it lifts. */
type Rejected = {button: HTMLElement | null; released: boolean; at: number};
const REJECTED_CLICK_MS = 1000;

/** The pointer id a click carries (Pointer Events 3 makes click a PointerEvent); absent in older browsers. */
function clickPointerId(event: MouseEvent<HTMLElement>) {
  const id = (event.nativeEvent as globalThis.MouseEvent & {pointerId?: number}).pointerId;
  return typeof id === 'number' && id >= 0 ? id : undefined;
}

export function useKeyInk(enabled: boolean, handlers: KeyInkHandlers) {
  const area = useRef<HTMLElement | null>(null), canvas = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef(handlers);
  latest.current = handlers;
  const [view, setView] = useState<KeyInkView>({kind: 'idle'});
  const held = useRef<Held | null>(null), inserted = useRef<Inserted | null>(null), pointer = useRef<Pointer | null>(null);
  const epoch = useRef(0);
  /** The click that may follow a stroke (it is not a key tap): which pointer, and until when. */
  const strokeClick = useRef<{pointerId: number; until: number} | null>(null);
  /** Each refused pointer, until its click is consumed. */
  const rejected = useRef(new Map<number, Rejected>());
  /** True while the keys' own cancel is sent to the key a stroke began on (not a real cancellation). */
  const cancellingKey = useRef(false);
  /** Keyboard edits made while the drawing is being read, in the order they were made. */
  const deferred = useRef<{edits: KeyEdit[]; timer: ReturnType<typeof setTimeout>} | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readiness = useRef<InkReadiness>('unloaded');
  const recognizer = useRef<ReturnType<typeof createInkRecognizer> | null>(null);
  const lastSnapshot = useRef<InkSnapshot | null>(null);
  const record = useRef(readAutoInsertRecord(typeof localStorage === 'undefined' ? undefined : localStorage));

  useEffect(() => () => {
    clearTimeout(timer.current); clearTimeout(deferred.current?.timer);
    recognizer.current?.dispose(); recognizer.current = null;
  }, []);
  // The answer can no longer be edited here (read-only, composing, another surface): the drawing and any edits that
  // waited for it are dropped, never replayed into an editor state they were not made for.
  useEffect(() => {if (!enabled) drop('Drawing left out: the answer could not be edited.');}, [enabled]);

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

  /** Take the keyboard edits that waited for the drawing, in order. */
  function drainEdits(): KeyEdit[] {
    const pending = deferred.current;
    if (!pending) return [];
    clearTimeout(pending.timer);
    deferred.current = null;
    return pending.edits;
  }

  /** Drop the drawing, and the edits that waited for it, with a spoken note when anything was waiting. */
  function drop(message: string) {
    const waiting = Boolean(held.current) || Boolean(deferred.current);
    const edits = drainEdits().length;
    clearTimeout(timer.current);
    recognizer.current?.cancel();
    held.current = null; pointer.current = null; inserted.current = null;
    setView(waiting ? {kind: 'idle', message: edits ? `${message} ${edits} key${edits === 1 ? '' : 's'} tapped meanwhile left out too.` : message}
      : {kind: 'idle'});
    paint();
  }

  /** Clear the drawing on request (Delete). Edits that waited for it still go in where it began. */
  function clear() {
    clearTimeout(timer.current);
    recognizer.current?.cancel();
    held.current = null;
    const edits = drainEdits();
    if (edits.length && latest.current.onFlush(null, edits) === 'refused') {
      setView({kind: 'idle', message: 'The answer changed, so the keys tapped meanwhile were left out.'});
    } else setView({kind: 'idle'});
    inserted.current = null;
    paint();
  }

  /**
   * Insert the held reading (or leave it out) together with the edits that waited for it, clear the paper and keep
   * the alternatives for a one-tap replace.
   */
  function commit(reason: 'settle' | 'idle' | 'move', choice?: LatentChoice) {
    const current = held.current;
    const edits = drainEdits();
    if (!current) {
      if (edits.length && latest.current.onFlush(null, edits) === 'refused') setView({kind: 'idle', message: 'The answer changed, so the keys tapped meanwhile were left out.'});
      return;
    }
    clearTimeout(timer.current);
    recognizer.current?.cancel();
    held.current = null;
    const decision = current.decision ?? 'none';
    const allowed = Boolean(choice) || (reason === 'move' ? insertsOnMove(decision) : insertsOnIdle(decision));
    const picked = allowed ? choice ?? current.reading?.choices[0] : undefined;
    const result = latest.current.onFlush(picked?.symbol ?? null, edits);
    inserted.current = null;
    if (result === 'refused') {
      setView({kind: 'idle', message: 'Drawing left out: the answer changed while it was being read.'
        + (edits.length ? ` ${edits.length} key${edits.length === 1 ? '' : 's'} tapped meanwhile left out too.` : '')});
    } else if (result === 'inserted' && picked) {
      const auto = !choice;
      if (auto) saveRecord({inserted: 1});
      const alternatives = (current.reading?.choices ?? []).filter(item => item.symbol.id !== picked.symbol.id);
      // Keys that went in after it mean it can no longer be replaced in place.
      if (!edits.length) {
        inserted.current = {strokes: current.strokes, box: current.box, at: Date.now(), liftAt: current.liftAt, decision,
          symbol: picked.symbol, alternatives, auto};
        setView({kind: 'inserted', symbol: picked.symbol, alternatives});
      } else setView({kind: 'idle'});
    } else {
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
    // Reading is shown before submitting: an unavailable model answers synchronously (its geometry fallback must not
    // be hidden behind empty Reading slots afterwards).
    setView({kind: 'reading'});
    recognizer.current.submit(snapshot);
  }

  function point(event: PointerEvent<HTMLElement>): InkPoint {
    const rect = area.current!.getBoundingClientRect();
    return {
      x: Math.max(0, event.clientX - rect.left), y: Math.max(0, event.clientY - rect.top), t: event.timeStamp,
      ...(event.pointerType === 'pen' && event.pressure > 0 ? {pressure: Math.min(1, event.pressure)} : {}),
    };
  }

  function startStroke(active: Pointer) {
    // Keys tapped while the previous drawing was read go in before this stroke starts anything new.
    if (deferred.current) flushDeferred();
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
      latest.current.onBegin();
    }
  }

  /** Let the key under a stroke end its press the way it ends any cancelled press (no preview, no long-press digit). */
  function cancelKeyPress(key: HTMLElement | null, pointerId: number) {
    if (!key) return;
    const event = typeof PointerEvent === 'function'
      ? new PointerEvent('pointercancel', {bubbles: true, pointerId})
      : Object.assign(new Event('pointercancel', {bubbles: true}), {pointerId});
    cancellingKey.current = true;
    try {key.dispatchEvent(event);} finally {cancellingKey.current = false;}
  }

  function reject(event: PointerEvent<HTMLElement>) {
    rejected.current.set(event.pointerId, {
      button: event.target instanceof Element ? event.target.closest('button') : null, released: false, at: Date.now(),
    });
  }

  function onPointerDownCapture(event: PointerEvent<HTMLElement>) {
    if (!enabled || event.button !== 0) return;
    const now = Date.now();
    for (const [id, entry] of rejected.current) if (entry.released && now - entry.at > REJECTED_CLICK_MS) rejected.current.delete(id);
    const owner = pointer.current;
    if (owner && owner.id !== event.pointerId && (owner.drawing || owner.type === 'pen')) {
      // A pen down, or a stroke under way, owns the keys: another pointer (a palm, a resting finger; pen and touch
      // can each be primary at once) neither draws nor presses the key under it, and its own click is consumed.
      event.preventDefault(); event.stopPropagation();
      reject(event);
      return;
    }
    if (!event.isPrimary) return;
    strokeClick.current = null;
    const label = keyLabel(event.target);
    if (label === 'Delete') {
      // Delete clears a held drawing instead of the answer (its own press never runs, so its click is consumed
      // below); straight after an automatic insert it is a correction.
      if (held.current) {
        event.preventDefault(); event.stopPropagation();
        reject(event);
        clear();
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
    const refused = rejected.current.get(event.pointerId);
    if (refused) {refused.released = true; refused.at = Date.now(); return;}
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    if (!active.drawing) return;
    event.stopPropagation();
    // The click that may follow a stroke is not a key tap. Some browsers send none after a captured pointer.
    strokeClick.current = {pointerId: event.pointerId, until: Date.now() + 400};
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
    // The keys' own cancel to the key a stroke began on is not a cancellation of the pointer.
    if (cancellingKey.current) return;
    rejected.current.delete(event.pointerId);
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    // A real cancellation releases the pointer (and with it a pen's hold on the keys), drawing or not.
    pointer.current = null;
    if (!active.drawing) return;
    const current = held.current;
    if (current && !current.strokes.length) {
      // A cancelled first stroke leaves nothing to read: no drawing is held, and keys waiting for it go in now.
      held.current = null;
      setView({kind: 'idle'});
      if (deferred.current) commit('move');
    } else if (current) {
      // A cancelled continuation: the strokes already drawn resume where they were (their idle insert, or a reading).
      if (current.decision) schedule(current);
      else if (lastSnapshot.current?.inkEpoch !== current.epoch || lastSnapshot.current.inkRevision !== current.strokes.length) recognise(current);
    }
    paint();
  }

  /** The reading is in (or took too long): the drawing goes in first, or is left out, then the waiting edits. */
  function flushDeferred() {
    if (!deferred.current) return;
    commit('move');
    endInsert();
  }

  /** The keyboard's edits go through here: the held drawing goes in first (or is left out), then the edit. While
   *  the drawing is still being read, edits wait in order, as data, and are applied with it in one guarded step.
   *  This covers taps, long-press alternates, Space's caret slide and Delete alike, whatever triggers them. */
  function beforeKeyEdit(edit: KeyEdit) {
    const current = held.current;
    if (enabled && (deferred.current || current && !current.decision && readiness.current !== 'unavailable')) {
      if (deferred.current) deferred.current.edits.push(edit);
      else deferred.current = {edits: [edit], timer: setTimeout(flushDeferred, DEFERRED_TAP_MS)};
      return;
    }
    if (current) commit('move');
    endInsert();
    latest.current.onKeyEdit(edit);
  }

  /** Before the keys give way to another surface: settle what is pending while its answer is still the same. */
  function settle(): boolean {
    if (!held.current && !deferred.current) return false;
    commit('move');
    endInsert();
    return true;
  }

  /** The key goes in after the symbol, so the symbol can no longer be replaced in place. */
  function endInsert() {
    if (!inserted.current) return;
    inserted.current = null;
    setView(current => current.kind === 'inserted' ? {kind: 'idle'} : current);
  }

  /**
   * Clicks that are not key taps: a refused pointer's (matched by the click's pointer id, or, where clicks carry none,
   * by a refused pointer already lifted on the same key), and the one after a stroke. Each is consumed on its own, so
   * one cannot clear another's, and the owner's own tap on a key a refused contact rests on still counts.
   */
  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!enabled) return;
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    const id = clickPointerId(event);
    const consume = () => {event.preventDefault(); event.stopPropagation();};
    if (id !== undefined && rejected.current.has(id)) {rejected.current.delete(id); consume(); return;}
    if (id === undefined) {
      for (const [refusedId, entry] of rejected.current) {
        if (entry.released && entry.button === button) {rejected.current.delete(refusedId); consume(); return;}
      }
    }
    const stroke = strokeClick.current;
    if (stroke && Date.now() < stroke.until && (id === undefined || id === stroke.pointerId)) {
      strokeClick.current = null;
      consume();
    }
  }

  /** A reading tapped in the strip: insert it, or replace the symbol just inserted with it. */
  function choose(choice: LatentChoice) {
    if (held.current) {commit('move', choice); return;}
    const last = inserted.current;
    if (!last) return;
    if (choice.symbol.id === last.symbol.id) {inserted.current = null; setView({kind: 'idle'}); return;}
    if (!latest.current.onReplace(choice.symbol)) {inserted.current = null; setView({kind: 'idle'}); return;}
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

  /** The answer or its selection changed under a drawing being read or held: it can no longer go in where it began. */
  function invalidate() {
    if (held.current || deferred.current) drop('Drawing left out: the answer changed while it was being read.');
  }

  const attach = useCallback((node: HTMLElement | null) => {
    if (area.current && !node) {
      clearTimeout(timer.current);
      held.current = null; pointer.current = null; inserted.current = null;
      setView({kind: 'idle'});
      // The keys gave way (the host settles first where it can): anything still pending is dropped, not replayed.
      drainEdits();
    }
    area.current = node;
  }, []);

  return {
    view, choose, forgetInsert, invalidate, beforeKeyEdit, settle, attach, canvas,
    /** A drawing is being read or held (its selection must not change under it). */
    holding: () => Boolean(held.current),
    bind: enabled ? {onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture, onPointerCancelCapture, onClickCapture} : undefined,
  };
}
