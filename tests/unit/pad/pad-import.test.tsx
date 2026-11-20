import {webcrypto} from 'node:crypto';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, test, vi} from 'vitest';
import {FLAG_DEFAULTS, resolveFlags} from '../../../src/flags';
import {fixtureCheckpointId} from '../../../src/features/pad/FixtureCheckpointPad';
import {LocalPadDraftPanel} from '../../../src/features/pad/LocalPadDraftPanel';
import {LocalPadWorkspace} from '../../../src/features/pad/LocalPadWorkspace';
import {initializePadInk} from '../../../src/features/pad/padInk';
import {setLemmaNativeForTests, type LemmaNativePlugin} from '../../../src/platform/bridge';
import {shareFile as sharePadFile} from '../../../src/platform/files';
import {makePadFile} from '../../../src/features/pad/padExport';
import {PAD_BACKUP_MAX_BYTES, readPadBackup} from '../../../src/features/pad/padImport';
import {bindPadDraft, bindFixturePadDraft, PAD_FIXTURE_DB_PREFIX, PAD_NOTE_MAX, type PadDraftBackend} from '../../../src/features/pad/padDraftStore';
import {createPadDraftSession} from '../../../src/features/pad/padDraftSession';
import {padEdit} from '../../../src/features/pad/padEdit';

const ids = {ownerId: '00000000-0000-4000-8000-000000000021', checkpointId: '00000000-0000-4000-8000-000000000022', generation: 1};
const file = (raw: string) => {
  const bytes = new TextEncoder().encode(raw);
  return {size: bytes.byteLength, arrayBuffer: async () => bytes.buffer};
};
const edit = padEdit('<img src="https://no.invalid"> π', 0, 2, 'backward');
const ink = [[{x: 16, y: 20}]];
const backup = makePadFile(edit, ink, 'backup').contents;
afterEach(() => vi.unstubAllGlobals());

test('Android export opens the share sheet with the selected local format and keeps the draft on failure', async () => {
  vi.stubGlobal('Capacitor', {isNativePlatform: () => true, getPlatform: () => 'android'});
  const shareFile = vi.fn().mockResolvedValueOnce({shared: true}).mockResolvedValueOnce({shared: false});
  setLemmaNativeForTests({shareFile} as unknown as LemmaNativePlugin);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  const click = (label: string) => [...host.querySelectorAll('button')].find(button => button.textContent === label)!.click();
  try {
    await act(async () => root.render(<LocalPadWorkspace value={edit} onEdit={() => {}}
      ink={initializePadInk(ink)!} onInk={() => {}}/>));
    await act(async () => click('Export readable Pad'));
    await vi.waitFor(() => expect(shareFile).toHaveBeenNthCalledWith(1, expect.objectContaining({name: 'lemma-pad.html', mime: 'text/html',
      text: expect.stringContaining('&lt;img')})));
    await vi.waitFor(() => expect(host.textContent).toContain('Choose where to save your Pad.'));
    await act(async () => click('Export Pad backup'));
    await vi.waitFor(() => expect(shareFile).toHaveBeenNthCalledWith(2, expect.objectContaining({name:'lemma-pad.json',mime:'application/json',text:backup})));
    await vi.waitFor(() => expect(host.textContent).toContain('Could not start the export.'));
    expect(host.querySelector('textarea')?.value).toBe(edit.text);
    expect(await sharePadFile(new Blob([backup]), 'lemma-pad.json', 'Save your Local Pad', () => false)).toBe(false);
    expect(shareFile).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    setLemmaNativeForTests(null);
  }
});

