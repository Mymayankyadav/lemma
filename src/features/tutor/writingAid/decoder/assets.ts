import manifest from '../../../../../public/models/writing-decoder/unigram-v1/manifest.json';
import {parseDecoderLexicon} from './lexicon';

export const DECODER_ASSET_MANIFEST = manifest;
export interface DecoderAssetFile {readonly path: string; readonly bytes: number; readonly sha256: string}
const MAX_ASSET_BYTES = 4 * 1024 * 1024;

/** Enforce the pinned length while streaming, before JSON parsing or index allocation. */
export async function readVerifiedDecoderAsset(response: Response, file: DecoderAssetFile, maxBytes = MAX_ASSET_BYTES): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > maxBytes ||
      !/^[a-f0-9]{64}$/u.test(file.sha256) || !response.ok ||
      Number(response.headers.get('content-length')) > file.bytes) throw new Error('Invalid decoder asset');
  const bytes = new Uint8Array(file.bytes);
  const reader = response.body?.getReader();
  if (reader) {
    let offset = 0;
    try {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        if (value.byteLength > bytes.byteLength - offset) {
          await reader.cancel();
          throw new Error('Decoder asset exceeds pinned size');
        }
        bytes.set(value, offset);
        offset += value.byteLength;
      }
    } finally {reader.releaseLock();}
    if (offset !== bytes.byteLength) throw new Error('Incomplete decoder asset');
  } else {
    const data = await response.arrayBuffer();
    if (data.byteLength !== bytes.byteLength) throw new Error('Unexpected decoder asset size');
    bytes.set(new Uint8Array(data));
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== file.sha256) throw new Error('Decoder asset integrity check failed');
  return bytes;
}

/** Cache only the public, verified lexicon. Prefixes and learner text are never persisted here. */
export async function loadWritingDecoderLexicon() {
  const file = manifest.file;
  const url = new URL(`${import.meta.env.BASE_URL}models/writing-decoder/${manifest.assetSetVersion}/${file.path}`,
    self.location.origin).href;
  let cache: Cache | undefined;
  try {
    if (import.meta.env.MODE !== 'android') cache = await self.caches?.open(`lemma-writing-decoder-${file.sha256}`);
  } catch {/* Storage denial still permits a verified network or packaged load. */}
  let bytes: Uint8Array | undefined;
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {bytes = await readVerifiedDecoderAsset(cached, file);}
    catch {await cache?.delete(url).catch(() => undefined);}
  }
  if (!bytes) {
    // A load deadline survives individual query cancellation, including caret selection during a cold load.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: controller.signal});
      bytes = await readVerifiedDecoderAsset(response, file);
    } finally {clearTimeout(timer);}
    await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
  }
  return parseDecoderLexicon(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));
}


/** Public assets are addressed by pinned hash. Each tier can enforce its own file budget. */
export async function fetchVerifiedTypeaheadFile(set: string, file: DecoderAssetFile, maxBytes: number, persist = true, offlineInstall?: AbortSignal): Promise<Uint8Array> {
  if (!/^[a-z0-9][a-z0-9_-]*$/u.test(set) || !/^[a-z0-9][a-z0-9_.-]*$/u.test(file.path)) throw new Error('Invalid typeahead path');
  const url = new URL(import.meta.env.BASE_URL + 'models/typeahead/' + set + '/' + file.path, self.location.origin).href;
  let cache: Cache | undefined;
  try {if (persist && import.meta.env.MODE !== 'android') cache = await self.caches?.open('lemma-typeahead-' + file.sha256);}
  catch {/* Verified network fallback. */}
  if (offlineInstall && !cache) throw new Error('Could not open offline model storage');
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {return await readVerifiedDecoderAsset(cached, file, maxBytes);}
    catch {await cache?.delete(url).catch(() => undefined);}
  }
  const controller = new AbortController();
  const timer = offlineInstall ? undefined : setTimeout(() => controller.abort(), 15000);
  try {
    const signal = offlineInstall ?? controller.signal;
    const response = await fetch(url, {mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store', signal});
    const bytes = await readVerifiedDecoderAsset(response, file, maxBytes);
    if (offlineInstall) {
      offlineInstall.throwIfAborted();
      await cache!.put(url, new Response(bytes.slice().buffer));
    } else {
      await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
    }
    return bytes;
  } finally {clearTimeout(timer);}
}
