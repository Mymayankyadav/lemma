import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {predictWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {detectWritingAutoCorrection, evaluateWritingAutoCorrection, writingAutoPrecisionLowerBound,
  type WritingAutoCalibration, type WritingAutoCorrectionRequest} from '../../../src/features/tutor/writingAid/autoCorrect';
import {createWritingAidModel, parseWritingAidModel, recordWritingAutoAcceptance, revokeWritingAutoTrust,
  writingAutoTrustQualified} from '../../../src/features/tutor/writingAid/learning';
import {useWritingAid, type WritingAidView} from '../../../src/features/tutor/writingAid/useWritingAid';
import {setWritingAidPersonalization} from '../../../src/features/tutor/writingAid/personalization';
import type {WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

vi.mock('../../../src/data/mode', () => ({getMode: () => 'demo', getDemoProfile: () => 'auto-test'}));
const key = 'lemma.demo-tutor.writing-aid-model.v1:auto-test';
let root: Root, host: HTMLDivElement, view: WritingAidView;
function request(text: string, revision = 1, anchor = true): WritingAidRequest {
  return {cursor: padEdit(text), anchor: anchor ? {text, start: 0} : null, mode: 'balanced', composing: false, readOnly: false,
    target: {scopeKey: 'demo:checkpoint', mountId: 'one', editorRevision: revision, selectionRevision: revision, modeRevision: 1}};
}
function input(text: string, overrides: Partial<WritingAutoCorrectionRequest> = {}): WritingAutoCorrectionRequest {
  const before = request(text);
  return {before: before.cursor, after: padEdit(text + ' '), anchor: before.anchor, target: before.target, mode: before.mode,
    enabled: true, composing: false, readOnly: false, inputType: 'insertText', ...overrides};
}
function Harness({value}: {value: WritingAidRequest}) {view = useWritingAid(value); return null;}
async function render(value: WritingAidRequest) {
  await act(async () => {root.render(<Harness value={value}/>);});
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 35));});
}
const qualifyingEvidence: WritingAutoCalibration[] = [{ruleId: 'teh-to-the', sampleSize: 200, correct: 200,
  artifact: 'test-only-calibration', population: 'synthetic'}];

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks();});

