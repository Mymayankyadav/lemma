import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {predictWritingAidPool, selectWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {
  createWritingAidModel, parseWritingAidModel, recordWritingAidVocabulary, scoreWritingAidFeatures,
  updateWritingAidModel, writingAidFeatures, type WritingAidFeatures,
} from '../../../src/features/tutor/writingAid/learning';
import {resetWritingAidPersonalization} from '../../../src/features/tutor/writingAid/personalization';
import {currentWritingAidScope} from '../../../src/features/tutor/writingAid/preferences';
import {useWritingAid, type WritingAidView} from '../../../src/features/tutor/writingAid/useWritingAid';
import type {WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

vi.mock('../../../src/data/mode', () => ({getMode: () => 'demo', getDemoProfile: () => 'learning-test'}));
const key = 'lemma.demo-tutor.writing-aid-model.v1:learning-test';
let root: Root, host: HTMLDivElement, view: WritingAidView;
function request(text: string, overrides: Partial<WritingAidRequest> = {}): WritingAidRequest {
  return {cursor: padEdit(text), anchor: {text, start: 0}, mode: 'fast', composing: false, readOnly: false,
    target: {scopeKey: 'demo:checkpoint', mountId: 'composer', editorRevision: 1, selectionRevision: 1, modeRevision: 1},
    ...overrides};
}
function Harness({input}: {input: WritingAidRequest}) {view = useWritingAid(input); return null;}
const settle = async () => {await act(async () => {await new Promise(resolve => setTimeout(resolve, 35));});};
async function render(input: WritingAidRequest) {
  await act(async () => {root.render(<Harness input={input}/>);});
  await settle();
}
function storedModel() {return parseWritingAidModel(JSON.parse(localStorage.getItem(key)!).model);}

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks();});

