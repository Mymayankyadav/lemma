import manifest from "../../../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/manifest.json";

export const TUTOR_MODEL_ASSET_SET = manifest.assetSetVersion;
export const MODEL_MANIFEST = manifest;
export const MODEL_CLASS_COUNT = manifest.model.outputShape[1];
export const MODEL_INPUT_SIZE = manifest.model.inputShape[2];
export const MODEL_CLASS_SCORE_KIND = "logit" as const;

const CACHE_PREFIX = "lemma-tutor-symbol-assets-v";
const CACHE_NAME = `${CACHE_PREFIX}${manifest.cacheGeneration}-${TUTOR_MODEL_ASSET_SET}`;

type AssetFile = Readonly<{ path: string; bytes: number; sha256: string }>;

function assetUrl(file: AssetFile) {
  return new URL(
    `${import.meta.env.BASE_URL}models/tutor-symbols/${TUTOR_MODEL_ASSET_SET}/${file.path}`,
    self.location.origin,
  );
}

async function readVerifiedAsset(response: Response, file: AssetFile) {
  if (!response.ok || Number(response.headers.get("content-length")) > file.bytes) {
    throw new Error(`Could not read tutor model asset ${file.path}`);
  }

  const bytes = new Uint8Array(file.bytes);
  const reader = response.body?.getReader();
  if (reader) {
    let offset = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.byteLength > bytes.byteLength - offset) {
          await reader.cancel();
          throw new Error(`Tutor model asset is too large: ${file.path}`);
        }
        bytes.set(value, offset);
        offset += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== bytes.byteLength) throw new Error(`Incomplete tutor model asset: ${file.path}`);
  } else {
    const data = await response.arrayBuffer();
    if (data.byteLength !== bytes.byteLength) throw new Error(`Unexpected tutor model asset size: ${file.path}`);
    bytes.set(new Uint8Array(data));
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (sha256 !== file.sha256) throw new Error(`Tutor model asset integrity check failed: ${file.path}`);
  return bytes;
}

export async function loadVerifiedModelAsset(url: string, file: AssetFile, cache?: Cache) {
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {
      return await readVerifiedAsset(cached, file);
    } catch {
      await cache?.delete(url).catch(() => undefined);
    }
  }

  const response = await fetch(url, { mode: "same-origin", credentials: "omit", redirect: "error", cache: "no-store" });
  const bytes = await readVerifiedAsset(response, file);
  await cache?.put(url, new Response(bytes)).catch(() => undefined);
  return bytes;
}

function pruneRetiredAssetCaches() {
  return self.caches.keys().then(names => Promise.all(names.map(name => {
    if (!name.startsWith(CACHE_PREFIX)) return;
    const generation = Number(name.slice(CACHE_PREFIX.length).split("-", 1)[0]);
    // Keep the previous generation available to tabs waiting on the app's update prompt.
    if (generation > 0 && generation < manifest.cacheGeneration - 1) return self.caches.delete(name);
  })));
}

async function openAssetCache() {
  if (import.meta.env.MODE === "android") return;
  try {
    return await self.caches?.open(CACHE_NAME);
  } catch {
    // Storage denial should not prevent initializing from the packaged network response.
    return undefined;
  }
}

/** Only public, verified asset bytes go into CacheStorage. Android reads the same files from its APK. */
export async function loadTutorModelAssets() {
  const cache = await openAssetCache();
  const [model, metadata, wasm] = await Promise.all([
    loadVerifiedModelAsset(assetUrl(manifest.files.model).href, manifest.files.model, cache),
    loadVerifiedModelAsset(assetUrl(manifest.files.classes).href, manifest.files.classes, cache),
    loadWasm(cache),
  ]);
  if (cache) void pruneRetiredAssetCaches().catch(() => undefined);
  const classes: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadata));
  return { model, classes, wasm };
}

function loadWasm(cache?: Cache) {
  return loadVerifiedModelAsset(assetUrl(manifest.files.wasm).href, manifest.files.wasm, cache);
}

/** Equation Assist uses the same verified WASM binary as Draw symbol. */
export async function loadTutorModelWasm() {
  return loadWasm(await openAssetCache());
}
