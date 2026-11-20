import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import OfflinePadPage from '../../../src/features/pad/OfflinePadPage';

const boundary = vi.hoisted(() => ({owner: undefined as string | null | undefined, generation: 0, listeners: new Set<() => void>()}));
const onlineAuth = vi.hoisted(() => vi.fn(() => ({isPending: false, isError: false, data: null})));
const saved = vi.hoisted(() => ({writes: [] as unknown[]}));
vi.mock('../../../src/data/authBoundary', () => ({
  authGeneration: () => boundary.generation, authOwner: () => boundary.owner ?? null, authSignedOut: () => boundary.owner === null,
  onAccountChange: (listener: () => void) => {boundary.listeners.add(listener); return () => boundary.listeners.delete(listener);},
}));
vi.mock('../../../src/data/env', () => ({supabaseUrl: 'https://pad-fixture.supabase.co'}));
vi.mock('../../../src/data', async () => ({LemmaError: (await import('../../../src/data/api')).LemmaError,
  getApi: () => {throw new Error('A device-only editor cannot fetch checkpoint data');}}));
vi.mock('../../../src/data/hooks', () => ({useAuth: onlineAuth}));
vi.mock('../../../src/features/pad/CheckpointPad', () => ({default: () => null}));
vi.mock('../../../src/app/shellFonts', () => ({loadShellFonts: () => {}}));
vi.mock('../../../src/features/pad/usePadRelease', () => ({usePadRelease: () => ({released: true, decision: true})}));
vi.mock('../../../src/features/pad/padDraftStore', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/features/pad/padDraftStore')>();
  return {...original, bindPadDraft: (scope: Parameters<typeof original.bindPadDraft>[0]) => {
    let record: unknown;
    return original.bindPadDraft(scope, {read: async () => record, update: async (_scope, guard, change) => {guard(); record = change(record); saved.writes.push(record);}});
  }};
});
const owner = '00000000-0000-4000-8000-000000000001';
const checkpoint = '00000000-0000-4000-8000-000000000003';
const session = '00000000-0000-4000-8000-000000000004';
let host: HTMLDivElement, root: Root, client: QueryClient, online = false;
let router: ReturnType<typeof createMemoryRouter> | undefined;
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
function auth(id: string | null) {boundary.owner = id; boundary.generation++; for (const listener of boundary.listeners) listener();}
function sessionToken(id: string) {
  localStorage.setItem('sb-pad-fixture-auth-token', JSON.stringify({user: {id: owner}, access_token: 'header.' + btoa(JSON.stringify({sub: owner, session_id: id})) + '.fixture'}));
}
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {configurable: true, value: function(this: HTMLDialogElement) {this.open = true;}});
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {configurable: true, value: function(this: HTMLDialogElement) {this.open = false;}});
  online = false; vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  onlineAuth.mockClear(); saved.writes.length = 0;
  boundary.owner = undefined; boundary.generation = 0; boundary.listeners.clear(); localStorage.clear(); sessionStorage.clear();
  sessionToken(session);
  localStorage.setItem('lemma.device-pad.v1:' + owner + ':' + checkpoint, JSON.stringify({ownerId: owner, checkpointId: checkpoint, slug: 'analysis', code: 'CP4'}));
  localStorage.setItem('lemma.device-pad.v1:' + owner + ':release', JSON.stringify({build: '/lemma/assets/index-fixture.js', sessionId: session}));
  const script = document.createElement('script'); script.type = 'module'; script.src = '/lemma/assets/index-fixture.js'; document.head.append(script);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}});
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); boundary.listeners.clear();
  router?.dispose(); router = undefined;
  document.querySelector('script[type="module"]')?.remove(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
async function open(search = '', carriedOnlineState = false) {
  router = createMemoryRouter([{path: '/pad/:checkpointId?', element: <OfflinePadPage/>}], {
    initialEntries: [{pathname: '/pad/' + checkpoint, search, state: carriedOnlineState ? {padLoadOnline: true} : undefined}],
  });
  await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>));
  await vi.waitFor(() => expect(host.querySelector('textarea')).not.toBeNull());
  const textarea = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Unsaved proof after a cold offline reopen.');
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
  });
  expect(textarea.value).toBe('Unsaved proof after a cold offline reopen.');
  expect(onlineAuth).not.toHaveBeenCalled();
  return textarea;
}

test('one same-session identity hydration preserves the actual unsaved offline workspace', async () => {
  const textarea = await open();
  await act(async () => {online = true; window.dispatchEvent(new Event('online')); auth(owner);});
  expect(host.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Unsaved proof after a cold offline reopen.');
  expect(host.textContent).toContain('Unsaved changes.');
  const save = [...host.querySelectorAll('button')].find(button => button.textContent === 'Save draft')!;
  await act(async () => {save.click();});
  await vi.waitFor(() => expect(host.textContent).toContain('Saved on this device.'));
  await act(async () => auth(null));
  expect(host.querySelector('textarea')).toBeNull();
  await act(async () => {sessionToken(checkpoint); auth(owner);});
  expect(host.querySelector('textarea')).toBeNull();
});

test('a new same-owner server session cannot hydrate the old device authorization', async () => {
  await open();
  await act(async () => {online = true; sessionToken(checkpoint); window.dispatchEvent(new Event('online')); auth(owner);});
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).toContain('Open Local Pad from a checkpoint while signed in to use it here.');
});

const click = async (label: string) => {await act(async () => {
  [...host.querySelectorAll('button')].find(button => button.textContent === label)!.click();
});};

test.each(['', '?online=1'])('loading online checkpoints guards unsaved work after cold reopen %s', async search => {
  const textarea = await open(search, true);
  await act(async () => {online = true; window.dispatchEvent(new Event('online')); auth(owner);});
  await click('Load online checkpoints');
  expect(host.querySelector('dialog[open]')?.textContent).toContain('Save your Pad before leaving?');
  expect(router!.state.location.search).toBe(search);
  expect(onlineAuth).not.toHaveBeenCalled();
  await click('Keep editing');
  expect(host.querySelector('dialog[open]')).toBeNull();
  expect(host.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Unsaved proof after a cold offline reopen.');
  await click('Load online checkpoints'); await click('Discard and leave');
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).toContain('Sign in to choose a checkpoint');
  expect(onlineAuth).toHaveBeenCalled(); expect(saved.writes).toHaveLength(0);
});

test('Save and leave commits the cold offline working copy before loading online checkpoints', async () => {
  await open();
  await act(async () => {online = true; window.dispatchEvent(new Event('online')); auth(owner);});
  await click('Load online checkpoints');
  expect(onlineAuth).not.toHaveBeenCalled();
  await click('Save and leave');
  expect(JSON.stringify(saved.writes)).toContain('Unsaved proof after a cold offline reopen.');
  expect(saved.writes).toHaveLength(1);
  expect(onlineAuth).toHaveBeenCalled(); expect(host.querySelector('textarea')).toBeNull();
});
