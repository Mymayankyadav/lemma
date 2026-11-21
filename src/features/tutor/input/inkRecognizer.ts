import { createInkRasterizer, type InkRasterizer } from "./detypifyRaster";
import {
  isBoundedInkStrokes, isWorkerResponse, type InkWorkerInput, type InkWorkerRequest, type ModelClass,
} from "./inkRecognizerProtocol";
import { MODEL_CLASS_SCORE_KIND, TUTOR_MODEL_ASSET_SET } from "./modelAssets";
import type { InkInferenceResult, InkReadiness, InkSnapshot, InkSnapshotIdentity } from "./types";

export { TUTOR_MODEL_ASSET_SET } from "./modelAssets";

type InkRecognizerCallbacks = {
  onReadiness: (readiness: InkReadiness) => void;
  onResult: (result: InkInferenceResult) => void;
};
type ActiveRequest = { id: number; identity: InkSnapshotIdentity; cancelled: boolean };

const LOAD_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 10_000;

/** Editor identities stay on the main thread. A request number binds the response to an immutable snapshot. */
function identityOf(snapshot: InkSnapshot): InkSnapshotIdentity {
  const { sessionId, inkEpoch, inkRevision, sampledAtMs, assetSetVersion } = snapshot;
  return { sessionId, inkEpoch, inkRevision, sampledAtMs, assetSetVersion, target: { ...snapshot.target } };
}

export function createInkRecognizer({ onReadiness, onResult }: InkRecognizerCallbacks) {
  let readiness: InkReadiness = "unloaded";
  let worker: Worker | undefined;
  let classes: readonly ModelClass[] = [];
  let rasterize: InkRasterizer | undefined;
  let pending: InkSnapshot | undefined;
  let active: ActiveRequest | undefined;
  let nextRequestId = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function setReadiness(next: InkReadiness) {
    if (next === readiness) return;
    readiness = next;
    if (!disposed) onReadiness(next);
  }

  function stopTimeout() {
    clearTimeout(timeout);
    timeout = undefined;
  }

  function closeWorker() {
    stopTimeout();
    worker?.terminate();
    worker = undefined;
    pending = undefined;
    active = undefined;
    classes = [];
    rasterize = undefined;
  }

  function unavailable() {
    closeWorker();
    setReadiness("unavailable");
  }

  function finish(identity: InkSnapshotIdentity, scores: Float32Array | null) {
    onResult({
      ...identity,
      scoreKind: MODEL_CLASS_SCORE_KIND,
      rawScores: scores ? classes.map((entry, index) => ({ ...entry, score: scores[index] })) : [],
    });
  }

  function pump() {
    if (!pending || active || !worker || readiness !== "ready") return;
    const snapshot = pending;
    pending = undefined;
    const identity = identityOf(snapshot);
    try {
      if (snapshot.overBudget || !snapshot.strokes.length) {
        finish(identity, null);
        return;
      }

      let input: InkWorkerInput = { kind: "strokes", strokes: snapshot.strokes };
      if (rasterize) {
        const pixels = rasterize(snapshot.strokes);
        if (!pixels) {
          finish(identity, null);
          return;
        }
        input = { kind: "pixels", pixels };
      }

      active = { id: ++nextRequestId, identity, cancelled: false };
      const request: InkWorkerRequest = {
        type: "infer", assetSetVersion: TUTOR_MODEL_ASSET_SET, requestId: active.id, input,
      };
      worker.postMessage(request, input.kind === "pixels" ? [input.pixels.buffer] : []);
      timeout = setTimeout(unavailable, RUN_TIMEOUT_MS);
    } catch {
      unavailable();
    }
  }

  function prepare() {
    if (disposed || readiness === "loading" || readiness === "ready") return;
    try {
      const current = new Worker(new URL("./inkRecognizer.worker.ts", import.meta.url), { type: "module" });
      worker = current;
      const onError = () => {
        if (worker === current) unavailable();
      };
      current.onerror = onError;
      current.onmessageerror = onError;
      current.onmessage = (event: MessageEvent<unknown>) => {
        if (worker !== current) return;
        if (!isWorkerResponse(event.data) || event.data.type === "unavailable") {
          unavailable();
          return;
        }
        const message = event.data;
        if (message.type === "ready") {
          if (readiness !== "loading") return;
          try {
            rasterize = message.raster === "main" ? createInkRasterizer(document.createElement("canvas")) : undefined;
            if (message.raster === "main" && !rasterize) throw new Error("Tutor ink canvas unavailable");
          } catch {
            unavailable();
            return;
          }
          stopTimeout();
          classes = message.classes;
          setReadiness("ready");
          pump();
          return;
        }
        if (active?.id !== message.requestId) return;
        const completed = active;
        active = undefined;
        stopTimeout();
        if (!completed.cancelled) finish(completed.identity, message.scores);
        pump();
      };
      setReadiness("loading");
      if (worker !== current) return;
      const request: InkWorkerRequest = { type: "prepare", assetSetVersion: TUTOR_MODEL_ASSET_SET };
      current.postMessage(request);
      timeout = setTimeout(unavailable, LOAD_TIMEOUT_MS);
    } catch {
      unavailable();
    }
  }

  return {
    prepare,
    submit(snapshot: InkSnapshot) {
      if (disposed || snapshot.assetSetVersion !== TUTOR_MODEL_ASSET_SET || !isBoundedInkStrokes(snapshot.strokes)) return;
      pending = snapshot;
      if (readiness === "unloaded") prepare();
      pump();
    },
    cancel() {
      pending = undefined;
      if (active) active.cancelled = true;
    },
    dispose() {
      disposed = true;
      closeWorker();
    },
  };
}
