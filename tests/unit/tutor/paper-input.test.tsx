import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {isIPadBrowser,PencilOnlyControl,usePaperInput} from '../../../src/features/tutor/PaperInputTools';

beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  localStorage.clear();
});
afterEach(()=>{vi.unstubAllGlobals();});

test('recognizes iPad and desktop-mode iPadOS, not iPhone, Android or a non-touch Mac',()=>{
  expect(isIPadBrowser({platform:'iPad',userAgent:'iPad Safari',maxTouchPoints:1})).toBe(true);
  expect(isIPadBrowser({platform:'MacIntel',userAgent:'Macintosh Safari',maxTouchPoints:5})).toBe(true);
  expect(isIPadBrowser({platform:'MacIntel',userAgent:'Macintosh Safari',maxTouchPoints:0})).toBe(false);
  expect(isIPadBrowser({platform:'iPhone',userAgent:'iPhone Safari',maxTouchPoints:5})).toBe(false);
  expect(isIPadBrowser({platform:'Linux armv8l',userAgent:'Android Tablet Chrome',maxTouchPoints:10})).toBe(false);
});

test('both paper controls share Pencil default, persisted opt-out and eraser preference',async()=>{
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  function Paper() {
    const input=usePaperInput();
    return <><PencilOnlyControl enabled={input.enabled} onToggle={input.toggle}/>
      <button onClick={()=>input.setEraserKind('pixel')}>{input.eraserKind}</button></>;
  }
  const toggles=()=>[...host.querySelectorAll('[aria-label="Apple Pencil only"]')];
  try {
    await act(async()=>root.render(<><Paper/><Paper/></>));
    expect(toggles().map(button=>button.getAttribute('aria-pressed'))).toEqual(['true','true']);
    await act(async()=>{(toggles()[0] as HTMLButtonElement).click();host.querySelectorAll('button')[1].click();});
    expect(toggles().map(button=>button.getAttribute('aria-pressed'))).toEqual(['false','false']);
    expect(host.querySelectorAll('button')[3].textContent).toBe('pixel');
    expect(localStorage.getItem('lemma.tutor.pencil-only')).toBe('off');
    expect(localStorage.getItem('lemma.tutor.eraser-kind')).toBe('pixel');
    await act(async()=>root.render(null));
    await act(async()=>root.render(<Paper/>));
    expect(toggles()[0].getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelectorAll('button')[1].textContent).toBe('pixel');
  } finally {
    await act(async()=>root.unmount());
    host.remove();
  }
});
