import {act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useAnimatedNumber} from '../../../src/ui/v7/useAnimatedNumber';
import {installSheetDrag,releaseVelocity} from '../../../src/ui/v7/sheetDrag';
import {REDUCE_EFFECTS_ATTR} from '../../../src/ui/v7/effects';
import {Sheet} from '../../../src/ui/v7/components';

// N152 · V20: dismissSheet (the sheet's drag to dismiss) and interpolateNumber (a number that animates) are in use;
// transitionPresets, which nothing used, is gone.
let root:Root|null=null,host:HTMLElement|null=null;
async function mount(node:React.ReactNode){
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root!.render(node));
}
afterEach(async()=>{
 if(root)await act(async()=>root!.unmount());
 host?.remove();root=null;host=null;
 document.documentElement.removeAttribute(REDUCE_EFFECTS_ATTR);
 vi.unstubAllGlobals();vi.useRealTimers();
});

describe('V20 · a number that animates (interpolateNumber)',()=>{
 let frames:FrameRequestCallback[]=[],clock=0;
 beforeEach(()=>{
  frames=[];clock=0;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
  vi.stubGlobal('cancelAnimationFrame',()=>{frames=[];});
 });
 async function tick(ms:number){
  clock+=ms;const run=frames;frames=[];
  await act(async()=>{for(const callback of run)callback(clock);});
 }
 let set:(value:number)=>void=()=>{},setLive:(value:boolean)=>void=()=>{};
 function Figure({initial,live:startLive=true}:{initial:number;live?:boolean}){
  const [value,setValue]=useState(initial),[live,setLiveState]=useState(startLive);set=setValue;setLive=setLiveState;
  return <strong>{useAnimatedNumber(value,live)}</strong>;
 }
 const shown=()=>Number(host!.querySelector('strong')!.textContent);

 it('shows the first value at once, then counts to a new value through whole numbers in 240 ms',async()=>{
  await mount(<Figure initial={23}/>);
  expect(shown()).toBe(23);
  await act(async()=>set(14));
  expect(shown()).toBe(23);
  await tick(0);
  await tick(60);
  const middle=shown();
  expect(middle).toBeLessThan(23);expect(middle).toBeGreaterThan(14);expect(Number.isInteger(middle)).toBe(true);
  await tick(200);
  expect(shown()).toBe(14);
  expect(frames).toHaveLength(0);
 });
 it('the first value after loading shows at once (no count up from the loading value)',async()=>{
  await mount(<Figure initial={0} live={false}/>);
  await act(async()=>{set(23);setLive(true);});
  expect(shown()).toBe(23);
  expect(frames).toHaveLength(0);
 });
 it('a change mid-count continues from the number on screen',async()=>{
  await mount(<Figure initial={0}/>);
  await act(async()=>set(100));
  await tick(0);await tick(120);
  const middle=shown();
  await act(async()=>set(0));
  expect(shown()).toBe(middle);
  await tick(0);await tick(40);
  expect(shown()).toBeLessThan(middle);
  await tick(300);
  expect(shown()).toBe(0);
 });
 it('with reduced motion the number jumps to its new value',async()=>{
  document.documentElement.setAttribute(REDUCE_EFFECTS_ATTR,'');
  await mount(<Figure initial={23}/>);
  await act(async()=>set(14));
  expect(shown()).toBe(14);
  expect(frames).toHaveLength(0);
 });
});

