// @vitest-environment node
import {createHash} from 'node:crypto';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {installedAndroidPack, installedModelHasOfflineSupport, installAndroidPack, modelDownloadUrl, readInstalledFile,
  removeAndroidPack, androidFiles} from '../../../src/features/tutor/writingAid/decoder/androidPack';

const fixture = vi.hoisted(() => ({
  roles: ['tokenizer', 'prefill', 'incremental', 'weights'],
  support: vi.fn<(signal: AbortSignal) => Promise<void>>(),
}));
vi.mock('../../../src/features/tutor/writingAid/decoder/android-fp16.json', async () => {
  const {createHash} = await import('node:crypto');
  const file = (role: string) => ({path: role, bytes: role.length, sha256: createHash('sha256').update(role).digest('hex')});
  return {default: {
    packageSha256: createHash('sha256').update(fixture.roles.join('')).digest('hex'),
    files: Object.fromEntries(fixture.roles.map(role => [role, file(role)])),
  }};
});
vi.mock('../../../src/features/tutor/writingAid/decoder/offlineModelAssets',
  () => ({saveWritingModelSupport: fixture.support}));

const packageText = fixture.roles.join('');
const customUrl = new URL('https://models.example/pinned.pack?signature=example');
const progress = vi.fn<(bytes: number) => void>();
const prepare = vi.fn<() => void>();
const cacheStorage = new Map<string, Map<string, Response>>();
const fetchPackage = vi.fn<typeof fetch>();

beforeEach(() => {
  cacheStorage.clear();
  fixture.support.mockReset().mockResolvedValue();
  fetchPackage.mockReset().mockImplementation(async () => new Response(packageText));
  const caches = {
    has: async (name: string) => cacheStorage.has(name),
    keys: async () => [...cacheStorage.keys()],
    delete: async (name: string) => cacheStorage.delete(name),
    open: async (name: string) => {
      const entries = cacheStorage.get(name) ?? new Map<string, Response>();
      cacheStorage.set(name, entries);
      return {
        match: async (url: string) => entries.get(url)?.clone(),
        put: async (url: string, response: Response) => {entries.set(url, response.clone());},
        delete: async (url: string) => entries.delete(url),
        keys: async () => [...entries.keys()].map(url => new Request(url)),
      };
    },
  };
  vi.stubGlobal('self', {location: {origin: 'https://lemma.example'}, caches});
  vi.stubGlobal('caches', caches);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', {locks: {request: async (_name: string, options: {signal: AbortSignal} | (() => Promise<void>),
    callback?: () => Promise<void>) => typeof options === 'function' ? options() : callback?.()}});
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('fetch', fetchPackage);
});

afterEach(() => vi.unstubAllGlobals());

test('requires a complete HTTPS link and permits a signed download query', () => {
  expect(modelDownloadUrl('  ' + customUrl.href + '  ')?.href).toBe(customUrl.href);
  for (const link of ['http://models.example/pinned.pack', '/pinned.pack', 'https://who:secret@models.example/pinned.pack',
    'https://models.example/pinned.pack#download']) expect(modelDownloadUrl(link)).toBeUndefined();
});

test('installs verified roles and required offline support, then reads the roles without a network', async () => {
  await installAndroidPack(customUrl, new AbortController().signal, progress, prepare);
  expect(fetchPackage).toHaveBeenCalledWith(customUrl, expect.objectContaining({
    credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', cache: 'no-store', redirect: 'error',
  }));
  expect(progress).toHaveBeenLastCalledWith(packageText.length);
  expect(prepare).toHaveBeenCalledOnce();
  expect(fixture.support).toHaveBeenCalledOnce();
  expect(await installedModelHasOfflineSupport()).toBe(true);
  fetchPackage.mockRejectedValue(new TypeError('offline'));
  for (const file of androidFiles) {
    const bytes = await readInstalledFile(file);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
  }
  expect(fetchPackage).toHaveBeenCalledOnce();
  await removeAndroidPack();
  expect(await installedAndroidPack()).toBe(false);
  expect(await installedModelHasOfflineSupport()).toBe(false);
});

test('rejects a corrupt package or failed runtime save and leaves a clean retry', async () => {
  fetchPackage.mockResolvedValueOnce(new Response(packageText.toUpperCase()));
  await expect(installAndroidPack(customUrl, new AbortController().signal, progress)).rejects.toThrow('integrity');
  expect(await installedAndroidPack()).toBe(false);
  expect(cacheStorage.size).toBe(0);
  expect(fixture.support).not.toHaveBeenCalled();

  fixture.support.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
  await expect(installAndroidPack(customUrl, new AbortController().signal, progress)).rejects.toThrow('browser storage');
  expect(await installedAndroidPack()).toBe(false);
  expect(cacheStorage.size).toBe(0);
  await installAndroidPack(customUrl, new AbortController().signal, progress);
  expect(await installedModelHasOfflineSupport()).toBe(true);
});

test('canceling during offline setup leaves no installed marker', async () => {
  const controller = new AbortController();
  fixture.support.mockImplementationOnce(async () => controller.abort());
  await expect(installAndroidPack(customUrl, controller.signal, progress)).rejects.toThrow('aborted');
  expect(await installedAndroidPack()).toBe(false);
  expect(cacheStorage.size).toBe(0);
});

test('prepares offline support for an existing package without downloading it again', async () => {
  const signal = new AbortController().signal;
  await installAndroidPack(customUrl, signal, progress);
  for (const entries of cacheStorage.values()) {
    for (const key of entries.keys()) if (key.endsWith('-web-runtime-v1')) entries.delete(key);
  }
  expect(await installedAndroidPack()).toBe(true);
  expect(await installedModelHasOfflineSupport()).toBe(false);

  await installAndroidPack(undefined, signal, progress);
  expect(fetchPackage).toHaveBeenCalledOnce();
  expect(fixture.support).toHaveBeenCalledTimes(2);
  expect(await installedModelHasOfflineSupport()).toBe(true);
});