test('requires known backup format, exact dimensions, and bounded valid UTF-8', async () => {
  expect(await readPadBackup(file(backup))).toEqual({edit, strokes: ink});
  const base = JSON.parse(backup);
  for (const invalid of [
    {...base, ownerId: ids.ownerId}, {...base, version: 2}, {...base, ink: {...base.ink, height: 1}},
    {...base, ink: {...base.ink, strokes: [[{x: -1, y: 20}]]}},
    {...base, notes: {...base.notes, start: -1}},
    {...base, notes: {...base.notes, text: 'x'.repeat(PAD_NOTE_MAX + 1)}},
  ]) await expect(readPadBackup(file(JSON.stringify(invalid)))).rejects.toThrow();
  await expect(readPadBackup(file('{'))).rejects.toThrow();
  await expect(readPadBackup({size: 1, arrayBuffer: async () => Uint8Array.of(255).buffer})).rejects.toThrow();
  const arrayBuffer = vi.fn();
  await expect(readPadBackup({size: PAD_BACKUP_MAX_BYTES + 1, arrayBuffer})).rejects.toThrow();
  expect(arrayBuffer).not.toHaveBeenCalled();
});

test('ships the Pad default, exercises the off path in override builds and keeps fixture storage separate', async () => {
  expect(FLAG_DEFAULTS.padLocal).toBe(true);
  expect(resolveFlags({allowOverrides: false, search: '?flags=-padLocal'}).padLocal).toBe(true);
  expect(resolveFlags({allowOverrides: true, search: '?flags=-padLocal'}).padLocal).toBe(false);
  vi.stubGlobal('crypto', webcrypto);
  const a = await fixtureCheckpointId('default', 'demo-checkpoint-1');
  expect(await fixtureCheckpointId('default', 'demo-checkpoint-1')).toBe(a);
  expect(await fixtureCheckpointId('default', 'demo-checkpoint-2')).not.toBe(a);
  expect(await fixtureCheckpointId('stress', 'demo-checkpoint-1')).not.toBe(a);
  const open = vi.fn(() => {
    const request = {onerror: () => {}};
    queueMicrotask(() => request.onerror());
    return request;
  });
  vi.stubGlobal('indexedDB', {open});
  await expect(bindFixturePadDraft(() => ids)!.read()).rejects.toThrow();
  expect(open).toHaveBeenCalledWith(PAD_FIXTURE_DB_PREFIX + ids.ownerId, 1);
});

test('import and previous revision review never change the working copy without an explicit replace', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  let raw: unknown, broken = false;
  const backend: PadDraftBackend = {
    read: async () => raw,
    update: async (_scope, guard, change) => {
      if (broken) throw new DOMException('full', 'QuotaExceededError');
      guard();
      raw = change(raw);
    },
  };
  const session = createPadDraftSession(bindPadDraft(() => ids, backend)!);
  await session.load();
  session.edit({edit: padEdit('First proof'), strokes: []});
  await session.save();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  const button = (value: string) => [...host.querySelectorAll('button')].find(node => node.textContent === value)!;
  function pick(raw: string) {
    const input = host.querySelector('input[type=file]')!;
    Object.defineProperty(input, 'files', {configurable: true, value: [file(raw)]});
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }
  try {
    await act(async () => root.render(<LocalPadDraftPanel session={session}/>));
    await act(async () => pick('not json'));
    expect(host.textContent).toContain('Your current work is unchanged.');
    expect(host.querySelector('textarea')?.value).toBe('First proof');
    await act(async () => pick(backup));
    expect(host.querySelector('pre')?.textContent).toBe(edit.text);
    expect(host.querySelector('pre img')).toBeNull();
    expect(host.querySelector('textarea')?.value).toBe('First proof');
    await act(async () => button('Keep current work').click());
    expect(session.snapshot().status).toBe('saved');
    await act(async () => pick(backup));
    await act(async () => button('Replace working Pad').click());
    expect(session.snapshot()).toMatchObject({status: 'unsaved', draft: {edit, strokes: ink}});
    broken = true;
    await act(async () => button('Save draft').click());
    expect(host.textContent).toContain('Your work is still here.');
    expect(host.querySelector('textarea')?.value).toBe(edit.text);
    broken = false;
    await act(async () => button('Save draft').click());
    expect(host.textContent).toContain('Saved on this device.');
    await act(async () => button('Review previous draft').click());
    expect(host.querySelector('pre')?.textContent).toBe('First proof');
    expect(host.querySelector('textarea')?.value).toBe(edit.text);
    await act(async () => button('Replace working Pad').click());
    expect(session.snapshot()).toMatchObject({status: 'unsaved', draft: {edit: {text: 'First proof'}}});
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
