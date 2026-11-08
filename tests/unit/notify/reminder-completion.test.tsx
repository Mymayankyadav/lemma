import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {nextReminderTime} from '../../../src/data/notify';
import {useReviewSession,type Answer} from '../../../src/features/review-run/store';
import Page from '../../../src/features/review-done/Page';

const fake=vi.hoisted(()=>({
 enabled:true,
 prefs:{enabled:true,mode:'daily' as const},
 settings:{notify:{enabled:true,mode:'daily' as const},timeZone:'UTC'},
 preview:vi.fn(),
 forecast:vi.fn(),
}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>fake.enabled}));
vi.mock('../../../src/data/hooks',()=>({useSettings:()=>({data:fake.settings})}));
vi.mock('../../../src/data',()=>({getApi:()=>({previewNotifications:fake.preview,getReviewForecast:fake.forecast})}));
vi.mock('../../../src/ui/useCalm',()=>({useCalm:()=>true,isCalm:()=>true}));
vi.mock('../../../src/features/review-done/RoundSeal',()=>({RoundSeal:()=>null}));

const now=Date.UTC(2026,10,6,12);
const valid={at:'2026-11-07T09:00:00Z',kind:'due',title:'Due reviews',reason:'due',held:false};
const later={...valid,at:'2026-11-08T09:00:00Z',title:'Later'};
const answer={
 card:{cardId:'card1',noteNo:1,projectSlug:'demo',state:{state:{state:2}}},
 reviewId:1,rating:3,confidence:'sure',durationMs:5000,
 next:{state:2},answeredAt:now,queueBefore:{} as never,
 pendingBefore:[],orderBefore:['card1']
} as unknown as Answer;
let root:Root, host:HTMLDivElement;
async function render(){
 await act(async()=>root.render(<MemoryRouter initialEntries={['/review/done']}>
  <Routes>
   <Route path="/review/done" element={<Page/>}/>
   <Route path="/" element={<p data-home>Home after review</p>}/>
  </Routes>
 </MemoryRouter>));
}
beforeEach(()=>{
 // S0 #1224: the server reminder preview fixture is pinned to Nov 2026.
 // Mock only Date.now; fake timers would stall React/vi.waitFor polling.
 vi.spyOn(Date,'now').mockReturnValue(now);
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 fake.enabled=true;fake.prefs={enabled:true,mode:'daily'};fake.settings.notify=fake.prefs;
 fake.preview.mockReset().mockResolvedValue([later,valid]);
 fake.forecast.mockReset().mockResolvedValue([{due:0},{due:1}]);
 useReviewSession.setState({answers:[],current:null,queue:null,completedRound:false,reminderDriven:false,
  filter:{decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();
 vi.restoreAllMocks();
});
describe('N6.3 next reminder offer',()=>{
 it('uses the owner-projected next future time, never a fabricated local study clock',()=>{
  expect(nextReminderTime(fake.prefs,[later,valid],now)).toBe(valid.at);
  expect(nextReminderTime(fake.prefs,[{...valid,held:true},later],now)).toBe(later.at);
  expect(nextReminderTime(fake.prefs,[{...valid,at:'bad'}],now)).toBeNull();
  expect(nextReminderTime(fake.prefs,[{...valid,at:'2026-11-06T08:00:00Z'}],now)).toBeNull();
 });
 it('uses a fixed test time for the default owner reminder projection',()=>{
  // A default clock read must not depend on CI's wall date (Nov 8 or later).
  expect(Date.now()).toBe(now);
  expect(nextReminderTime(fake.prefs,[later,valid])).toBe(valid.at);
 });
 it('suppresses the offer for disabled, missing or unavailable scheduling data',()=>{
  expect(nextReminderTime({enabled:false,mode:'daily'},[valid],now)).toBeNull();
  expect(nextReminderTime({enabled:true,mode:'off'},[valid],now)).toBeNull();
  expect(nextReminderTime({enabled:true},[valid],now)).toBeNull();
  expect(nextReminderTime(fake.prefs,null,now)).toBeNull();
 });
 it('records reminder origin only while a round is active and clears on close',()=>{
  useReviewSession.getState().markReminderDriven();
  expect(useReviewSession.getState().reminderDriven).toBe(false);
  useReviewSession.setState({queue:{} as never});
  useReviewSession.getState().markReminderDriven();
  expect(useReviewSession.getState().reminderDriven).toBe(true);
  useReviewSession.getState().close();
  expect(useReviewSession.getState().reminderDriven).toBe(false);
 });
 it('offers a real preview time only after a reminder-driven completed round; Done navigates home',async()=>{
  useReviewSession.setState({answers:[answer],completedRound:true,reminderDriven:true});
  await render();
  await vi.waitFor(()=>expect(host.querySelector('[aria-label="Next reminder"]')).not.toBeNull());
  expect(host.textContent).toContain('From your current reminder settings.');
  expect(fake.preview).toHaveBeenCalledTimes(1);
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Done')!;
  await act(async()=>button.click());
  expect(host.querySelector('[data-home]')?.textContent).toBe('Home after review');
  expect(useReviewSession.getState().reminderDriven).toBe(false);
 });
 it('hides the offer after an ordinary round, an incomplete round and with the flag off',async()=>{
  useReviewSession.setState({answers:[answer],completedRound:true,reminderDriven:false});
  await render();
  expect(host.querySelector('[aria-label="Next reminder"]')).toBeNull();
  expect(fake.preview).not.toHaveBeenCalled();
  useReviewSession.setState({reminderDriven:true,answers:[]});
  await act(async()=>{});
  expect(host.querySelector('[aria-label="Next reminder"]')).toBeNull();
  useReviewSession.setState({answers:[answer],current:{cardId:'still-reviewing'} as never});
  await act(async()=>{});
  expect(host.querySelector('[aria-label="Next reminder"]')).toBeNull();
  fake.enabled=false;
  useReviewSession.setState({current:null});
  await act(async()=>{});
  expect(host.querySelector('[aria-label="Next reminder"]')).toBeNull();
 });
 it('does not offer an unavailable preview and preserves ordinary completion',async()=>{
  fake.preview.mockRejectedValueOnce(new Error('unavailable'));
  useReviewSession.setState({answers:[answer],completedRound:true,reminderDriven:true});
  await render();
  await vi.waitFor(()=>expect(fake.preview).toHaveBeenCalledTimes(1));
  expect(host.querySelector('[aria-label="Next reminder"]')).toBeNull();
  expect(host.textContent).toContain('Done');
 });
});
