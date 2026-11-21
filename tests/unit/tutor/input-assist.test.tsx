import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {EditTarget, InkInferenceResult, InkReadiness, InkSnapshot} from '../../../src/features/tutor/input/types';
import {useTutorInputAssist} from '../../../src/features/tutor/input/useTutorInputAssist';

const runtime = vi.hoisted(() => ({
  submit:vi.fn<(value:InkSnapshot)=>void>(), cancel:vi.fn(),dispose:vi.fn(),
  callbacks:null as null | {onReadiness:(value:InkReadiness)=>void;onResult:(value:InkInferenceResult)=>void},
}));
vi.mock('../../../src/features/tutor/input/inkRecognizer',()=>({
  TUTOR_MODEL_ASSET_SET:'test-model',
  createInkRecognizer:(callbacks:NonNullable<typeof runtime.callbacks>)=>{
    runtime.callbacks=callbacks;
    return {prepare:()=>callbacks.onReadiness('ready'),submit:runtime.submit,cancel:runtime.cancel,dispose:runtime.dispose};
  },
}));
let root:Root, host:HTMLDivElement, assist:ReturnType<typeof useTutorInputAssist>;
let target:EditTarget;
const insert=vi.fn<(symbol:string,target:EditTarget)=>boolean>();
function Harness({enabled=true,scopeKey='owner:checkpoint'}:{enabled?:boolean;scopeKey?:string}) {
  assist=useTutorInputAssist({scopeKey,enabled,automatic:true,readOnly:false,composing:false,target:()=>target,insert});
  return null;
}
const render=(props:Parameters<typeof Harness>[0]={})=>act(async()=>root.render(<Harness {...props}/>));
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  target={scopeKey:'owner:checkpoint',mountId:'composer',editorRevision:0,selectionRevision:0,modeRevision:0};
  runtime.callbacks=null;runtime.submit.mockClear();runtime.cancel.mockClear();runtime.dispose.mockClear();
  insert.mockReset();insert.mockReturnValue(true);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function completedStroke() {
  assist.openDraw();
  assist.onBegin(1,'touch',{x:180,y:20,t:1});
  assist.onMove(1,{x:114,y:50,t:2});
  assist.onEnd(1,{x:180,y:80,t:3});
}
function resultFor(sample:InkSnapshot):InkInferenceResult {
  return {...sample,rawScores:[{classId:'forall',symbolId:'forall',score:.999},{classId:'alt',score:.001}],scoreKind:'probability'};
}

test('caps recognition at a tap even when automatic is preferred and restores keys after one symbol',async()=>{
  await render();
  expect(runtime.callbacks).toBeNull();
  await act(async()=>completedStroke());
  const sample=runtime.submit.mock.calls.at(-1)![0];
  await act(async()=>runtime.callbacks!.onResult(resultFor(sample)));
  expect(assist.recognized).toContain('forall');
  expect(assist.actionable).toBe(true);
  expect(insert).not.toHaveBeenCalled();
  await act(async()=>assist.onAccept('forall'));
  await act(async()=>runtime.callbacks!.onResult(resultFor(sample)));
  expect(insert.mock.calls).toEqual([['forall',target]]);
  expect(assist.drawing).toBe(false);
  expect(assist.recent).toEqual(['forall']);
});

test('keeps derived completions separate from classifier matches and rejects a stale caret',async()=>{
  await render();
  await act(async()=>completedStroke());
  const sample=runtime.submit.mock.calls.at(-1)![0];
  await act(async()=>runtime.callbacks!.onResult(resultFor(sample)));
  expect(assist.completions).toContain('less-than-or-equal');
  target={...target,selectionRevision:1};
  await act(async()=>assist.onAccept('less-than-or-equal'));
  expect(insert).not.toHaveBeenCalled();
  await act(async()=>{assist.pause();assist.openDraw();});
  await act(async()=>runtime.callbacks!.onResult(resultFor(sample)));
  expect(assist.recognized).not.toContain('forall');
});

test('keeps manual picking available without model setup and drops stale work on a scope change',async()=>{
  await render({enabled:false});
  await act(async()=>{assist.openDraw();assist.openPicker();});
  expect(runtime.callbacks).toBeNull();
  expect(assist.picker).toBe(true);
  await act(async()=>assist.onPick('forall'));
  expect(insert).toHaveBeenCalledOnce();
  insert.mockClear();

  await render();
  await act(async()=>completedStroke());
  const oldResult=runtime.callbacks!.onResult,sample=runtime.submit.mock.calls.at(-1)![0];
  target={...target,scopeKey:'another:checkpoint'};
  await render({scopeKey:target.scopeKey});
  await act(async()=>oldResult(resultFor(sample)));
  expect(runtime.dispose).toHaveBeenCalled();
  expect(assist.drawing).toBe(false);
  expect(assist.recent).toEqual([]);
  expect(insert).not.toHaveBeenCalled();
});

