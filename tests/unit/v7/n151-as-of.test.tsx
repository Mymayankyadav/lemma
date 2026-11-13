import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {savedCopyAt,useOnline} from '../../../src/ui/v7/savedCopy';
import {AsOf,asOfTime} from '../../../src/ui/v7/AsOf';
import {getApi} from '../../../src/data';
import {getStudyApi} from '../../../src/data/study';
import ReviewHubV7 from '../../../src/features/review/v7/ReviewHubV7';
import V7Today from '../../../src/features/home/v7/V7Today';

// N151 · AN3 "Offline made visible": "as of HH:MM" beside Today's and the Review hub's numbers when they come from the
// saved copy rather than the server.
const at=Date.UTC(2026,10,13,14,5);
const fresh={data:{n:1},dataUpdatedAt:at+60_000,fetchStatus:'idle',isError:false};

describe('N151 when numbers come from the saved copy',()=>{
 it('fresh numbers online show nothing',()=>{
  expect(savedCopyAt([fresh,fresh],true)).toBeNull();
  expect(savedCopyAt([],false)).toBeNull();
 });
 it('offline, a paused refresh, or a failed refresh with older numbers on screen gives the oldest time',()=>{
  const older={...fresh,dataUpdatedAt:at};
  expect(savedCopyAt([fresh,older],false)).toBe(at);
  expect(savedCopyAt([fresh,{...older,fetchStatus:'paused'}],true)).toBe(at);
  expect(savedCopyAt([{...older,isError:true},fresh],true)).toBe(at);
  expect(savedCopyAt([{...fresh,fetchStatus:'fetching'}],true)).toBeNull();
 });
 it('a source with nothing on screen is not a saved copy',()=>{
  expect(savedCopyAt([{data:undefined,dataUpdatedAt:0,fetchStatus:'paused',isError:true}],false)).toBeNull();
  expect(savedCopyAt([{data:null,dataUpdatedAt:at,isError:true}],true)).toBeNull();
  expect(savedCopyAt([{data:{},dataUpdatedAt:0,isError:true}],true)).toBeNull();
 });
});

describe('N151 the "as of" chip',()=>{
 it('reads "as of HH:MM" in the learner\'s time zone, as a status with the full sentence for screen readers',()=>{
  expect(asOfTime(at,'UTC')).toBe('14:05');
  expect(asOfTime(at,'Asia/Kolkata')).toBe('19:35');
  expect(asOfTime(at,'Not/AZone')).toMatch(/^\d\d:\d\d$/);
  const html=renderToStaticMarkup(<AsOf at={at} zone="UTC"/>);
  expect(html).toContain('role="status"');
  expect(html).toContain('data-kind="saved"');
  expect(html).toContain('<span class="v7-sr-only">Working from your notebook · </span>as of 14:05');
  expect(renderToStaticMarkup(<AsOf at={null}/>)).toBe('');
 });
});

