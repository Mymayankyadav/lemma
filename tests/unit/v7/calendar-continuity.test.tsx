import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setSurfaceBeta} from '../../../src/app/surfaceBeta';
import type {CalendarBlockRecord,StudyApi} from '../../../src/data/study/contract';
import V7CalendarDay from '../../../src/features/calendar/v7/V7CalendarDay';

const api=vi.hoisted(()=>({listCalendarBlocks:vi.fn(),updateCalendarBlock:vi.fn(),notify:vi.fn()}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({mode:'demo',listStudyEntries:async()=>[],...api})}));
vi.mock('../../../src/data/hooks',()=>({useHome:()=>({data:{projects:[]}}),useSettings:()=>({data:{timeZone:'UTC'}})}));
vi.mock('../../../src/data/adaptive/atlas-api',()=>({useAtlasModel:()=>({data:null})}));
vi.mock('../../../src/app/v7/V7Shell',()=>({HubHeader:()=>null}));
vi.mock('../../../src/features/calendar/v7/overdue',()=>({useOverdueSummary:()=>({total:0})}));
vi.mock('../../../src/features/calendar/deadlines/load',()=>({loadCalendarDues:async()=>({deadlines:[],topics:[]})}));
vi.mock('../../../src/features/calendar/block-sheet/BlockSheetActions',()=>({default:()=>null}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>api.notify}));

const block:CalendarBlockRecord={id:'test-block',title:'Reading',kind:'study',status:'planned',version:1,
 startsAt:'2000-01-03T09:00:00.000Z',endsAt:'2000-01-03T10:00:00.000Z',timeZone:'UTC'};
let root:Root,host:HTMLDivElement,queries:QueryClient;
beforeEach(()=>{
 setSurfaceBeta(true);vi.clearAllMocks();api.listCalendarBlocks.mockResolvedValue([block]);
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.body.appendChild(document.createElement('div'));
 root=createRoot(host);queries=new QueryClient({defaultOptions:{queries:{gcTime:0}}});
});
afterEach(async()=>{vi.useRealTimers();await act(async()=>root.unmount());queries.clear();host.remove();setSurfaceBeta(false);});

it('holds a moved block at its new time until a delayed rejection, then restores it and retries',async()=>{
 let fail!: (reason:Error)=>void;
 const pending=new Promise<Awaited<ReturnType<StudyApi['updateCalendarBlock']>>>((_,reject)=>{fail=reject;});
 api.updateCalendarBlock.mockReturnValueOnce(pending);
 await act(async()=>root.render(<QueryClientProvider client={queries}>
  <MemoryRouter initialEntries={['/calendar?view=day&date=2000-01-03']}><V7CalendarDay/></MemoryRouter>
 </QueryClientProvider>));
 const active=()=>host.querySelector<HTMLButtonElement>('[data-calendar-block="test-block"]');
 await vi.waitFor(()=>expect(active()).not.toBeNull());
 const adjust=()=>active()?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));
 await act(async()=>{adjust();adjust();});
 expect(api.updateCalendarBlock).toHaveBeenCalledTimes(1);
 expect(active()?.getAttribute('aria-label')).toContain('09:15');
 expect(active()?.getAttribute('aria-busy')).toBe('true');
 await act(async()=>{fail(Error('Connection interrupted'));});
 expect(active()?.getAttribute('aria-label')).toContain('09:00');
 expect(active()?.hasAttribute('aria-busy')).toBe(false);
 const options=api.notify.mock.calls.find(([text])=>text==='Could not move the block.')?.[1];
 expect(options.action.label).toBe('Retry');
 const moved={...block,startsAt:'2000-01-03T09:15:00.000Z',endsAt:'2000-01-03T10:15:00.000Z',version:2};
 api.updateCalendarBlock.mockResolvedValueOnce({record:moved,actionNo:null});
 api.listCalendarBlocks.mockResolvedValue([moved]);
 await act(async()=>{await options.action.onClick();});
 expect(active()?.getAttribute('aria-label')).toContain('09:15');
 expect(api.updateCalendarBlock).toHaveBeenCalledTimes(2);
});

it.each([0,250,750,2000])('keeps a pointer drop pending at %i ms latency and animates its rollback',async latency=>{
 api.updateCalendarBlock.mockImplementationOnce(()=>new Promise((_,reject)=>setTimeout(()=>reject(Error('Offline')),latency)));
 await act(async()=>root.render(<QueryClientProvider client={queries}>
  <MemoryRouter initialEntries={['/calendar?view=day&date=2000-01-03']}><V7CalendarDay/></MemoryRouter>
 </QueryClientProvider>));
 const active=()=>host.querySelector<HTMLButtonElement>('[data-calendar-block="test-block"]');
 await vi.waitFor(()=>expect(active()).not.toBeNull());
 const animate=vi.fn();
 Object.defineProperty(active()!.parentElement,'animate',{value:animate,configurable:true});
 const original=Object.getOwnPropertyDescriptor(document,'elementFromPoint');
 Object.defineProperty(document,'elementFromPoint',{value:()=>null,configurable:true});
 vi.useFakeTimers();
 const pointer=(type:string,y:number)=>{
  const event=new MouseEvent(type,{bubbles:true,button:0,clientX:210,clientY:y});
  Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});
  active()?.dispatchEvent(event);
 };
 try{
  await act(async()=>{pointer('pointerdown',180);pointer('pointermove',196);pointer('pointerup',196);});
  expect(api.updateCalendarBlock).toHaveBeenCalledTimes(1);
  expect(active()?.getAttribute('aria-label')).toContain('09:15');
  if(latency)await act(async()=>{await vi.advanceTimersByTimeAsync(latency-1);});
  expect(active()?.getAttribute('aria-busy')).toBe('true');
  expect(active()?.getAttribute('aria-label')).toContain('09:15');
  await act(async()=>{await vi.advanceTimersByTimeAsync(latency?1:0);});
  expect(active()?.getAttribute('aria-label')).toContain('09:00');
  expect(animate).toHaveBeenCalledWith(
   [expect.objectContaining({transform:expect.stringMatching(/^translateY\(\d+px\)$/)}),expect.objectContaining({transform:'none'})],
   expect.objectContaining({duration:240}),
  );
  expect(api.notify).toHaveBeenCalledWith('Could not move the block.',expect.objectContaining({action:expect.objectContaining({label:'Retry'})}));
 }finally{
  if(original)Object.defineProperty(document,'elementFromPoint',original);
  else Reflect.deleteProperty(document,'elementFromPoint');
 }
});
