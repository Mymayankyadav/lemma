import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ToastHost,clearToasts,toast} from '../../../src/ui/Toast';
import {swipeExit} from '../../../src/features/review-run/v7/ReviewRoundV7';
import {cameraFlight} from '../../../src/features/atlas/v7/AtlasMap';

let root:Root,host:HTMLDivElement;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 document.documentElement.setAttribute('data-v7','');
 host=document.body.appendChild(document.createElement('div'));
 root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>{root.unmount();clearToasts();});
 host.remove();document.documentElement.removeAttribute('data-v7');vi.useRealTimers();
});

it('pauses the countdown and the expiry at the same elapsed time on focus',async()=>{
 vi.useFakeTimers();
 await act(async()=>root.render(<ToastHost/>));
 await act(async()=>{toast('Saved',{action:{label:'Undo',onClick:vi.fn()}});});
 const action=host.querySelector<HTMLButtonElement>('.v7-app-toast-action')!;
 const line=host.querySelector<HTMLElement>('.v7-app-toast-countdown')!;
 await act(async()=>{vi.advanceTimersByTime(1000);action.focus();});
 expect(line.style.transform).toBe('scaleX(0.75)');
 await act(async()=>{vi.advanceTimersByTime(4200);});
 expect(line.style.transform).toBe('scaleX(0.75)');
 await act(async()=>{action.blur();vi.advanceTimersByTime(2999);});
 const active=()=>host.querySelector('.v7-app-toast:not([aria-hidden=true])');
 expect(active()).not.toBeNull();
 await act(async()=>{vi.advanceTimersByTime(1);});
 expect(active()).toBeNull();
});

it('merges matching and distinct notifications without dropping either Undo action',async()=>{
 vi.useFakeTimers();
 const calls:string[]=[];
 await act(async()=>root.render(<ToastHost/>));
 await act(async()=>{
  for(const label of ['first','second','third']){
   toast(label==='third'?'Another change':'Saved',{action:{label:'Undo',onClick:()=>calls.push(label)}});
   vi.advanceTimersByTime(100);
  }
 });
 expect(host.textContent).toContain('3 changes');
 await act(async()=>host.querySelector<HTMLButtonElement>('.v7-app-toast-action')?.click());
 expect(calls).toEqual(['third','second','first']);
});

it('moves a committed swipe farther along its release direction',()=>{
 expect(swipeExit({dx:111,dy:-17},3,300)).toEqual({dx:411,dy:-17});
 expect(swipeExit({dx:-111,dy:17},1,300)).toEqual({dx:-411,dy:0});
 expect(swipeExit({dx:20,dy:-111},4,300)).toEqual({dx:20,dy:-411});
});

it('scales Atlas flights by screen distance and keeps nearby moves within 300 ms',()=>{
 const origin={x:0,y:0,k:1};
 expect(cameraFlight(origin,{x:500,y:0,k:1},500,600)).toEqual({duration:300,long:false});
 expect(cameraFlight(origin,{x:900,y:0,k:1},500,600)).toMatchObject({long:true});
 expect(cameraFlight(origin,{x:2000,y:0,k:1},500,600).duration).toBe(600);
});