describe('local writing personalization', () => {
  it('does not collect directly typed vocabulary when suggestion mode is off', async () => {
    const input = request('I am ', {mode: 'off'});
    await render(input);
    await render(request('I am writing ', {mode: 'off', target: {...input.target, editorRevision: 2}}));
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('uses signed decaying item feedback and distinguishes complete phrases and symbols', () => {
    const model = createWritingAidModel();
    const word: WritingAidFeatures = {kind: 'word', candidate: 'notation', prefix: 'nota', previous: 'the', mode: 'balanced'};
    const question: WritingAidFeatures = {...word, kind: 'ghost', candidate: ' the question'};
    const notation: WritingAidFeatures = {...question, candidate: ' the notation'};
    const less: WritingAidFeatures = {...word, kind: 'replace', candidate: '≤'};
    const greater: WritingAidFeatures = {...word, kind: 'replace', candidate: '≥'};
    const time = 1_000_000;
    updateWritingAidModel(model, 'accept', word, time);
    expect(scoreWritingAidFeatures(model, word, time, 'frequency')).toBeCloseTo(.35);
    expect(scoreWritingAidFeatures(model, word, time + 30 * 86400 * 1000, 'frequency')).toBeCloseTo(.175);
    updateWritingAidModel(model, 'undo', word, time);
    expect(scoreWritingAidFeatures(model, word, time)).toBeLessThan(0);
    updateWritingAidModel(model, 'refresh', question, time);
    updateWritingAidModel(model, 'accept', less, time);
    expect(scoreWritingAidFeatures(model, question, time)).toBeLessThan(0);
    expect(scoreWritingAidFeatures(model, notation, time, 'frequency')).toBe(0);
    expect(scoreWritingAidFeatures(model, less, time)).toBeGreaterThan(0);
    expect(scoreWritingAidFeatures(model, greater, time, 'frequency')).toBe(0);
    const otherContext: WritingAidFeatures = {...word, previous: 'my'};
    updateWritingAidModel(model, 'accept', word, time);
    expect(scoreWritingAidFeatures(model, word, time)).toBeGreaterThan(scoreWritingAidFeatures(model, otherContext, time));
  });

  it('bounds storage, retains repeated typed vocabulary, and cannot rank past proof-safety gates', () => {
    const model = createWritingAidModel();
    for (let i = 0; i < 700; i++) {
      updateWritingAidModel(model, 'accept', {kind: 'word', candidate: 'word' + String.fromCharCode(97 + i % 26) +
        String.fromCharCode(97 + Math.floor(i / 26)), previous: 'context', prefix: 'word', mode: 'fast'}, 1000 + i);
    }
    expect(Object.keys(model.weights).length).toBeLessThanOrEqual(512);
    recordWritingAidVocabulary(model, 'quasipolynomial');
    recordWritingAidVocabulary(model, 'quasipolynomial');
    const personal = predictWritingAidPool(request('quasipolynomi', {mode: 'balanced'}), model);
    expect(personal.words.map(item => item.label)).toContain('quasipolynomial');
    const future = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000 * 86400 * 1000);
    expect(predictWritingAidPool(request('quasipolynomi', {mode: 'balanced'}), model).words
      .map(item => item.label)).not.toContain('quasipolynomial');
    future.mockRestore();
    for (const text of ['by ', 'We prove this by ind', 'if ', 'x ∈ ']) {
      const pool = predictWritingAidPool(request(text), model);
      expect(pool.words, text).toEqual([]);
      expect(pool.ghost, text).toEqual([]);
    }
    const pool = predictWritingAidPool(request('I think the re'));
    expect(pool.words.length).toBeGreaterThan(3);
    expect(selectWritingAidPool(pool).words).toHaveLength(3);
    expect(predictWritingAidPool(request('I think the co')).words.map(item => item.label)).not.toContain('commutative');
  });

  it('credits a visible acceptance and immediate undo, but not generated vocabulary', async () => {
    const input = request('I think the re');
    await render(input);
    expect(view.words).toHaveLength(3);
    const [chosen, alternate] = view.words;
    await act(async () => {view.shown('words', view.words); view.feedback('accept', chosen);});
    let model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(chosen))).toBeGreaterThan(0);
    expect(scoreWritingAidFeatures(model, writingAidFeatures(alternate))).toBeLessThan(0);
    const completed = input.cursor.text.slice(0, chosen.start) + chosen.insert;
    await render(request(completed, {anchor: {...input.anchor!, continuation: completed},
      target: {...input.target, editorRevision: 2}}));
    expect(storedModel().vocabulary[chosen.label.toLowerCase()]).toBeUndefined();
    await act(async () => view.feedback('undo', chosen));
    model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(chosen))).toBeLessThan(0);
  });

  it('records delayed retention after a normal model save', async () => {
    const input = request('nota');
    await render(input);
    const chosen = view.words.find(proposal => proposal.label === 'notation')!;
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    await act(async () => {view.shown('words', view.words); view.feedback('accept', chosen);});
    const features = writingAidFeatures(chosen);
    const accepted = scoreWritingAidFeatures(storedModel(), features);
    expect(accepted).toBeGreaterThan(0);
    const next = request(chosen.insert, {anchor: {...input.anchor!, continuation: chosen.insert},
      target: {...input.target, editorRevision: 2}});
    await act(async () => root.render(<Harness input={next}/>));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(scoreWritingAidFeatures(storedModel(), features)).toBeGreaterThan(accepted);
  });

  it('rejects held or hidden proposals instead of training or applying them', async () => {
    await render(request('I think the re'));
    const held = view.words[0];
    expect(view.isCurrent(held)).toBe(false);
    await act(async () => view.shown('words', [held]));
    expect(view.isCurrent(held)).toBe(true);
    await act(async () => view.shown('words', []));
    expect(view.isCurrent(held)).toBe(false);
    await act(async () => view.feedback('accept', held));
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('refreshes only visible proposals, excludes them for the draft, and reports exhaustion', async () => {
    await render(request('I think the re'));
    const first = [...view.words];
    const invisible = first[2];
    await act(async () => {view.shown('words', first.slice(0, 2)); view.refresh('words', first);});
    await settle();
    expect(view.isCurrent(first[0])).toBe(false);
    expect(view.words.map(item => item.label)).toContain(invisible.label);
    let model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(first[0]))).toBeLessThan(0);
    expect(scoreWritingAidFeatures(model, writingAidFeatures(invisible), Date.now(), 'frequency')).toBe(0);
    for (let n = 0; n < 3 && view.words.length; n++) {
      await act(async () => {view.shown('words', view.words); view.refresh('words', view.words);});
      await settle();
    }
    expect(view.words).toEqual([]);
    expect(view.exhausted.words).toBe(true);
    model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(invisible))).toBeLessThan(0);
  });

  it('records a visible continuation typed differently only after dwell, and counts direct typing', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const input = request('could you restate');
    await render(input);
    const ghost = view.ghost!;
    expect(ghost.insert).toBe(' the question');
    await act(async () => view.shown('ghost', [ghost]));
    now.mockReturnValue(10_400);
    await render(request('could you restate the graph ', {target: {...input.target, editorRevision: 2}}));
    const model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(ghost))).toBeLessThan(0);
    expect(model.vocabulary.graph?.uses).toBeGreaterThan(0);
    expect(model.vocabulary.question).toBeUndefined();
  });

  it('drops exposures seen before Forget and learns from fresh typing', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const input = request('could you restate');
    await render(input);
    const ghost = view.ghost!;
    expect(ghost.insert).toBe(' the question');
    await act(async () => view.shown('ghost', [ghost]));
    now.mockReturnValue(10_400);
    await act(async () => {expect(resetWritingAidPersonalization(currentWritingAidScope().id)).toBe(true);});
    await render(request('could you restate the graph ', {target: {...input.target, editorRevision: 2}}));
    const model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(ghost))).toBe(0);
    expect(model.vocabulary.graph?.uses).toBeGreaterThan(0);
  });

  it('learns a typed match and divergence only for visible word choices', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const input = request('I think the re');
    await render(input);
    const [matching, different, hidden] = view.words;
    expect(matching.label).toBe('result');
    await act(async () => view.shown('words', [matching, different]));
    now.mockReturnValue(100_400);
    await render(request('I think the result ', {target: {...input.target, editorRevision: 2}}));
    const model = storedModel();
    expect(scoreWritingAidFeatures(model, writingAidFeatures(matching), Date.now(), 'frequency')).toBeGreaterThan(0);
    expect(scoreWritingAidFeatures(model, writingAidFeatures(different), Date.now(), 'frequency')).toBeLessThan(0);
    expect(scoreWritingAidFeatures(model, writingAidFeatures(hidden), Date.now(), 'frequency')).toBe(0);
  });

  it('does not learn passive rejection from a brief or hidden continuation', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const input = request('could you restate');
    await render(input);
    const ghost = view.ghost!;
    await act(async () => view.shown('ghost', [ghost]));
    now.mockReturnValue(50_100);
    await render(request('could you restate the graph ', {target: {...input.target, editorRevision: 2}}));
    expect(scoreWritingAidFeatures(storedModel(), writingAidFeatures(ghost))).toBe(0);
    await render(input);
    const next = view.ghost!;
    await act(async () => view.shown('ghost', [next]));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => view.shown('ghost', []));
    visibility.mockReturnValue('visible');
    now.mockReturnValue(51_000);
    await render(request('could you restate the graph ', {target: {...input.target, editorRevision: 3}}));
    expect(scoreWritingAidFeatures(storedModel(), writingAidFeatures(next))).toBe(0);
    await render(input);
    const dismissed = view.ghost!;
    await act(async () => {view.shown('ghost', [dismissed]); view.shown('ghost', []);});
    now.mockReturnValue(52_000);
    await render(request('could you restate the graph ', {target: {...input.target, editorRevision: 4}}));
    expect(scoreWritingAidFeatures(storedModel(), writingAidFeatures(dismissed))).toBe(0);
  });

  it('credits explicit retention once and lowers credit when an accepted word is edited', async () => {
    const input = request('I think the re');
    await render(input);
    const chosen = view.words[0];
    await act(async () => {view.shown('words', view.words); view.feedback('accept', chosen);});
    const accepted = scoreWritingAidFeatures(storedModel(), writingAidFeatures(chosen));
    const completed = input.cursor.text.slice(0, chosen.start) + chosen.insert;
    await render(request(completed, {anchor: {...input.anchor!, continuation: completed},
      target: {...input.target, editorRevision: 2}}));
    await act(async () => view.feedback('kept', chosen));
    const retained = scoreWritingAidFeatures(storedModel(), writingAidFeatures(chosen));
    expect(retained).toBeGreaterThan(accepted);
    await act(async () => view.feedback('kept', chosen));
    expect(scoreWritingAidFeatures(storedModel(), writingAidFeatures(chosen))).toBeCloseTo(retained);
    await render(request(input.cursor.text.slice(0, chosen.start) + 'revision ', {anchor: null,
      target: {...input.target, editorRevision: 3}}));
    expect(scoreWritingAidFeatures(storedModel(), writingAidFeatures(chosen))).toBeLessThan(retained);
  });

  it('refreshes certified neutral continuation alternatives and learns their full identity', async () => {
    const input = request('could you explain');
    const pool = predictWritingAidPool(input);
    expect(pool.ghost.length).toBeGreaterThan(1);
    expect(new Set(pool.ghost.map(item => item.insert)).size).toBe(pool.ghost.length);
    expect(pool.ghost.every(item => (item.insert.match(/[\p{L}\p{M}]+/gu) ?? []).length <= 2)).toBe(true);
    const model = createWritingAidModel();
    updateWritingAidModel(model, 'accept', writingAidFeatures(pool.ghost[1]));
    expect(selectWritingAidPool(pool, model).ghost?.insert).toBe(pool.ghost[1].insert);
    await render(input);
    const first = view.ghost!;
    await act(async () => {view.shown('ghost', [first]); view.refresh('ghost', [first]);});
    await settle();
    expect(view.ghost?.insert).not.toBe(first.insert);
    expect(view.isCurrent(first)).toBe(false);
    for (let n = 0; n < 6 && view.ghost; n++) {
      const visible = view.ghost;
      await act(async () => {view.shown('ghost', [visible]); view.refresh('ghost', [visible]);});
      await settle();
    }
    expect(view.ghost).toBeNull();
    expect(view.exhausted.ghost).toBe(true);
  });

  it('keeps a refreshed edit declined while typing after it, but allows a deleted and retyped occurrence', async () => {
    const input = request('x <= y', {mode: 'balanced'});
    await render(input);
    const edit = view.edit!;
    expect(edit.before).toBe('<=');
    await act(async () => {view.shown('edit', [edit]); view.refresh('edit', [edit]);});
    await settle();
    expect(view.edit).toBeNull();
    await render(request('x <= y ', {mode: 'balanced', target: {...input.target, editorRevision: 2}}));
    expect(view.edit).toBeNull();
    await render(request('x <', {mode: 'balanced', target: {...input.target, editorRevision: 3}}));
    await render(request('x <= y ', {mode: 'balanced', target: {...input.target, editorRevision: 4}}));
    expect(view.edit?.insert).toBe('≤');
  });
});
