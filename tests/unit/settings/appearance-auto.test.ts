import {afterEach,describe,expect,it,vi} from 'vitest';

afterEach(()=>{
 vi.unstubAllGlobals();
 vi.resetModules();
});

function browserAfterInlineBoot(mode:'auto'|'day',osDark:boolean){
 const root={dataset:{theme:'graph',appearanceMode:mode,density:'compact',effects:'calm',themePreference:'legacy'}};
 const meta=[{setAttribute:vi.fn()},{setAttribute:vi.fn()}];
 let onChange:()=>void=()=>{};
 const media={
  matches:osDark,
  addEventListener:vi.fn((_event:string,listener:()=>void)=>{onChange=listener}),
 };
 const storage=new Map([['lemma.ui',JSON.stringify({mode})]]);
 vi.stubGlobal('window',{matchMedia:vi.fn(()=>media),dispatchEvent:vi.fn()});
 vi.stubGlobal('document',{documentElement:root,querySelectorAll:vi.fn(()=>meta)});
 vi.stubGlobal('localStorage',{
  getItem:(key:string)=>storage.get(key)??null,
  setItem:(key:string,value:string)=>{storage.set(key,value)},
 });
 return {root,meta,media,notify:()=>onChange()};
}

describe('Automatic appearance under lazy module bootstrap',()=>{
 it('reconciles an OS dark change missed between inline first paint and appearance import',async()=>{
  // index.html paints Graph day immediately; App/settings can load this
  // listener only after the OS has already switched to dark.
  const {root,meta,media,notify}=browserAfterInlineBoot('auto',true);
  expect(root.dataset.theme).toBe('graph');
  await import('../../../src/styles/appearance');
  expect(media.addEventListener).toHaveBeenCalledWith('change',expect.any(Function));
  expect(root.dataset.theme).toBe('graph-night');
  expect(root.dataset.appearanceMode).toBe('auto');
  for(const item of meta)expect(item.setAttribute).toHaveBeenCalledWith('content','#13171D');
  media.matches=false;
  notify();
  expect(root.dataset.theme).toBe('graph');
 });
 it('does not override a manually selected day mode on OS changes',async()=>{
  const {root,media,notify}=browserAfterInlineBoot('day',true);
  await import('../../../src/styles/appearance');
  expect(root.dataset.theme).toBe('graph');
  media.matches=false;
  notify();
  expect(root.dataset.theme).toBe('graph');
 });
});