describe('qualified local automatic corrections', () => {
  it('requires independent per-pair calibration and two explicit, unexpired manual accepts', () => {
    const data = input('We wrote teh'), model = createWritingAidModel();
    expect(detectWritingAutoCorrection(data)).toBeNull();
    recordWritingAutoAcceptance(model, 'teh-to-the');
    expect(detectWritingAutoCorrection({...data, trust: model.autoTrust})).toBeNull();
    recordWritingAutoAcceptance(model, 'teh-to-the');
    const applied = detectWritingAutoCorrection({...data, trust: model.autoTrust})!;
    expect(applied).toMatchObject({source: 'teh', replacement: 'the', ruleId: 'teh-to-the',
      calibration: {population: 'synthetic', confidence: .95}});
    expect(applied.calibration.precisionLowerBound).toBeGreaterThan(.98);
    expect(applied.typed.text).toBe('We wrote teh ');
    expect(applied.corrected.text).toBe('We wrote the ');
    revokeWritingAutoTrust(model, 'teh-to-the');
    expect(detectWritingAutoCorrection({...data, trust: model.autoTrust})).toBeNull();
    expect(writingAutoPrecisionLowerBound(200, 200)).toBeGreaterThan(.98);
    expect(evaluateWritingAutoCorrection(data, [{...qualifyingEvidence[0], correct: 180}])).toBeNull();
    expect(evaluateWritingAutoCorrection(data, [{...qualifyingEvidence[0], sampleSize: 10, correct: 10}])).toBeNull();
  });

  it('never corrects paste, composition, stale anchors, math, labels or an uncommitted token', () => {
    const text = 'We wrote teh', good = input(text);
    const bad = [
      {...good, inputType: 'insertFromPaste'}, {...good, composing: true}, {...good, readOnly: true},
      {...good, enabled: false}, {...good, mode: 'off' as const}, {...good, anchor: null},
      {...good, anchor: {text, start: text.length}}, {...good, anchor: {text, start: 0, continuation: text}},
      {...good, after: padEdit(text)}, {...good, after: padEdit(text + ' x')},
      {...good, before: padEdit(text, 2)},
    ];
    for (const value of bad) expect(evaluateWritingAutoCorrection(value, qualifyingEvidence)).toBeNull();
    for (const unsafe of ['teh', 'Let teh', 'We label teh', 'We wrote x=teh', 'We wrote x_teh',
      'We wrote `teh', 'The literal token is teh', 'We wrote not teh']) {
      expect(evaluateWritingAutoCorrection(input(unsafe), qualifyingEvidence), unsafe).toBeNull();
    }
    const punctuation = evaluateWritingAutoCorrection({...good, after: padEdit(text + ',')}, qualifyingEvidence);
    expect(punctuation?.typed.text).toBe('We wrote teh,');
    expect(punctuation?.corrected.text).toBe('We wrote the,');
  });

  it('expires pair trust after 30 days and clears only the rejected pair', () => {
    const model = createWritingAidModel(), start = 1000;
    recordWritingAutoAcceptance(model, 'teh-to-the', start);
    recordWritingAutoAcceptance(model, 'teh-to-the', start + 1);
    recordWritingAutoAcceptance(model, 'recieve-to-receive', start + 1);
    expect(writingAutoTrustQualified(model.autoTrust, 'teh-to-the', start + 2)).toBe(true);
    expect(writingAutoTrustQualified(model.autoTrust, 'teh-to-the', start + 31 * 86400 * 1000)).toBe(false);
    recordWritingAutoAcceptance(model, 'teh-to-the', start + 31 * 86400 * 1000);
    expect(model.autoTrust['teh-to-the'].accepts).toBe(1);
    revokeWritingAutoTrust(model, 'teh-to-the');
    expect(model.autoTrust['teh-to-the']).toBeUndefined();
    expect(model.autoTrust['recieve-to-receive'].accepts).toBe(1);
    const restored = parseWritingAidModel(JSON.parse(JSON.stringify(model)));
    expect(restored.autoTrust['recieve-to-receive'].accepts).toBe(1);
  });

  it('builds trust from manual corrections, does not credit automatic events, and revokes on undo', async () => {
    const first = request('We wrote teh');
    expect(predictWritingAidPool(first).edit[0]).toMatchObject({before: 'teh', insert: 'the'});
    await render(first);
    const firstEdit = view.edit!;
    expect(firstEdit).toMatchObject({before: 'teh', insert: 'the'});
    await act(async () => {view.shown('edit', [firstEdit]); view.feedback('accept', firstEdit);});
    expect(view.autoTrust['teh-to-the'].accepts).toBe(1);
    await render(request('We wrote the', 2, false));
    await render(request('We wrote the and teh', 3));
    const secondEdit = view.edit!;
    await act(async () => {view.shown('edit', [secondEdit]); view.feedback('accept', secondEdit);});
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    const third = request('We wrote the and the plus teh', 4);
    await render(third);
    const result = detectWritingAutoCorrection(input(third.cursor.text, {target: third.target, trust: view.autoTrust}))!;
    expect(result.corrected.text).toBe('We wrote the and the plus the ');
    await act(async () => view.autoFeedback('auto-applied', result));
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    await render(request(result.corrected.text, 5, false));
    await act(async () => view.autoFeedback('auto-kept', result));
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    await act(async () => view.autoFeedback('auto-undo', result));
    expect(view.autoTrust['teh-to-the']).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(key)!).model.autoTrust['teh-to-the']).toBeUndefined();
  });

  it('revokes manual trust after refreshing or editing an accepted occurrence', async () => {
    const first = request('We wrote teh');
    await render(first);
    const initial = view.edit!;
    await act(async () => {view.shown('edit', [initial]); view.feedback('accept', initial);});
    expect(view.autoTrust['teh-to-the'].accepts).toBe(1);
    await render(request('We wrote the', 2, false));
    await render(request('We wrote the and teh', 3));
    const replacement = view.edit!;
    await act(async () => {view.shown('edit', [replacement]); view.refresh('edit', [replacement]);});
    expect(view.autoTrust['teh-to-the']).toBeUndefined();

    await render(request('We wrote the and teh ', 4));
    await render(request('We wrote the and te', 5));
    await render(request('We wrote the and teh', 6));
    const retry = view.edit!;
    await act(async () => {view.shown('edit', [retry]); view.feedback('accept', retry);});
    expect(view.autoTrust['teh-to-the'].accepts).toBe(1);
    await render(request('We wrote the and the', 7, false));
    await render(request('We wrote the and thi', 8, false));
    expect(view.autoTrust['teh-to-the']).toBeUndefined();
  });

  it('keeps explicit pair trust when an accepted draft is sent or replaced', async () => {
    const first = request('We wrote teh');
    await render(first);
    const edit = view.edit!;
    await act(async () => {view.shown('edit', [edit]); view.feedback('accept', edit);});
    await render(request('We wrote the', 2, false));
    await render(request('', 3, false));
    expect(view.autoTrust['teh-to-the'].accepts).toBe(1);
    await render(request('We wrote teh', 4));
    const second = view.edit!;
    await act(async () => {view.shown('edit', [second]); view.feedback('accept', second);});
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    await render(request('We wrote the', 5, false));
    await act(async () => view.discardTrackedCorrections());
    await render(request('A new unrelated draft', 6, false));
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
  });

  it('revokes pair trust when an earlier accepted occurrence is edited after a later acceptance', async () => {
    await render(request('We wrote teh'));
    const first = view.edit!;
    await act(async () => {view.shown('edit', [first]); view.feedback('accept', first);});
    await render(request('We wrote the', 2, false));
    await render(request('We wrote the and teh', 3));
    const second = view.edit!;
    await act(async () => {view.shown('edit', [second]); view.feedback('accept', second);});
    await render(request('We wrote the and the', 4, false));
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    await render(request('Well We wrote the and the', 5, false));
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    await render(request('Well We wrote thu and the', 6, false));
    expect(view.autoTrust['teh-to-the']).toBeUndefined();
  });

  it('does not restore old trust after an explicit rejection while personalization is off', async () => {
    await render(request('We wrote teh'));
    const first = view.edit!;
    await act(async () => {view.shown('edit', [first]); view.feedback('accept', first);});
    await render(request('We wrote the', 2, false));
    await render(request('We wrote the and teh', 3));
    const second = view.edit!;
    await act(async () => {view.shown('edit', [second]); view.feedback('accept', second);});
    expect(view.autoTrust['teh-to-the'].accepts).toBe(2);
    await act(async () => {expect(setWritingAidPersonalization(false, 'demo:auto-test')).toBe(true);});
    await render(request('We wrote the and the plus teh', 4));
    const declined = view.edit!;
    await act(async () => {view.shown('edit', [declined]); view.feedback('dismiss', declined);});
    await act(async () => {expect(setWritingAidPersonalization(true, 'demo:auto-test')).toBe(true);});
    expect(view.autoTrust['teh-to-the']).toBeUndefined();
  });
});
