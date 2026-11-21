import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import { createInkRasterizer, type InkRasterizer } from "./detypifyRaster";
import { isModelClassName, isRecord, isWorkerRequest, type InkWorkerRequest, type InkWorkerResponse, type ModelClass } from "./inkRecognizerProtocol";
import {
  loadTutorModelAssets, MODEL_CLASS_COUNT, MODEL_CLASS_SCORE_KIND, MODEL_INPUT_SIZE, MODEL_MANIFEST, TUTOR_MODEL_ASSET_SET,
} from "./modelAssets";
import { symbolByGlyph, TUTOR_SYMBOL_CATALOG_VERSION } from "./symbolCatalog";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: InkWorkerResponse, transfer?: Transferable[]) => void;
};

type InferenceRequest = Extract<InkWorkerRequest, { type: "infer" }>;
let session: InferenceSession | undefined;
let rasterize: InkRasterizer | undefined;
let loading = false;
let busy = false;
let failed = false;
let pending: InferenceRequest | undefined;

function readClasses(metadata: unknown): ModelClass[] {
  if (!Array.isArray(metadata) || metadata.length !== MODEL_CLASS_COUNT) {
    throw new Error("Incompatible tutor symbol catalogue");
  }
  const glyphs = new Set<string>();
  const ids = new Set<string>();
  return metadata.map(entry => {
    if (!isRecord(entry) || typeof entry.char !== "string" || entry.char.length < 1 ||
        entry.char.length > 4 || glyphs.has(entry.char) || !Array.isArray(entry.names) ||
        !entry.names.length || entry.names.length > 8 || !entry.names.every(isModelClassName) ||
        ids.has(entry.names[0])) {
      throw new Error("Invalid tutor symbol metadata");
    }
    const classId = entry.names[0];
    ids.add(classId);
    glyphs.add(entry.char);
    const symbol = symbolByGlyph(entry.char);
    return {
      classId,
      ...(symbol && entry.names.some(name => symbol.recognizerIds.includes(name)) ? { symbolId: symbol.id } : {}),
    };
  });
}

function matchesTensor(metadata: InferenceSession.ValueMetadata | undefined, name: string, shape: number[]) {
  return metadata?.name === name && metadata.isTensor && metadata.type === "float32" &&
    metadata.shape.length === shape.length && metadata.shape.every((dim, index) => dim === shape[index]);
}

function workerRasterizer() {
  try {
    return typeof OffscreenCanvas === "undefined" ? undefined
      : createInkRasterizer(new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE));
  } catch {
    return undefined;
  }
}

function unavailable() {
  failed = true;
  pending = undefined;
  const current = session;
  session = undefined;
  if (current) void current.release().catch(() => undefined);
  scope.postMessage({ type: "unavailable", assetSetVersion: TUTOR_MODEL_ASSET_SET });
}

async function prepare() {
  if (loading || session || failed) return;
  loading = true;
  try {
    const { model: spec, runtime, catalogueVersion } = MODEL_MANIFEST;
    if (env.versions.web !== runtime.version || catalogueVersion !== TUTOR_SYMBOL_CATALOG_VERSION ||
        spec.scoreKind !== MODEL_CLASS_SCORE_KIND) {
      throw new Error("Mismatched tutor recognition runtime");
    }
    const { model, classes, wasm } = await loadTutorModelAssets();
    const inventory = readClasses(classes);
    env.wasm.numThreads = runtime.threads;
    env.wasm.proxy = false;
    // Supplying verified bytes uses the matching runtime JS bundled into this worker.
    env.wasm.wasmBinary = wasm;
    try {
      session = await InferenceSession.create(model, { executionProviders: ["wasm"] });
    } finally {
      delete env.wasm.wasmBinary;
    }
    if (session.inputMetadata.length !== 1 || session.outputMetadata.length !== 1 ||
        !matchesTensor(session.inputMetadata[0], spec.inputName, spec.inputShape) ||
        !matchesTensor(session.outputMetadata[0], spec.outputName, spec.outputShape)) {
      throw new Error("Mismatched tutor symbol tensors");
    }
    rasterize = workerRasterizer();
    scope.postMessage({
      type: "ready", assetSetVersion: TUTOR_MODEL_ASSET_SET,
      raster: rasterize ? "worker" : "main", classes: inventory,
    });
    void drain();
  } catch {
    unavailable();
  } finally {
    loading = false;
  }
}

async function drain() {
  if (busy || !session) return;
  busy = true;
  const { model: spec } = MODEL_MANIFEST;
  try {
    while (pending) {
      const { requestId, input } = pending;
      pending = undefined;
      const pixels = input.kind === "pixels" ? input.pixels : rasterize?.(input.strokes);
      let scores: Float32Array<ArrayBuffer> | null = null;
      if (pixels) {
        const tensor = new Tensor("float32", pixels, spec.inputShape);
        const outputs = await session.run({ [spec.inputName]: tensor });
        const data = outputs[spec.outputName]?.data;
        if (!(data instanceof Float32Array) || data.length !== MODEL_CLASS_COUNT || !data.every(Number.isFinite)) {
          throw new Error("Unexpected tutor symbol scores");
        }
        scores = new Float32Array(data);
      }
      scope.postMessage(
        { type: "result", assetSetVersion: TUTOR_MODEL_ASSET_SET, requestId, scores },
        scores ? [scores.buffer] : [],
      );
    }
  } catch {
    unavailable();
  } finally {
    busy = false;
  }
}

scope.onmessage = event => {
  if (failed || !isWorkerRequest(event.data)) return;
  if (event.data.type === "prepare") {
    void prepare();
  } else {
    pending = event.data;
    void drain();
  }
};