test('previews during a held stroke, limits acceptance to release, and retains ink when insertion is rejected',async()=>{
  vi.useFakeTimers();
  try {
    await render();
    await act(async()=>{
      assist.openDraw();
      assist.onBegin(1,'touch',{x:180,y:20,t:1});
      assist.onMove(1,{x:114,y:50,t:2});
      await vi.advanceTimersByTimeAsync(100);
    });
    const drawingSample=runtime.submit.mock.calls.at(-1)![0];
    await act(async()=>runtime.callbacks!.onResult(resultFor(drawingSample)));
    expect(assist.recognized).toContain('forall');
    expect(assist.actionable).toBe(false);
    await act(async()=>assist.onAccept('forall'));
    expect(insert).not.toHaveBeenCalled();
    await act(async()=>assist.onEnd(1,{x:180,y:80,t:3}));
    const sample=runtime.submit.mock.calls.at(-1)![0];
    await act(async()=>runtime.callbacks!.onResult(resultFor(sample)));
    insert.mockReturnValueOnce(false);
    await act(async()=>assist.onAccept('forall'));
    expect(assist.snapshot?.strokes).toHaveLength(1);
    expect(assist.error).toContain('room');
    expect(assist.drawing).toBe(true);
    await act(async()=>assist.onAccept('forall'));
    expect(assist.drawing).toBe(false);
    expect(insert).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test('does not turn a delayed pointer click into acceptance of a later result with the same symbol ID',async()=>{
  await render();
  await act(async()=>completedStroke());
  const old=runtime.submit.mock.calls.at(-1)![0];
  await act(async()=>runtime.callbacks!.onResult(resultFor(old)));
  await act(async()=>{assist.pressCandidate('forall');assist.releaseCandidate();});
  await act(async()=>{
    assist.onBegin(2,'touch',{x:135,y:92,t:4});
    assist.onEnd(2,{x:180,y:92,t:5});
  });
  const newer=runtime.submit.mock.calls.at(-1)![0];
  expect(newer.inkRevision).toBeGreaterThan(old.inkRevision);
  await act(async()=>runtime.callbacks!.onResult(resultFor(newer)));
  await act(async()=>assist.onAccept('forall',true));
  expect(insert).not.toHaveBeenCalled();
  await act(async()=>{assist.pressCandidate('forall');assist.onAccept('forall',true);});
  expect(insert).toHaveBeenCalledOnce();
});

test('focusing a candidate does not stop submissions or previews for a subsequent stroke',async()=>{
  await render();
  await act(async()=>completedStroke());
  const old=runtime.submit.mock.calls.at(-1)![0];
  await act(async()=>runtime.callbacks!.onResult(resultFor(old)));
  await act(async()=>{
    assist.lockAutomatic();
    assist.onBegin(2,'touch',{x:135,y:92,t:4});
    assist.onEnd(2,{x:180,y:92,t:5});
  });
  const newer=runtime.submit.mock.calls.at(-1)![0];
  expect(newer.inkRevision).toBeGreaterThan(old.inkRevision);
  await act(async()=>runtime.callbacks!.onResult({...resultFor(newer),
    rawScores:[{classId:'exists',symbolId:'exists',score:1}]}));
  expect(assist.recognized).toContain('exists');
  expect(assist.actionable).toBe(true);
  expect(insert).not.toHaveBeenCalled();
});

test('a cancelled pointer press does not reject a different accessible candidate activation',async()=>{
  await render();
  await act(async()=>completedStroke());
  const sample=runtime.submit.mock.calls.at(-1)![0];
  await act(async()=>runtime.callbacks!.onResult(resultFor(sample)));
  expect(assist.completions).toContain('less-than-or-equal');
  await act(async()=>{assist.pressCandidate('forall');assist.releaseCandidate();});
  await act(async()=>assist.onAccept('less-than-or-equal',false));
  expect(insert.mock.calls).toEqual([['less-than-or-equal',target]]);
});

test('hiding recognition cancels a held stroke and invalidates its delayed result on reopening',async()=>{
  vi.useFakeTimers();
  try {
    await render();
    await act(async()=>{
      assist.openDraw();
      assist.onBegin(1,'touch',{x:180,y:20,t:1});
      assist.onMove(1,{x:114,y:50,t:2});
      await vi.advanceTimersByTimeAsync(100);
    });
    const old=runtime.submit.mock.calls.at(-1)![0];
    await act(async()=>assist.pause());
    expect(assist.drawing).toBe(false);
    await act(async()=>assist.openDraw());
    await act(async()=>runtime.callbacks!.onResult(resultFor(old)));
    expect(assist.recognized).not.toContain('forall');
    await act(async()=>{
      assist.onBegin(2,'touch',{x:180,y:20,t:3});
      assist.onEnd(2,{x:114,y:50,t:4});
    });
    const latest=runtime.submit.mock.calls.at(-1)![0];
    await act(async()=>runtime.callbacks!.onResult(resultFor(latest)));
    expect(assist.actionable).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