let root:Root|null=null,host:HTMLElement|null=null;
async function mount(node:ReactNode){
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root!.render(node));
}
async function settle(check:()=>boolean,label:string){
 for(let i=0;i<400&&!check();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 if(!check())throw Error('Timed out waiting for '+label+':\n'+host?.textContent);
}
function setOnline(value:boolean){
 Object.defineProperty(window.navigator,'onLine',{configurable:true,get:()=>value});
 window.dispatchEvent(new Event(value?'online':'offline'));
}
afterEach(async()=>{
 if(root)await act(async()=>root!.unmount());
 host?.remove();root=null;host=null;
 vi.restoreAllMocks();vi.useRealTimers();
 Object.defineProperty(window.navigator,'onLine',{configurable:true,get:()=>true});
});
// The screens read the small fixed demo fixture (as `?demo=1` does in the app).
beforeAll(()=>{window.scrollTo=()=>{};sessionStorage.setItem('lemma.demo','1');});

describe('N151 useOnline follows the browser',()=>{
 it('turns false on offline and true on online',async()=>{
  const seen:boolean[]=[];
  function Probe(){seen.push(useOnline());return null;}
  await mount(<Probe/>);
  await act(async()=>setOnline(false));
  await act(async()=>setOnline(true));
  expect(seen.at(0)).toBe(true);
  expect(seen).toContain(false);
  expect(seen.at(-1)).toBe(true);
 });
});

const client=()=>new QueryClient({defaultOptions:{queries:{retry:false}}});
// The screens' own copy says "in 1 h 17 min": a fixed clock (timers stay real) keeps it the same between two mounts.
const pinClock=()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-13T09:00:00+05:30'));};
const SCREEN_MS=20_000;
const chip=()=>host?.querySelector('.v7-as-of')??null;

describe('N151 the Review hub',()=>{
 beforeEach(pinClock);
 it('a failed refresh keeps the numbers and says "as of", instead of the load error',async()=>{
  const queries=client();
  await mount(<QueryClientProvider client={queries}><MemoryRouter initialEntries={['/review']}><ReviewHubV7/></MemoryRouter></QueryClientProvider>);
  await settle(()=>!!host?.querySelector('[aria-label="Cards in this round"]'),'the hub');
  const count=host!.querySelector('[aria-label="Cards in this round"]')!.textContent;
  expect(chip()).toBeNull();
  const savedAt=queries.getQueryState(['decks'])!.dataUpdatedAt;
  vi.spyOn(getApi(),'getDeckTree').mockRejectedValue(new Error('network down'));
  await act(async()=>{await queries.refetchQueries({queryKey:['decks']});});
  await settle(()=>!!chip(),'the "as of" chip');
  expect(host!.querySelector('[role="alert"]')).toBeNull();
  expect(host!.querySelector('[aria-label="Cards in this round"]')!.textContent).toBe(count);
  const zone=queries.getQueryData<{timeZone:string}>(['settings'])!.timeZone;
  expect(chip()!.textContent).toBe('Working from your notebook · as of '+asOfTime(savedAt,zone));
 },SCREEN_MS);
 it('offline, the hub shows "as of"; back online it goes',async()=>{
  const queries=client();
  await mount(<QueryClientProvider client={queries}><MemoryRouter initialEntries={['/review']}><ReviewHubV7/></MemoryRouter></QueryClientProvider>);
  await settle(()=>!!host?.querySelector('[aria-label="Cards in this round"]'),'the hub');
  await act(async()=>setOnline(false));
  expect(chip()?.textContent).toMatch(/as of \d\d:\d\d$/);
  await act(async()=>setOnline(true));
  expect(chip()).toBeNull();
 },SCREEN_MS);
});

describe('N151 Today',()=>{
 beforeEach(pinClock);
 it('when the day cannot load, Today shows the saved copy of the day with "as of"',async()=>{
  const first=client();
  await mount(<QueryClientProvider client={first}><MemoryRouter><V7Today/></MemoryRouter></QueryClientProvider>);
  await settle(()=>!!host?.querySelector('.v7-today-hero'),'Today');
  expect(chip()).toBeNull();
  const briefing=host!.querySelector('.v7-today-briefing')!.textContent;
  await act(async()=>root!.unmount());host!.remove();root=null;
  vi.spyOn(getStudyApi(),'listCalendarBlocks').mockRejectedValue(new Error('network down'));
  await mount(<QueryClientProvider client={first}><MemoryRouter><V7Today/></MemoryRouter></QueryClientProvider>);
  await settle(()=>!!chip(),'the "as of" chip');
  expect(host!.querySelector('.v7-today-hero')).not.toBeNull();
  expect(host!.textContent).not.toContain("Couldn't load Today");
  expect(host!.querySelector('.v7-today-briefing')!.textContent).toContain(briefing!.trim());
  expect(chip()!.textContent).toMatch(/^Working from your notebook · as of \d\d:\d\d$/);
 },SCREEN_MS);
 it('offline, Today shows "as of" beside the briefing; back online it goes',async()=>{
  await mount(<QueryClientProvider client={client()}><MemoryRouter><V7Today/></MemoryRouter></QueryClientProvider>);
  await settle(()=>!!host?.querySelector('.v7-today-hero'),'Today');
  await act(async()=>setOnline(false));
  expect(host!.querySelector('.v7-today-briefing .v7-as-of')?.textContent).toMatch(/as of \d\d:\d\d$/);
  await act(async()=>setOnline(true));
  await settle(()=>!chip(),'the chip to go');
 },SCREEN_MS);
});
