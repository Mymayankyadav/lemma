import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createMemoryRouter, Link, MemoryRouter, RouterProvider} from 'react-router';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {PadNavigationGuard} from '../../../src/features/pad/PadNavigationGuard';
import {bindPadDraft, type PadDraftBackend} from '../../../src/features/pad/padDraftStore';
import {createPadDraftSession} from '../../../src/features/pad/padDraftSession';
import {padEdit} from '../../../src/features/pad/padEdit';

const scope = {ownerId: '00000000-0000-4000-8000-000000000001',
  checkpointId: '00000000-0000-4000-8000-000000000003', generation: 1};
const draft = {edit: padEdit('An unsaved compactness proof'), strokes: [[{x: 12, y: 24}, {x: 40, y: 60}]]};
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
let root: Root, host: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter> | undefined;

async function fixture(dirty = true) {
  let raw: unknown, failed = false, resume: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  const backend: PadDraftBackend = {
    read: async (_scope, guard) => {guard(); return raw;},
    update: async (_scope, guard, change) => {
      if (pending) await pending;
      guard();
      if (failed) throw new DOMException('Storage full', 'QuotaExceededError');
      raw = change(raw);
    },
  };
  const binding = bindPadDraft(() => scope, backend)!;
  const session = createPadDraftSession(binding);
  await session.load();
  if (dirty) session.edit(draft);
  let redraw: () => void = () => {};
  function EditorRoute() {
    const [, tick] = useState(0);
    redraw = () => tick(value => value + 1);
    const state = session.snapshot();
    if (state.status === 'scope-changed') return <p>This Pad is no longer available.</p>;
    return <>
      <textarea aria-label="Pad notes" value={state.draft.edit.text} readOnly/>
      <output aria-label="Completed ink">{JSON.stringify(state.draft.strokes)}</output>
      <Link to="/other">Other page</Link>
      <Link to="/pad?checkpoint=b">Another checkpoint</Link>
      <PadNavigationGuard session={session}
        dirty={!['loading', 'saved', 'empty', 'scope-changed'].includes(state.status)} onSaved={redraw}/>
    </>;
  }
  router = createMemoryRouter([
    {path: '/earlier', element: <p>Earlier page</p>},
    {path: '/pad', element: <EditorRoute/>},
    {path: '/other', element: <p>Other destination</p>},
  ], {initialEntries: ['/earlier', '/pad?checkpoint=a'], initialIndex: 1});
  await act(async () => root.render(<RouterProvider router={router!}/>));
  return {
    session, binding,
    fail: (value: boolean) => {failed = value;},
    pause: () => {pending = new Promise(resolve => {resume = resolve;});},
    resume: () => {resume?.(); pending = undefined;},
    refresh: async () => {await act(async () => redraw());},
  };
}

const modal = () => host.querySelector<HTMLDialogElement>('dialog[open]');
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!;
async function click(label: string) {await act(async () => button(label).click());}
async function follow(label = 'Other page') {
  const link = [...host.querySelectorAll<HTMLAnchorElement>('a')].find(item => item.textContent === label)!;
  link.focus();
  await act(async () => link.click());
}
function assertWorkingDraft() {
  expect(host.querySelector('textarea')?.value).toBe(draft.edit.text);
  expect(host.querySelector('output')?.textContent).toBe(JSON.stringify(draft.strokes));
}
function unload() {
  const event = new Event('beforeunload', {cancelable: true});
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  // jsdom does not implement dialog top-layer methods; the real Sheet still
  // supplies labeling, cancellation handling and explicit autofocus.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {configurable: true,
    value: function(this: HTMLDialogElement) {this.open = true;}});
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {configurable: true,
    value: function(this: HTMLDialogElement) {this.open = false;}});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose(); router = undefined; host.remove(); vi.restoreAllMocks();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

test('declining link, checkpoint and browser Back navigation retains both unsaved notes and completed ink', async () => {
  await fixture();
  for (const target of ['Other page', 'Another checkpoint', 'Back']) {
    if (target === 'Back') await act(async () => {await router!.navigate(-1);});
    else await follow(target);
    expect(router!.state.location.search).toBe('?checkpoint=a');
    expect(modal()?.textContent).toContain('Save your Pad before leaving?');
    expect(document.activeElement).toBe(button('Keep editing'));
    await click('Keep editing');
    expect(modal()).toBeNull();
    expect(router!.state.location.pathname).toBe('/pad');
    assertWorkingDraft();
  }
});

test('explicit discard leaves without overwriting the saved draft', async () => {
  const {binding} = await fixture();
  await follow(); await click('Discard and leave');
  expect(router!.state.location.pathname).toBe('/other');
  expect(host.textContent).toBe('Other destination');
  expect((await binding.read()).status).toBe('empty');
});

