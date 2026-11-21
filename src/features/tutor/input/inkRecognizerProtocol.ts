import { INK_LIMITS } from "./inkSession";
import { MODEL_CLASS_COUNT, MODEL_INPUT_SIZE, TUTOR_MODEL_ASSET_SET } from "./modelAssets";
import type { InkStroke } from "./types";

export type ModelClass = Readonly<{ classId: string; symbolId?: string }>;
export type InkWorkerRaster = "worker" | "main";
export type InkWorkerInput =
  | { kind: "strokes"; strokes: readonly InkStroke[] }
  | { kind: "pixels"; pixels: Float32Array<ArrayBuffer> };

export type InkWorkerRequest =
  | { type: "prepare"; assetSetVersion: string }
  | { type: "infer"; assetSetVersion: string; requestId: number; input: InkWorkerInput };

export type InkWorkerResponse =
  | { type: "ready"; assetSetVersion: string; raster: InkWorkerRaster; classes: readonly ModelClass[] }
  | { type: "unavailable"; assetSetVersion: string }
  | { type: "result"; assetSetVersion: string; requestId: number; scores: Float32Array<ArrayBuffer> | null };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isModelClassName(value: unknown): value is string {
  return typeof value === "string" && /^[-.a-zA-Z0-9_]{1,64}$/.test(value);
}

function isPositiveRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanvasCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000;
}

export function isBoundedInkStrokes(value: unknown): value is readonly InkStroke[] {
  return Array.isArray(value) && value.length <= INK_LIMITS.strokes && value.every(stroke =>
    isRecord(stroke) && (
      stroke.pointerType === "pen" || stroke.pointerType === "touch" ||
      stroke.pointerType === "mouse" || stroke.pointerType === "unknown"
    ) && Array.isArray(stroke.points) && stroke.points.length > 0 &&
    stroke.points.length <= INK_LIMITS.pointsPerStroke && stroke.points.every(point =>
      isRecord(point) && isCanvasCoordinate(point.x) && isCanvasCoordinate(point.y) &&
      typeof point.t === "number" && Number.isFinite(point.t) &&
      (point.pressure === undefined || (
        typeof point.pressure === "number" && point.pressure >= 0 && point.pressure <= 1
      ))
    )
  );
}

export function isWorkerRequest(value: unknown): value is InkWorkerRequest {
  if (!isRecord(value) || value.assetSetVersion !== TUTOR_MODEL_ASSET_SET) return false;
  if (value.type === "prepare") return true;
  if (value.type !== "infer" || !isPositiveRequestId(value.requestId) || !isRecord(value.input)) return false;
  if (value.input.kind === "strokes") return isBoundedInkStrokes(value.input.strokes);
  return value.input.kind === "pixels" && value.input.pixels instanceof Float32Array &&
    value.input.pixels.length === MODEL_INPUT_SIZE ** 2 && value.input.pixels.every(pixel => pixel >= 0 && pixel <= 1);
}

export function isWorkerResponse(value: unknown): value is InkWorkerResponse {
  if (!isRecord(value) || value.assetSetVersion !== TUTOR_MODEL_ASSET_SET) return false;
  if (value.type === "unavailable") return true;
  if (value.type === "result") {
    return isPositiveRequestId(value.requestId) && (value.scores === null ||
      (value.scores instanceof Float32Array &&
        value.scores.length === MODEL_CLASS_COUNT && value.scores.every(Number.isFinite)));
  }
  if (value.type !== "ready" || (value.raster !== "main" && value.raster !== "worker") ||
      !Array.isArray(value.classes) || value.classes.length !== MODEL_CLASS_COUNT) return false;
  const seen = new Set<string>();
  for (const item of value.classes) {
    if (!isRecord(item) || !isModelClassName(item.classId) || seen.has(item.classId) ||
        (item.symbolId !== undefined && !isModelClassName(item.symbolId))) return false;
    seen.add(item.classId);
  }
  return true;
}
