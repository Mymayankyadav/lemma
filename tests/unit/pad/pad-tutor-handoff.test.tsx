import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {authGeneration, publishAuth} from '../../../src/data/authBoundary';
import type {CheckpointDetail} from '../../../src/data/types';
import type {TutorThreadView} from '../../../src/data/tutor/manual-api';
import CheckpointPad from '../../../src/features/pad/CheckpointPad';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../../src/data/live/client', () => ({liveClient: () => ({rpc})}));
vi.mock('../../../src/features/pad/padDraftStore', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/features/pad/padDraftStore')>();
  return {...original, bindPadDraft: (scope: Parameters<typeof original.bindPadDraft>[0]) => {
    let record: unknown;
    return original.bindPadDraft(scope, {read: async () => record,
      update: async (_scope, guard, change) => {guard(); record = change(record);}});
  }};
});

const owner = '00000000-0000-4000-8000-000000000001';
const checkpoint = '00000000-0000-4000-8000-000000000002';
const nextCheckpoint = '00000000-0000-4000-8000-000000000003';
let root: Root, host: HTMLDivElement, client: QueryClient, released: boolean, thread: TutorThreadView;
const detail = (id = checkpoint): CheckpointDetail => ({
  view: {id, code: id === checkpoint ? 'CP1' : 'CP2', title: 'Implications'},
  objective: 'Prove the converse.', sessions: [], authScope: {ownerId: owner, checkpointId: id, generation: authGeneration()},
} as unknown as CheckpointDetail);
function button(name: string) {
  const found = [...host.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === name);
  expect(found, name).toBeDefined(); return found!;
}
function field(label: string) {
  const direct = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="' + label + '"]');
  if (direct) return direct;
  const node = [...host.querySelectorAll('label')].find(node => node.textContent === label);
  return document.getElementById(node!.htmlFor) as HTMLTextAreaElement;
}
async function fill(node: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, text);
    node.setSelectionRange(text.length, text.length);
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
}
async function click(name: string) {
  await act(async () => button(name).click());
  await act(async () => {await vi.dynamicImportSettled();});
}
async function render(value = detail()) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter>
    <CheckpointPad fullPage slug="logic" code={value.view.code} detail={value}/>
  </MemoryRouter></QueryClientProvider>));
  await act(async () => {await vi.dynamicImportSettled();});
}
async function select(text: string) {
  const notes = field('Pad notes'), start = notes.value.indexOf(text);
  expect(start).toBeGreaterThanOrEqual(0);
  await act(async () => {notes.focus(); notes.setSelectionRange(start, start + text.length); notes.dispatchEvent(new Event('select', {bubbles: true}));});
  await click('Send selection to tutor');
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Local excerpt preview"]')).not.toBeNull());
}
const commands = () => rpc.mock.calls.filter(call => call[0] === 'tutor_owner_command');

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear(); sessionStorage.clear(); publishAuth(null); publishAuth({id: owner});
  window.history.replaceState(null, '', '/lemma/?demo=0&flags=padLocal,tutorThreads');
  released = true;
  thread = {head: {threadId: null, pendingTurnId: null, lastSequence: 0}, turns: [], recoveredDrafts: [], canSubmit: true, canConnect: false};
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'lemma_plan_released') return {data: released, error: null};
    if (name === 'tutor_thread_state') return {data: thread, error: null};
    if (name === 'tutor_owner_command') {
      const command = args.p_command;
      expect(command.operation).toBe('start');
      const turn = {id: command.operationId, threadId: 'thread', sequence: 1, version: 1, status: 'awaiting-tutor' as const,
        snapshot: {question: command.question, selectedContext: [], localExcerpt: {kind: 'local-excerpt' as const, text: command.localExcerpt}}};
      thread = {...thread, head: {threadId: 'thread', pendingTurnId: turn.id, lastSequence: 1}, turns: [turn]};
      return {data: {status: 'submitted', operationId: command.operationId}, error: null};
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {configurable: true, value: function(this: HTMLDialogElement) {this.open = true;}});
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {configurable: true, value: function(this: HTMLDialogElement) {this.open = false;}});
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); publishAuth(null);
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/lemma/');
});