describe('V20 · drag a bottom sheet down to dismiss (dismissSheet)',()=>{
 let uninstall=()=>{};
 beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){if(this.open){this.removeAttribute('open');this.dispatchEvent(new Event('close'));}}});
  window.scrollTo=()=>{};
  uninstall=installSheetDrag();
 });
 afterEach(()=>uninstall());
 function Host({onClose}:{onClose:()=>void}){
  const [open,setOpen]=useState(true);
  return <Sheet open={open} onClose={()=>{onClose();setOpen(false);}} title="Customise this round"><p>Body</p></Sheet>;
 }
 const dialog=()=>host!.querySelector('dialog')!;
 function place(bottom=window.innerHeight,height=400){
  dialog().getBoundingClientRect=()=>({top:bottom-height,bottom,height,left:0,right:390,width:390,x:0,y:bottom-height,toJSON(){}}) as DOMRect;
 }
 function pointer(target:Element,type:string,clientY:number,time:number){
  const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientY,button:0});
  Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true},timeStamp:{value:time}});
  target.dispatchEvent(event);
 }
 async function drag(from:Element,distance:number,ms:number){
  await act(async()=>{
   pointer(from,'pointerdown',300,1000);
   for(let step=1;step<=4;step++)pointer(from,'pointermove',300+distance*step/4,1000+ms*step/4);
   pointer(from,'pointerup',300+distance,1000+ms);
  });
 }
 it('pulling the header down 30% of the sheet closes it, through the same path as Escape',async()=>{
  const onClose=vi.fn();
  await mount(<Host onClose={onClose}/>);place();
  await drag(host!.querySelector('.v7-sheet-header h2')!,120,600);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dialog().open).toBe(false);
  expect(dialog().style.transform).toBe('');
 });
 it('a short slow pull settles back and keeps the sheet open',async()=>{
  vi.useFakeTimers();
  const onClose=vi.fn();
  await mount(<Host onClose={onClose}/>);place();
  const grabber=host!.querySelector('.v7-grabber')!;
  await act(async()=>{pointer(grabber,'pointerdown',300,1000);pointer(grabber,'pointermove',380,1400);});
  expect(dialog().style.transform).toBe('translateY(80px)');
  await act(async()=>{pointer(grabber,'pointerup',380,1800);});
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog().open).toBe(true);
  expect(dialog().style.transform).toBe('');
 });
 it('a short fast flick (over 600 px/s) closes it',async()=>{
  const onClose=vi.fn();
  await mount(<Host onClose={onClose}/>);place();
  await drag(host!.querySelector('.v7-grabber')!,40,40);
  expect(onClose).toHaveBeenCalledTimes(1);
 });
 it('the Close button, the body and a centred dialog do not drag',async()=>{
  const onClose=vi.fn();
  await mount(<Host onClose={onClose}/>);place();
  await drag(host!.querySelector('.v7-sheet-header button')!,200,600);
  await drag(host!.querySelector('.v7-sheet-body p')!,200,600);
  place(window.innerHeight-200);
  await drag(host!.querySelector('.v7-grabber')!,200,600);
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog().style.transform).toBe('');
 });
 it('measures the release speed over the last 100 ms',()=>{
  expect(releaseVelocity([[0,0],[10,900],[40,950]],60,1000)).toBeCloseTo(500);
  expect(releaseVelocity([[0,0]],0,500)).toBe(0);
  expect(releaseVelocity([],10,10)).toBe(0);
 });
});

describe('V20 · in use',()=>{
 it('the app installs the sheet drag, the Review hub animates its count, and transitionPresets is gone',()=>{
  expect(readFileSync('src/main.tsx','utf8')).toContain('installSheetDrag()');
  expect(readFileSync('src/ui/v7/sheetDrag.ts','utf8')).toContain("import {dismissSheet} from './motion';");
  expect(readFileSync('src/ui/v7/useAnimatedNumber.ts','utf8')).toContain("import {interpolateNumber,motionV1} from './motion';");
  const hub=readFileSync('src/features/review/v7/ReviewHubV7.tsx','utf8');
  expect(hub).toContain('const shownCount=useAnimatedNumber(count,!loading&&!failed);');
  expect(hub).toContain('<strong aria-label="Cards in this round">{shownCount}</strong>');
  expect(readFileSync('src/ui/v7/motion.ts','utf8')).not.toContain('transitionPresets');
 });
});
