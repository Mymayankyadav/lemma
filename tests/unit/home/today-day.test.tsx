import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {publishAuth} from '../../../src/data/authBoundary';
import {useTodayDay} from '../../../src/features/home/v7/useTodayDay';

const fake=vi.hoisted(()=>({blocks:vi.fn(),entries:vi.fn(),plans:vi.fn()}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({listCalendarBlocks:fake.blocks,listStudyEntries:fake.entries})}));
vi.mock('../../../src/data/day-plans',()=>({getDayPlanApi:()=>({listPlans:fake.plans})}));
vi.mock('../../../src/data',()=>({getApi:()=>({getInsightData:async()=>({reviews:[]})})}));
vi.mock('../../../src/features/planner/readTasks',()=>({readTasks:async()=>[]}));
vi.mock('../../../src/features/calendar/deadlines/load',()=>({loadCalendarDues:async()=>({deadlines:[],topics:[]})}));

function Today({day,zone='UTC'}:{day:string;zone?:string}){
 const {data}=useTodayDay(day,zone,true);
 return <p>{data?data.closed?'Closed':'Open':'Loading'}</p>;
}

describe('V7 Today day cache',()=>{
 let client:QueryClient,root:ReturnType<typeof createRoot>,host:HTMLDivElement;
 const wait=async(check:()=>void)=>vi.waitFor(async()=>{await act(async()=>{});check();});
 async function mount(day:string|null,zone?:string){
  await act(async()=>{root.render(<QueryClientProvider client={client}>
   {day&&<Today day={day} zone={zone}/>}
  </QueryClientProvider>);});
 }
 beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  publishAuth({id:'first-owner'});
  fake.blocks.mockReset().mockResolvedValue([]);
  fake.entries.mockReset().mockResolvedValue([]);
  fake.plans.mockReset().mockResolvedValue({items:[{id:'closed',planDate:'2026-11-25',status:'closed'}],total:1,nextCursor:null});
  client=new QueryClient({defaultOptions:{queries:{networkMode:'always'}}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
 });
 afterEach(()=>{
  act(()=>root.unmount());host.remove();client.clear();vi.unstubAllGlobals();
 });
 it('keeps the day visible during a revisit refresh and reads neither plan items nor another calendar copy',async()=>{
  await mount('2026-11-25');
  await wait(()=>expect(host.textContent).toBe('Closed'));
  expect(fake.blocks).toHaveBeenCalledOnce();
  expect(fake.plans).toHaveBeenCalledOnce();
  await mount(null);
  let finish!:()=>void;
  fake.blocks.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=()=>resolve();}).then(()=>[]));
  fake.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  await mount('2026-11-25');
  expect(host.textContent).toBe('Closed');
  expect(fake.blocks).toHaveBeenCalledTimes(2);
  finish();
  await wait(()=>expect(host.textContent).toBe('Open'));
  await act(async()=>{await client.invalidateQueries({queryKey:['home']});});
  expect(fake.blocks).toHaveBeenCalledTimes(3);
 });
 it('does not carry a saved day through a timezone, date or account change',async()=>{
  await mount('2026-11-25');
  await wait(()=>expect(host.textContent).toBe('Closed'));
  fake.blocks.mockImplementation(()=>new Promise(()=>{}));
  await mount('2026-11-25','Europe/Paris');
  expect(host.textContent).toBe('Loading');
  await mount('2026-11-26');
  expect(host.textContent).toBe('Loading');
  await act(async()=>{publishAuth({id:'second-owner'});});
  await mount('2026-11-25');
  expect(host.textContent).toBe('Loading');
 });
});