test('the real Pad sends only a frozen selection through preview, Add and Save question', async () => {
  await render();
  await vi.waitFor(() => expect(host.querySelector('textarea.local-pad-paper')).not.toBeNull());
  const notes = field('Pad notes'), excerpt = '  ∀ x ∈ ℝ\nselected proof step  ';
  await fill(notes, 'Private before |' + excerpt + '| private after');
  expect(rpc.mock.calls.filter(call => call[0].startsWith('tutor_'))).toEqual([]);
  await select(excerpt);
  expect(host.querySelector('[aria-label="Local excerpt preview"] p')?.textContent).toBe(excerpt);
  expect(host.querySelector('[aria-label="Attached local excerpt"]')).toBeNull();
  expect(commands()).toEqual([]);
  await fill(field('Question'), 'How do I finish this proof?');
  expect(button('Save question').disabled).toBe(true);
  await click('Cancel excerpt preview');
  expect(field('Paste selected local text').value).toBe(excerpt);
  await click('Preview selected text'); await click('Add local excerpt');
  expect(commands()).toEqual([]);
  await click('Close');
  await fill(notes, 'A later private edit, which must not replace the attached excerpt.');
  await click('Open checkpoint tutor');
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Attached local excerpt"]')).not.toBeNull());
  await click('Save question');
  await vi.waitFor(() => expect(field('Text for your tutor').value).toContain(excerpt));
  expect(commands()).toHaveLength(1);
  expect(commands()[0][1]).toEqual({p_owner: owner, p_slug: 'logic', p_checkpoint: checkpoint,
    p_command: {operation: 'start', operationId: expect.any(String), expectedVersion: 0,
      question: 'How do I finish this proof?', localExcerpt: excerpt}});
  expect(field('Text for your tutor').value).toBe('How do I finish this proof?\n\nLocal excerpt (learner-provided; not a citation):\n' + excerpt);
  expect(notes.value).toBe('A later private edit, which must not replace the attached excerpt.');
});

test('a checkpoint or account boundary cannot carry an unadded selection to the next receiver', async () => {
  await render(); await vi.waitFor(() => expect(host.querySelector('textarea')).not.toBeNull());
  await fill(field('Pad notes'), 'Private selection'); await select('Private selection');
  await render(detail(nextCheckpoint));
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Local excerpt preview"]')).toBeNull());
  await click('Open checkpoint tutor');
  await vi.waitFor(() => expect(host.textContent).toContain('Add selected local text'));
  expect(field('Paste selected local text').value).toBe('');
  expect(host.textContent).not.toContain('Private selection');
  await act(async () => publishAuth({id: '00000000-0000-4000-8000-000000000004'}));
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).not.toContain('Open checkpoint tutor');
  expect(commands()).toEqual([]);
});

test('the Pad has no send action when the canonical receiver flag is off', async () => {
  window.history.replaceState(null, '', '/lemma/?demo=0&flags=padLocal,-tutorThreads');
  await render(); await vi.waitFor(() => expect(host.querySelector('textarea')).not.toBeNull());
  expect(host.textContent).not.toContain('Send selection to tutor');
  expect(host.textContent).not.toContain('Open checkpoint tutor');
  expect(rpc.mock.calls.filter(call => call[0].startsWith('tutor_'))).toEqual([]);
});

test('a release hold retains canonical owner history without reopening the Pad or writes', async () => {
  released = false;
  thread = {...thread, head: {threadId: 'thread', pendingTurnId: null, lastSequence: 1}, turns: [{
    id: 'turn', threadId: 'thread', sequence: 1, version: 2, status: 'completed',
    snapshot: {question: 'Saved question', selectedContext: []},
    finalReply: {turnId: 'turn', messageId: 'reply', body: 'Saved owner answer', provenance: {kind: 'manual-import', label: 'Imported by you'}, citations: [], suggestions: []},
  }]};
  await render(); await click('Open checkpoint tutor');
  await vi.waitFor(() => expect(host.textContent).toContain('Saved owner answer'));
  expect(host.querySelector('textarea.local-pad-paper')).toBeNull();
  expect(host.textContent).not.toContain('Save question'); expect(commands()).toEqual([]);
});
