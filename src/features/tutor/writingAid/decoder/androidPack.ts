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
export const packageChanged = 'lemma-typeahead-pack-changed';
export const downloadUrl = import.meta.env.VITE_TYPEAHEAD_FP16_URL as string | undefined;

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

export async function installAndroidPack(source: File | undefined, signal: AbortSignal, progress: (bytes: number) => void) {
  if (!navigator.locks || !self.caches) throw new Error('This browser cannot install an offline model');
  await navigator.locks.request(ledger, {signal}, async () => {
    if (androidBytes > 72 * 2 ** 20 || androidFiles.some(file => file.bytes > fileLimit(file))) throw new Error('Invalid optional model budget');
    const previous = await activeCache();
    if (previous) {progress(androidBytes); return;}
    await clean();
    const name = prefix + crypto.randomUUID();
    const stage = await caches.open(name);
    try {
      let pack: Blob;
      if (source) {
        pack = source;
      } else {
        if (!downloadUrl || new URL(downloadUrl).protocol !== 'https:') throw new Error('Choose the verified model file');
        const response = await fetch(downloadUrl, {signal, mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store'});
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
        if (source) progress(at);
      }
      signal.throwIfAborted();
      await (await caches.open(ledger)).put(marker(), new Response(name));
    } catch (error) {
      await caches.delete(name);
      throw error;
    }
    announce();
  });
}
