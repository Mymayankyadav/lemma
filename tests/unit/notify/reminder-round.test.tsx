import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StrictMode,act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import type {Settings} from '../../../src/data/types';
import {useReminderRound} from '../../../src/features/review/reminder-round';

const mocks=vi.hoisted(()=>({
 navigate:vi.fn(),fetch:vi.fn(),initialize:vi.fn(),getReviewItems:vi.fn(),
}));
vi.mock('react-router',()=>({useNavigate:()=>mocks.navigate}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>true}));
vi.mock('../../../src/data',()=>({getApi:()=>({mode:'live',getReviewItems:mocks.getReviewItems})}));
vi.mock('../../../src/data/notify',()=>({
 enabledNotificationReviewLink:()=>({count:2}),
 fetchNotificationReviewItems:mocks.fetch,
}));
vi.mock('../../../src/features/review-run/store',()=>({
 useReviewSession:{getState:()=>({initialize:mocks.initialize})},
}));

const settings={reviewsPerDay:1,newPerDay:1} as Settings;
let root:Root;
let host:HTMLDivElement;
function Probe({value}:{value:Settings}) {
 const state=useReminderRound(value);
 return <div>{state.loading?'loading':state.error??'idle'}</div>;
}
beforeEach(()=>{
 vi.clearAllMocks();
 host=document.createElement('div');
 document.body.append(host);
 root=createRoot(host);
});
afterEach(()=>{
 act(()=>root.unmount());
 host.remove();
 vi.restoreAllMocks();
});

describe('one-time reminder navigation under React StrictMode',()=>{
 it('shares one delayed RPC across effect replay and settings refresh, initializing once without saving quotas',async()=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');
  let finish!:(value:unknown)=>void;
  mocks.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
  await act(async()=>{root.render(<StrictMode><Probe value={settings}/></StrictMode>);});
  expect(host.textContent).toContain('loading');
  expect(mocks.navigate).toHaveBeenCalledWith('/review',{replace:true});
  expect(mocks.navigate).toHaveBeenCalledTimes(1);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await act(async()=>{root.render(<StrictMode><Probe value={{...settings,reviewsPerDay:3}}/></StrictMode>);});
  await act(async()=>{finish([{cardId:'one'},{cardId:'two'}]);});
  expect(mocks.initialize).toHaveBeenCalledTimes(1);
  expect(mocks.initialize.mock.calls[0][1]).toMatchObject({reviewsPerDay:50,newPerDay:50});
  expect(mocks.navigate).toHaveBeenCalledWith('/review/run?reminder=1');
  expect(mocks.navigate).toHaveBeenCalledTimes(2);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.getReviewItems).not.toHaveBeenCalled();
  expect(settings.reviewsPerDay).toBe(1);
  expect(settings.newPerDay).toBe(1);
  expect(persist).not.toHaveBeenCalled();
 });
 it('shows an empty queue after StrictMode replay without initiating or persisting a round',async()=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');
  mocks.fetch.mockResolvedValue([]);
  await act(async()=>{root.render(<StrictMode><Probe value={settings}/></StrictMode>);});
  expect(host.textContent).toContain('No cards are due');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledTimes(1);
  expect(mocks.navigate).toHaveBeenCalledWith('/review',{replace:true});
  expect(persist).not.toHaveBeenCalled();
 });
 it('shows an RPC failure after StrictMode replay without starting an ordinary round',async()=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');
  mocks.fetch.mockRejectedValue(new Error('network'));
  await act(async()=>{root.render(<StrictMode><Probe value={settings}/></StrictMode>);});
  expect(host.textContent).toContain('Could not load reminder cards');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect(mocks.getReviewItems).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledTimes(1);
  expect(persist).not.toHaveBeenCalled();
 });
});
