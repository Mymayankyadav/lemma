import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
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
});

describe('one-time reminder navigation',()=>{
 it('continues the one RPC request after settings refresh and never consumes twice',async()=>{
  let finish!:(value:unknown)=>void;
  mocks.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
  await act(async()=>{root.render(<Probe value={settings}/>);});
  expect(mocks.navigate).toHaveBeenCalledWith('/review',{replace:true});
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await act(async()=>{root.render(<Probe value={{...settings,reviewsPerDay:3}}/>);});
  await act(async()=>{finish([{cardId:'one'},{cardId:'two'}]);});
  expect(mocks.initialize).toHaveBeenCalledTimes(1);
  expect(mocks.initialize.mock.calls[0][1].reviewsPerDay).toBe(50);
  expect(mocks.navigate).toHaveBeenCalledWith('/review/run?reminder=1');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
 });
 it('shows an empty queue message without starting a round',async()=>{
  mocks.fetch.mockResolvedValue([]);
  await act(async()=>{root.render(<Probe value={settings}/>);});
  expect(host.textContent).toContain('No cards are due');
  expect(mocks.initialize).not.toHaveBeenCalled();
 });
 it('shows a failed read without starting an ordinary round',async()=>{
  mocks.fetch.mockRejectedValue(new Error('network'));
  await act(async()=>{root.render(<Probe value={settings}/>);});
  expect(host.textContent).toContain('Could not load reminder cards');
  expect(mocks.initialize).not.toHaveBeenCalled();
 });
});
