import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {notifyManager, onlineManager, QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {authGeneration, authOwner, publishAuth} from '../../../src/data/authBoundary';
import {rememberPad, listEligibleDevicePads} from '../../../src/features/pad/padCheckpoint';
import OfflinePadPage from '../../../src/features/pad/OfflinePadPage';
import {LemmaError} from '../../../src/data/api';

const fixtures = vi.hoisted(() => ({api: {listProjects: vi.fn(), getProject: vi.fn(), getCheckpoint: vi.fn()}, useAuth: vi.fn(), released: true}));
vi.mock('../../../src/data', async () => {
  const {LemmaError} = await import('../../../src/data/api');
  return {LemmaError, getApi: () => fixtures.api};
});
vi.mock('../../../src/data/hooks', () => ({useAuth: () => fixtures.useAuth()}));
vi.mock('../../../src/data/env', () => ({supabaseUrl: 'https://pad-fixture.supabase.co'}));
vi.mock('../../../src/app/shellFonts', () => ({loadShellFonts: () => {}}));
vi.mock('../../../src/features/pad/usePadRelease', () => ({usePadRelease: () => ({released: fixtures.released, decision: fixtures.released})}));
vi.mock('../../../src/features/pad/CheckpointPad', () => ({default: function Workspace({detail, fullPage}: {detail: {view: {id: string}}; fullPage: boolean}) {
  const [text, setText] = useState('');
  return <div data-checkpoint={detail.view.id} data-full-page={fullPage}><label>Verified Pad<input value={text} onChange={event => setText(event.currentTarget.value)}/></label></div>;
}}));
vi.mock('../../../src/features/pad/LiveCheckpointPad', () => ({default: ({scope}: {scope: {checkpointId: string}}) => <p data-cached-pad={scope.checkpointId}>Cached local editor</p>}));

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const checkpoint = '00000000-0000-4000-8000-000000000003';
const second = '00000000-0000-4000-8000-000000000004';
const sessionId = '00000000-0000-4000-8000-000000000005';
let host: HTMLDivElement, root: Root, client: QueryClient;
let online = true;
const detail = () => ({view: {id: checkpoint, code: 'CP4', title: 'Compactness'}, authScope: {ownerId: owner, checkpointId: checkpoint, generation: authGeneration()}});
function token(id = owner, sid = sessionId) {
  localStorage.setItem('sb-pad-fixture-auth-token', JSON.stringify({user: {id}, access_token: 'header.' + btoa(JSON.stringify({sub: id, session_id: sid})) + '.fixture'}));
}
async function mount(path = '/pad') {
  const router = createMemoryRouter([{path: '/pad/:checkpointId?', element: <OfflinePadPage/>}], {initialEntries: [path]});
  await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>));
  return router;
}
function select(label: string, value: string) {
  const field = host.querySelector<HTMLSelectElement>('select#' + label)!;
  field.value = value; field.dispatchEvent(new Event('change', {bubbles: true}));
}
beforeEach(() => {
  notifyManager.setNotifyFunction(callback => {act(callback);});
  onlineManager.setOnline(true);
  online = true; vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear(); sessionStorage.clear(); publishAuth({id: owner, email: 'a@example.invalid'}); token();
  fixtures.released = true; fixtures.useAuth.mockReset().mockImplementation(() => ({data: authOwner() ? {email: authOwner() + '@example.invalid'} : null, isPending: false, isError: false, refetch: vi.fn()}));
  fixtures.api.listProjects.mockReset().mockResolvedValue([{id: 'project', slug: 'analysis', title: 'Analysis', status: 'active'}]);
  fixtures.api.getProject.mockReset().mockResolvedValue({project: {slug: 'analysis'}, checkpoints: [
    {id: checkpoint, code: 'CP4', title: 'Compactness', ui: 'ready'},
    {id: 'proposed:unapproved', code: 'CP5', title: 'Unapproved', ui: 'proposed'},
  ]});
  fixtures.api.getCheckpoint.mockReset().mockImplementation(async () => detail());
  const script = document.createElement('script'); script.type = 'module'; script.src = '/lemma/assets/index-fixture.js'; document.head.append(script);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}});
});
afterEach(async () => {
  await act(async () => root.unmount()); notifyManager.setNotifyFunction(callback => callback()); client.clear(); host.remove(); publishAuth(null);
  document.querySelector('script[type="module"]')?.remove(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks();
});

test('the full page selects an authorized checkpoint and never offers an unapproved proposal', async () => {
  const router = await mount();
  await vi.waitFor(() => expect(host.querySelector('#pad-path')).not.toBeNull());
  await act(async () => select('pad-path', 'analysis'));
  await vi.waitFor(() => expect(host.querySelector('#pad-checkpoint')).not.toBeNull());
  expect(host.querySelector('#pad-checkpoint')?.textContent).toContain('Compactness');
  expect(host.querySelector('#pad-checkpoint')?.textContent).not.toContain('Unapproved');
  await act(async () => select('pad-checkpoint', 'CP4'));
  await vi.waitFor(() => expect(host.querySelector('[data-full-page="true"]')).not.toBeNull());
  expect(fixtures.api.getCheckpoint).toHaveBeenCalledWith('analysis', 'CP4');
  expect(router.state.location.search).toBe('?path=analysis&checkpoint=CP4');
  expect(host.querySelector('h1')?.textContent).toBe('Lemma Pad');
});

test('direct page reload binds the requested checkpoint before mounting its editor', async () => {
  await mount('/pad?path=analysis&checkpoint=CP4');
  await vi.waitFor(() => expect(host.querySelector('[data-checkpoint]')?.getAttribute('data-checkpoint')).toBe(checkpoint));
  expect(fixtures.api.getCheckpoint).toHaveBeenCalledWith('analysis', 'CP4');
  expect(host.querySelector('a[href="/p/analysis/cp/CP4"]')).not.toBeNull();
});

test('empty and signed-out pages explain how to start without exposing an editor', async () => {
  fixtures.api.listProjects.mockResolvedValue([]);
  await mount();
  await vi.waitFor(() => expect(host.textContent).toContain('No checkpoints yet.'));
  expect(host.querySelector('[data-checkpoint]')).toBeNull();
  await act(async () => publishAuth(null));
  expect(host.textContent).toContain('Sign in to choose a checkpoint');
  expect(host.querySelector('a[href="/sign-in"]')).not.toBeNull();
});

test('a late checkpoint response cannot expose the previous account after a switch', async () => {
  let finish: (value: ReturnType<typeof detail>) => void = () => {};
  const original = detail();
  fixtures.api.getCheckpoint.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  await mount('/pad?path=analysis&checkpoint=CP4');
  await vi.waitFor(() => expect(fixtures.api.getCheckpoint).toHaveBeenCalledTimes(1));
  fixtures.api.getCheckpoint.mockRejectedValue(new Error('new owner has no matching checkpoint'));
  await act(async () => publishAuth({id: other, email: 'b@example.invalid'}));
  await act(async () => finish(original));
  await vi.waitFor(() => expect(host.textContent).toContain('Could not open this checkpoint.'));
  expect(host.querySelector('[data-checkpoint]')).toBeNull();
});

test('warm disconnect preserves the mounted authorized editor and shows only cached offline choices', async () => {
  await mount('/pad?path=analysis&checkpoint=CP4');
  await vi.waitFor(() => expect(host.querySelector('[data-checkpoint]')).not.toBeNull());
  const editor = host.querySelector('[data-checkpoint]');
  await act(async () => {online = false; window.dispatchEvent(new Event('offline'));});
  expect(host.querySelector('[data-checkpoint]')).toBe(editor);
  expect(host.querySelector('#pad-checkpoint')).toBeNull();
});

test('cold offline page lists only the same owner/session/build and makes no API request', async () => {
  rememberPad({ownerId: owner, checkpointId: checkpoint, generation: authGeneration()}, {slug: 'analysis', code: 'CP4'});
  rememberPad({ownerId: owner, checkpointId: second, generation: authGeneration()}, {slug: 'analysis', code: 'CP5'});
  localStorage.setItem('lemma.device-pad.v1:' + other + ':' + second, JSON.stringify({ownerId: other, checkpointId: second, slug: 'private-other-path', code: 'CP9'}));
  online = false;
  await mount('/pad/' + checkpoint);
  expect(listEligibleDevicePads()).toHaveLength(2);
  expect(host.querySelector('[data-cached-pad]')?.getAttribute('data-cached-pad')).toBe(checkpoint);
  expect(host.textContent).toContain('analysis · CP5');
  expect(host.textContent).not.toContain('private-other-path');
  expect(fixtures.useAuth).not.toHaveBeenCalled();
  expect(fixtures.api.getCheckpoint).not.toHaveBeenCalled();
  expect(fixtures.api.listProjects).not.toHaveBeenCalled();
  await act(async () => {token(owner, second); window.dispatchEvent(new Event('storage'));});
  expect(host.querySelector('[data-cached-pad]')).toBeNull();
  expect(host.textContent).toContain('While signed in, open your device notes in Settings to make them available offline.');
});


test('transient checkpoint refresh errors retain working state but confirmed denial closes access', async () => {
  await mount('/pad?path=analysis&checkpoint=CP4');
  await vi.waitFor(() => expect(host.querySelector('[data-checkpoint]')).not.toBeNull());
  const editor = host.querySelector('[data-checkpoint]');
  fixtures.api.getCheckpoint.mockRejectedValue(new Error('Network unavailable'));
  await act(async () => {await client.invalidateQueries({queryKey: ['pad-checkpoint']});});
  expect(host.querySelector('[data-checkpoint]')).toBe(editor);
  fixtures.api.getCheckpoint.mockRejectedValue(new LemmaError('not_found', 'Checkpoint removed'));
  await act(async () => {await client.invalidateQueries({queryKey: ['pad-checkpoint']});});
  await vi.waitFor(() => expect(host.querySelector('[data-checkpoint]')).toBeNull());
  expect(host.textContent).toContain('Could not open this checkpoint.');
});


test('a checkpoint ID in the URL cannot reuse another checkpoint result from the query cache', async () => {
  const router = await mount('/pad?path=analysis&checkpoint=CP4');
  await vi.waitFor(() => expect(host.querySelector('[data-checkpoint]')).not.toBeNull());
  await act(async () => {await router.navigate('/pad/' + second + '?path=analysis&checkpoint=CP4');});
  expect(host.querySelector('[data-checkpoint]')).toBeNull();
  await vi.waitFor(() => expect(host.textContent).toContain('Could not open this checkpoint.'));
});
