// @vitest-environment jsdom
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router';
import {configuredReminderOffer} from '../../../src/data/notify';
import type {NotifyPrefs,ReviewItem} from '../../../src/data/types';
import {useReviewSession,type Answer} from '../../../src/features/review-run/store';

const mocks=vi.hoisted(()=>({flag:true,settings:{notify:null as NotifyPrefs|null,timeZone:'Asia/Kolkata'},forecast:vi.fn(async()=>[])}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>mocks.flag}));
vi.mock('../../../src/data/hooks',()=>({useSettings:()=>({data:mocks.settings,isError:false})}));
vi.mock('../../../src/data',()=>({getApi:()=>({getReviewForecast:mocks.forecast})}));
vi.mock('../../../src/features/review-done/RoundSeal',()=>({RoundSeal:()=>null}));
vi.mock('../../../src/ui/useCalm',()=>({useCalm:()=>true}));

import ReviewDone from '../../../src/features/review-done/Page';

const daily:NotifyPrefs={enabled:true,mode:'daily',digest:{weekday:1,time:'19:45'}};
const weekly:NotifyPrefs={enabled:true,mode:'weekly',digest:{weekday:5,time:'08:30'}};
const answer={
 card:{cardId:'card-1',noteNo:7,projectSlug:'algebra',state:{state:2}} as ReviewItem,
 reviewId:1,rating:3,confidence:'sure',durationMs:16000,answeredAt:Date.now(),
 next:{state:2} as Answer['next'],queueBefore:{} as Answer['queueBefore'],
 pendingBefore:[],orderBefore:['card-1'],
} as Answer;
let host:HTMLDivElement,root:Root;
function Location(){const location=useLocation();return <output data-testid="location">{location.pathname}</output>}
async function mount(reminderDriven=true,answers:Answer[]=[answer]){
 useReviewSession.setState({answers,reminderDriven,current:null,completedRound:true,queue:null});
 await act(async()=>root.render(<MemoryRouter initialEntries={['/review/done']}>
  <Location/><Routes><Route path="/review/done" element={<ReviewDone/>}/><Route path="/" element={<p>Home route</p>}/></Routes>
 </MemoryRouter>));
}
beforeEach(()=>{
 vi.clearAllMocks();mocks.flag=true;mocks.settings.notify=daily;
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();
 useReviewSession.setState({answers:[],reminderDriven:false,current:null,completedRound:false,queue:null});
});
describe('N6.3 configured reminder-time offer',()=>{
 it('uses only validated current notification settings, never a fabricated default',()=>{
  expect(configuredReminderOffer(daily)).toEqual({label:'Daily digest time',time:'19:45'});
  expect(configuredReminderOffer(weekly)).toEqual({label:'Weekly digest · Friday',time:'08:30'});
  expect(configuredReminderOffer({enabled:true,mode:'live',studyTime:'20:15'}))
   .toEqual({label:'Configured study-time window',time:'20:15'});
  expect(configuredReminderOffer({enabled:true,mode:'live',studyTime:'20:15',kinds:{due:false}})).toBeNull();
  for(const prefs of [null,undefined,{enabled:false,mode:'daily',digest:{weekday:0,time:'09:00'}},
    {enabled:true,mode:'off',studyTime:'08:00'},{enabled:true,mode:'daily'},
    {enabled:true,mode:'weekly',digest:{weekday:8,time:'08:00'}},
    {enabled:true,mode:'daily',digest:{weekday:1,time:'25:00'}},
    {enabled:true,mode:'live',studyTime:'tomorrow morning'}] as (NotifyPrefs|null|undefined)[])
   expect(configuredReminderOffer(prefs)).toBeNull();
 });
 it('only offers the configured time after a finished reminder-origin Review',async()=>{
  await mount();
  const offer=host.querySelector('[aria-label="Next reminder time"]');
  expect(offer).not.toBeNull();
  expect(offer?.textContent).toContain('19:45');
  expect(offer?.textContent).toContain('Delivery depends on what is due');
  expect(offer?.textContent).toContain('See reminder settings');
  expect(host.querySelector('[aria-label="Review statistics"]')).not.toBeNull();
  expect(mocks.forecast).toHaveBeenCalledTimes(1);
 });
 it('does not offer anything in an ordinary Review or with the flag off',async()=>{
  await mount(false);
  expect(host.querySelector('[aria-label="Next reminder time"]')).toBeNull();
  await act(async()=>root.unmount());
  root=createRoot(host);
  mocks.flag=false;
  await mount(true);
  expect(host.querySelector('[aria-label="Next reminder time"]')).toBeNull();
 });
 it('hides the offer when reminder scheduling data is absent or the round has no answers',async()=>{
  mocks.settings.notify=null;
  await mount();
  expect(host.querySelector('[aria-label="Next reminder time"]')).toBeNull();
  await act(async()=>root.unmount());
  root=createRoot(host);
  mocks.settings.notify=daily;
  await mount(true,[]);
  expect(host.querySelector('[aria-label="Next reminder time"]')).toBeNull();
 });
 it('retains original finishing navigation and clears reminder origin on Done',async()=>{
  await mount();
  const done=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Done');
  expect(done).toBeDefined();
  await act(async()=>done!.click());
  expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/');
  expect(host.textContent).toContain('Home route');
  expect(useReviewSession.getState().reminderDriven).toBe(false);
 });
 it('does not set reminder origin for a nonexistent queue and clears it on initialize',()=>{
  const state=useReviewSession.getState();
  state.close();
  state.markReminderDriven();
  expect(useReviewSession.getState().reminderDriven).toBe(false);
  useReviewSession.setState({queue:{} as Answer['queueBefore']});
  state.markReminderDriven();
  expect(useReviewSession.getState().reminderDriven).toBe(true);
  state.initialize([],{reviewsPerDay:10,newPerDay:10,learnAheadMinutes:0,rolloverHour:4,timeZone:'UTC',mixDecks:false} as Parameters<typeof state.initialize>[1],
   {decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false});
  expect(useReviewSession.getState().reminderDriven).toBe(false);
 });
});
