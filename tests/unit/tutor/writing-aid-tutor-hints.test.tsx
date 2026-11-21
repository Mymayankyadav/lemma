import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {predictWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {normalizeTutorWritingContext} from '../../../src/features/tutor/writingAid/tutorContext';
import {useWritingAid, type WritingAidView} from '../../../src/features/tutor/writingAid/useWritingAid';
import type {WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import type {TutorHintsMode} from '../../../src/features/tutor/writingAid/preferences';

vi.mock('../../../src/data/mode', () => ({getMode: () => 'demo', getDemoProfile: () => 'hints-test'}));
let root: Root, host: HTMLDivElement, view: WritingAidView;
function request(text: string, signal: string, variables: string[] = []): WritingAidRequest {
  const tutorContext = normalizeTutorWritingContext({version: 1, revision: 'r1',
    signals: [{id: 's1', role: 'given', text: signal, variables}]}, 'reply-1')!;
  return {cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false, tutorContext,
    target: {scopeKey: 'demo:checkpoint', mountId: 'one', editorRevision: 1, selectionRevision: 1, modeRevision: 1}};
}
function Harness({input, hints}: {input: WritingAidRequest; hints?: TutorHintsMode}) {view = useWritingAid(input, hints); return null;}
async function render(input: WritingAidRequest, hints?: TutorHintsMode) {
  await act(async () => {root.render(<Harness input={input} hints={hints}/>);});
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 35));});
}

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks();});

it('defaults to tutor wording, with the full-signal and off modes changing eligible outputs', async () => {
  const term = request('metaphrasingz', 'Please explain the metaphrasingzz');
  expect(predictWritingAidPool(term).words.some(item => item.tutorEvidence)).toBe(true);
  await render(term);
  expect(view.words.some(item => item.tutorEvidence)).toBe(false);
  await render(term, 'all');
  const old = view.words.find(item => item.tutorEvidence)!;
  expect(old.label).toBe('metaphrasingzz');
  await act(async () => view.shown('words', [old]));
  expect(view.isCurrent(old)).toBe(true);
  await render(term, 'wording');
  expect(view.isCurrent(old)).toBe(false);
  expect(view.words.some(item => item.tutorEvidence)).toBe(false);

  const phrase = request('The question asks about the', 'The question asks about the original wording');
  await render(phrase);
  expect(view.ghost?.tutorEvidence).toMatchObject({sourceId: 'reply-1'});
  await render(phrase, 'off');
  expect(view.ghost?.tutorEvidence).toBeUndefined();
});

it('retains the declared-variable guard in wording mode and restores the baseline when hints are off', async () => {
  const input = request('notatio', 'The notation is in the question.', ['notation']);
  await render(input, 'wording');
  expect(view.words.some(item => item.label === 'notation')).toBe(false);
  await render(input, 'off');
  expect(view.words.some(item => item.label === 'notation')).toBe(true);
});
