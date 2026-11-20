import {act, useState, useSyncExternalStore} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {authGeneration, onAccountChange, publishAuth} from '../../../src/data/authBoundary';
import {LocalPadEditor} from '../../../src/features/pad/LocalPadEditor';
import {padEdit} from '../../../src/features/pad/padEdit';
import {usePadRelease} from '../../../src/features/pad/usePadRelease';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../../src/data/live/client', () => ({liveClient: () => ({rpc})}));

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
const receipt = (owner: string) => 'lemma.device-pad.v1:' + owner + ':release';
const queryKey = () => ['plan-release', 'live', authGeneration()];
let root: Root, host: HTMLDivElement, client: QueryClient;

function WorkingPad() {
  const [edit, setEdit] = useState(() => padEdit(''));
  return <LocalPadEditor value={edit} onEdit={setEdit}/>;
}

/** The checkpoint host keys its editor by the authorized account generation. */
function ReleaseGatedPad() {
  const generation = useSyncExternalStore(onAccountChange, authGeneration);
  const {released} = usePadRelease();
  return released ? <WorkingPad key={generation}/> : <p role="status">Pad unavailable</p>;
}

async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><ReleaseGatedPad/></QueryClientProvider>));
}

async function settle(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 5));});
    assertion();
  });
}

async function openWorkingPad(text = 'An unsaved proof and its local equation $x^2$.') {
  await render();
  await settle(() => expect(host.querySelector('textarea')).not.toBeNull());
  const field = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new InputEvent('input', {bubbles: true, data: text}));
  });
  expect(field.value).toBe(text);
  return field;
}

async function refetch() {
  await act(async () => {await client.refetchQueries({queryKey: queryKey(), exact: true});});
}

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/lemma/?demo=0&flags=padLocal');
  publishAuth({id: ownerA});
  rpc.mockReset().mockResolvedValue({data: true, error: null});
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); host.remove(); publishAuth(null);
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/lemma/');
});

test('a failed background release refresh retains the authorized editor and its unsaved work', async () => {
  const field = await openWorkingPad();
  const text = field.value;
  localStorage.setItem(receipt(ownerA), 'authorized-device-receipt');
  rpc.mockResolvedValue({data: null, error: new Error('Temporary network failure')});

  await refetch();
  await settle(() => expect(client.getQueryState(queryKey())).toMatchObject({status: 'error', data: true}));

  expect(rpc).toHaveBeenLastCalledWith('lemma_plan_released');
  expect(host.querySelector('textarea')).toBe(field);
  expect(field.value).toBe(text);
  expect(host.textContent).not.toContain('Pad unavailable');
  expect(localStorage.getItem(receipt(ownerA))).toBe('authorized-device-receipt');
});

test('an initial failed release request never authorizes a new editor', async () => {
  rpc.mockResolvedValue({data: null, error: new Error('No confirmed release decision')});
  await render();
  await settle(() => expect(client.getQueryState(queryKey())).toMatchObject({status: 'error', data: undefined}));
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).toBe('Pad unavailable');
});

test.each(['another owner', 'a new sign-in for the same owner'] as const)(
  'a cached authorization cannot open the editor for %s', async boundary => {
    const field = await openWorkingPad('Private unsaved text for the original sign-in');
    const originalKey = queryKey();
    rpc.mockResolvedValue({data: null, error: new Error('New sign-in has no release decision')});

    await act(async () => {
      if (boundary === 'another owner') publishAuth({id: ownerB});
      else {publishAuth(null); publishAuth({id: ownerA});}
    });
    await settle(() => expect(client.getQueryState(queryKey())).toMatchObject({status: 'error', data: undefined}));

    expect(queryKey()).not.toEqual(originalKey);
    expect(client.getQueryData(originalKey)).toBe(true);
    expect(host.querySelector('textarea')).toBeNull();
    expect(field.isConnected).toBe(false);
    expect(host.textContent).not.toContain('Private unsaved text');
  },
);

test('a confirmed closed release revokes only the current owner receipt after a transient error', async () => {
  await openWorkingPad();
  localStorage.setItem(receipt(ownerA), 'owner-a-device-receipt');
  localStorage.setItem(receipt(ownerB), 'owner-b-device-receipt');
  rpc.mockResolvedValue({data: null, error: new Error('Temporary network failure')});
  await refetch();
  await settle(() => expect(client.getQueryState(queryKey())).toMatchObject({status: 'error', data: true}));
  expect(host.querySelector('textarea')).not.toBeNull();

  rpc.mockResolvedValue({data: false, error: null});
  await refetch();
  await settle(() => {
    expect(host.querySelector('textarea')).toBeNull();
    expect(localStorage.getItem(receipt(ownerA))).toBeNull();
  });

  expect(client.getQueryState(queryKey())).toMatchObject({status: 'success', data: false});
  expect(host.textContent).toBe('Pad unavailable');
  expect(localStorage.getItem(receipt(ownerB))).toBe('owner-b-device-receipt');
});

test('turning the build flag off closes the editor despite a cached open release', async () => {
  await openWorkingPad();
  const calls = rpc.mock.calls.length;
  window.history.replaceState(null, '', '/lemma/?demo=0&flags=-padLocal');
  await render();

  expect(client.getQueryData(queryKey())).toBe(true);
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).toBe('Pad unavailable');
  expect(rpc).toHaveBeenCalledTimes(calls);
});
