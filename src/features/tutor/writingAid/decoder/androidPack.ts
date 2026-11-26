import descriptor from './android-fp16.json';
import {readVerifiedDecoderAsset, type DecoderAssetFile} from './assets';

export const ANDROID_TIER = 'neural-android-fp16' as const;
export const androidFp16Weights = descriptor.files.weights.sha256;
export const androidFiles = [descriptor.files.tokenizer, descriptor.files.prefill, descriptor.files.incremental, descriptor.files.weights];
export const androidBytes = androidFiles.reduce((sum, file) => sum + file.bytes, 0);
const ledger = 'lemma-typeahead-android-installs-v1';
const prefix = 'lemma-typeahead-fp16-' + descriptor.packageSha256 + '-';
const key = (name: string) => new URL('typeahead-local/' + name, self.location.origin).href;
const marker = () => key(descriptor.packageSha256);
const offlineMarker = () => key(descriptor.packageSha256 + '-web-runtime-v1');
export const packageChanged = 'lemma-typeahead-pack-changed';
export const downloadUrl = import.meta.env.VITE_TYPEAHEAD_FP16_URL as string | undefined;
export const webModelInstall = import.meta.env.MODE !== 'android';

export function modelDownloadUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw.trim());
    if (url.protocol === 'https:' && !url.username && !url.password && !url.hash) return url;
  } catch {/* A custom URL must be a complete HTTPS address. */}
}

async function activeCache() {
  if (!self.caches || !await self.caches.has(ledger)) return;
  const selected = await (await self.caches.open(ledger)).match(marker());
  const name = await selected?.text();
  if (name?.startsWith(prefix) && await self.caches.has(name)) {
    const entries = await (await self.caches.open(name)).keys();
    const keys = new Set(entries.map(entry => entry.url));
    if (androidFiles.every(file => keys.has(key(file.sha256)))) return name;
  }
}

export async function installedAndroidPack() {
  return Boolean(await activeCache().catch(() => undefined));
}

export async function installedModelHasOfflineSupport() {
  try {
    if (!webModelInstall) return await installedAndroidPack();
    const name = await activeCache();
    return Boolean(name && await (await self.caches.open(name)).match(offlineMarker()));
  } catch {return false;}
}

export async function readInstalledFile(file: DecoderAssetFile) {
  const name = await activeCache();
  const entry = name && await (await self.caches.open(name)).match(key(file.sha256));
  if (!entry) throw new Error('Optional model installation is incomplete');
  try {return await readVerifiedDecoderAsset(entry, file, fileLimit(file));}
  catch (error) {
    await (await self.caches.open(name)).delete(key(file.sha256));
    throw error;
  }
}

function fileLimit(file: DecoderAssetFile) {
  return file.sha256 === descriptor.files.weights.sha256 ? 72 * 2 ** 20 : 4 * 2 ** 20;
}

function announce() {
  window.dispatchEvent(new Event(packageChanged));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(packageChanged);
    channel.postMessage('changed');
    channel.close();
  }
}

async function clean(keep?: string) {
  for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== keep) await caches.delete(name);
}

export async function removeAndroidPack() {
  await navigator.locks.request(ledger, async () => {
    if (await caches.has(ledger)) await (await caches.open(ledger)).delete(marker());
    await clean();
    announce();
  });
}

export async function installAndroidPack(source: File | URL | undefined, signal: AbortSignal, progress: (bytes: number) => void, preparing?: () => void) {
  if (!navigator.locks || !self.caches) throw new Error('This browser cannot install an offline model');
  const hasTimeout = typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function';
  const deadline = webModelInstall && hasTimeout ? AbortSignal.timeout(5 * 60 * 1000) : undefined;
  if (deadline) signal = AbortSignal.any([signal, deadline]);
  try {
    await installLocked(source, signal, progress, preparing);
  } catch (error) {
    if (deadline?.aborted) throw new Error('The installation timed out. Check your connection and try again.');
    throw error;
  }
}

async function installLocked(source: File | URL | undefined, signal: AbortSignal, progress: (bytes: number) => void, preparing?: () => void) {
  await navigator.locks.request(ledger, {signal}, async () => {
    if (androidBytes > 72 * 2 ** 20 || androidFiles.some(file => file.bytes > fileLimit(file))) throw new Error('Invalid optional model budget');
    const previous = await activeCache();
    if (previous) {
      progress(androidBytes);
      if (webModelInstall && !await installedModelHasOfflineSupport()) {
        preparing?.();
        await prepareOfflineRuntime(signal);
        signal.throwIfAborted();
        await (await caches.open(previous)).put(offlineMarker(), new Response());
        announce();
      }
      return;
    }
    await clean();
    const name = prefix + crypto.randomUUID();
    const stage = await caches.open(name);
    try {
      let pack: Blob;
      if (source instanceof Blob) {
        pack = source;
      } else {
        const url = source ?? (downloadUrl && modelDownloadUrl(downloadUrl));
        if (!url) throw new Error('Enter a direct HTTPS link or choose the verified model file');
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Enter a direct HTTPS link');
        const response = await fetchPackage(url, signal);
        if (!response.ok || !response.body || Number(response.headers.get('content-length')) > androidBytes) throw new Error('Model download failed');
        const reader = response.body.getReader();
        const chunks: ArrayBuffer[] = [];
        let bytes = 0;
        try {
          for (;;) {
            const {value, done} = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > androidBytes) {await reader.cancel(); throw new Error('Model exceeds its declared download size');}
            chunks.push(value.slice().buffer);
            progress(bytes);
          }
        } finally {reader.releaseLock();}
        pack = new Blob(chunks);
      }
      if (pack.size !== androidBytes || pack.size > 72 * 2 ** 20) throw new Error('Model size does not match the pinned package');
      let at = 0;
      for (const file of androidFiles) {
        signal.throwIfAborted();
        const part = pack.slice(at, at + file.bytes);
        await readVerifiedDecoderAsset(new Response(part), file, fileLimit(file));
        await stage.put(key(file.sha256), new Response(part));
        at += file.bytes;
        if (source instanceof Blob) progress(at);
      }
      signal.throwIfAborted();
      if (webModelInstall) {
        preparing?.();
        await prepareOfflineRuntime(signal);
        signal.throwIfAborted();
        await stage.put(offlineMarker(), new Response());
      }
      signal.throwIfAborted();
      await (await caches.open(ledger)).put(marker(), new Response(name));
    } catch (error) {
      await caches.delete(name).catch(() => undefined);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('There is not enough browser storage. Free some space and try again.');
      }
      throw error;
    }
    announce();
  });
}

async function fetchPackage(url: URL, signal: AbortSignal): Promise<Response> {
  try {
    // No credentials, referrer or URL persistence, including for signed download links.
    return await fetch(url, {signal, mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store',
      referrerPolicy: 'no-referrer'});
  } catch {
    throw new Error('Could not reach the download. Check your connection and use a direct HTTPS link that allows downloads from Lemma.');
  }
}

async function prepareOfflineRuntime(signal: AbortSignal): Promise<void> {
  try {
    const {saveWritingModelSupport} = await import('./offlineModelAssets');
    await saveWritingModelSupport(signal);
  } catch (error) {
    if (signal.aborted || error instanceof DOMException && error.name === 'QuotaExceededError') throw error;
    throw new Error('Could not save the model runtime for offline use. Check your connection and browser storage, then try again.');
  }
}