test('Save and leave waits for a committed draft before continuing navigation', async () => {
  const state = await fixture();
  state.pause();
  await follow(); await click('Save and leave');
  expect(router!.state.location.pathname).toBe('/pad');
  expect(button('Saving Pad…').disabled).toBe(true);
  expect(button('Discard and leave').disabled).toBe(true);
  assertWorkingDraft();

  await act(async () => state.resume());
  await vi.waitFor(() => expect(router!.state.location.pathname).toBe('/other'));
  expect((await state.binding.read()).current?.draft).toEqual(draft);
});

test('a failed save keeps the working draft and offers export advice; a successful retry can leave', async () => {
  const state = await fixture(); state.fail(true);
  await follow(); await click('Save and leave');
  expect(router!.state.location.pathname).toBe('/pad');
  expect(modal()?.querySelector('[role=alert]')?.textContent).toContain('export a copy');
  assertWorkingDraft();
  expect((await state.binding.read()).status).toBe('empty');

  state.fail(false);
  await click('Save and leave');
  expect(router!.state.location.pathname).toBe('/other');
  expect((await state.binding.read()).current?.draft).toEqual(draft);
});

test('an edit arriving during Save and leave requires another confirmed save', async () => {
  const state = await fixture(); state.pause();
  await follow(); await click('Save and leave');
  const later = {...draft, edit: padEdit('A correction made while the save was pending')};
  state.session.edit(later); await state.refresh();
  await act(async () => state.resume());

  expect(router!.state.location.pathname).toBe('/pad');
  expect(modal()?.querySelector('[role=alert]')?.textContent).toContain('changed while saving');
  expect(host.querySelector('textarea')?.value).toBe(later.edit.text);
  expect((await state.binding.read()).current?.draft).toEqual(draft);
  await click('Save and leave');
  expect(router!.state.location.pathname).toBe('/other');
  expect((await state.binding.read()).current?.draft).toEqual(later);
});

test('a conflict never overwrites another tab and requires keeping or explicitly discarding the working copy', async () => {
  const state = await fixture();
  const otherDraft = {...draft, edit: padEdit('A newer draft saved in another tab')};
  await state.binding.save(otherDraft, null);
  await state.session.save(); await state.refresh();
  expect(state.session.snapshot().status).toBe('conflict');
  await follow();
  expect(button('Save and leave').disabled).toBe(true);
  expect(modal()?.textContent).toContain('Another tab saved a newer draft.');
  await click('Keep editing');
  assertWorkingDraft();
  expect((await state.binding.read()).current?.draft).toEqual(otherDraft);
});

test('clean drafts navigate immediately and do not warn on reload', async () => {
  await fixture(false);
  expect(unload().defaultPrevented).toBe(false);
  await follow();
  expect(modal()).toBeNull();
  expect(router!.state.location.pathname).toBe('/other');
});

test('reload warns only while local changes remain unsaved', async () => {
  const state = await fixture();
  expect(unload().defaultPrevented).toBe(true);
  await state.session.save(); await state.refresh();
  expect(unload().defaultPrevented).toBe(false);
});

test('an account scope change removes private working content and cannot be held open by a pending dialog', async () => {
  const state = await fixture();
  await follow(); expect(modal()).not.toBeNull();
  state.session.close(); await state.refresh();
  expect(modal()).toBeNull();
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).not.toContain(draft.edit.text);
  expect(unload().defaultPrevented).toBe(false);
  await act(async () => {await router!.navigate('/other');});
  expect(router!.state.location.pathname).toBe('/other');
});

test('a late save completion after the account scope closes cannot navigate or resurrect the old editor', async () => {
  const state = await fixture(); state.pause();
  await follow(); await click('Save and leave');
  state.session.close(); await state.refresh();
  await act(async () => state.resume());

  expect(modal()).toBeNull();
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).not.toContain(draft.edit.text);
  expect(router!.state.location.pathname).toBe('/pad');
  expect(unload().defaultPrevented).toBe(false);
});

test.each([false, true])('isolated editor supports reload protection without a data router (MemoryRouter: %s)', async memoryRouter => {
  let raw: unknown;
  const backend: PadDraftBackend = {read: async () => raw, update: async (_scope, guard, change) => {guard(); raw = change(raw);}};
  const session = createPadDraftSession(bindPadDraft(() => scope, backend)!);
  await session.load(); session.edit(draft);
  const guard = <PadNavigationGuard session={session} dirty onSaved={() => {}}/>;
  await act(async () => root.render(memoryRouter ? <MemoryRouter>{guard}</MemoryRouter> : guard));
  expect(unload().defaultPrevented).toBe(true);
  expect(modal()).toBeNull();
  session.close();
  expect(unload().defaultPrevented).toBe(false);
});
