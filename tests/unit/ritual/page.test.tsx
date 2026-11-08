import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router';
import Page from '../../../src/features/ritual/Page';

const mocks=vi.hoisted(()=>({
 listPlans:vi.fn(),closePlan:vi.fn(),
 listTasks:vi.fn(),listThoughts:vi.fn(),dismissThought:vi.fn(),listStudyEntries:vi.fn(),
 zone:'Pacific/Kiritimati',
}));
vi.mock('../../../src/data/hooks',()=>({
 useSettings:()=>({data:{timeZone:mocks.zone},isPending:false}),
}));
vi.mock('../../../src/data/day-plans',()=>({
 getDayPlanApi:()=>({listPlans:mocks.listPlans,closePlan:mocks.closePlan}),
}));
vi.mock('../../../src/data/tasks',()=>({
 getTaskApi:()=>({listTasks:mocks.listTasks}),
}));
vi.mock('../../../src/data/parked-thoughts',()=>({
 getThoughtApi:()=>({listThoughts:mocks.listThoughts,dismissThought:mocks.dismissThought}),
}));
vi.mock('../../../src/data/study',()=>({
 getStudyApi:()=>({listStudyEntries:mocks.listStudyEntries}),
}));
const base={
 id:'11111111-1111-4111-8111-111111111111',
 planDate:'2026-11-08',timeZone:'Pacific/Kiritimati',
 intention:'Prove the theorem',capacityMinutes:45,
 availability:{sources:[]},status:'committed',closedAt:null,
 tomorrowFirstTaskId:null,ritual:{},version:3,
 createdAt:'2026-11-07T10:00:00Z',updatedAt:'2026-11-07T10:00:00Z',
};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date('2026-11-07T12:30:00Z'));
 mocks.zone='Pacific/Kiritimati';
 mocks.listPlans.mockReset().mockResolvedValue({
  items:[base],total:1,nextCursor:null});
 mocks.closePlan.mockReset().mockResolvedValue({record:{...base,status:'closed'},actionNo:9});
 mocks.listTasks.mockReset().mockResolvedValue({items:[],total:0,nextCursor:null});
 mocks.listThoughts.mockReset().mockResolvedValue({items:[],total:0,nextCursor:null});
 mocks.dismissThought.mockReset().mockResolvedValue({record:{},actionNo:4});
 mocks.listStudyEntries.mockReset().mockResolvedValue([]);
 host=document.createElement('div');document.body.append(host);
 root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();vi.useRealTimers();
});
async function render(date:string){
 await act(async()=>root.render(<MemoryRouter initialEntries={[
  '/today/close?date='+date,
 ]}><Routes><Route path="/today/close" element={<Page/>}/></Routes></MemoryRouter>));
 await vi.waitFor(()=>expect(host.textContent).toContain('What you saved today'));
}
describe('N69 owner-zone ritual view and command',()=>{
 it('allows a day already reached in the owner zone, not the device UTC day',async()=>{
  await render('2026-11-08');
  const close=[...host.querySelectorAll('button')]
   .find(b=>b.textContent?.trim()==='Close 2026-11-08');
  expect(close).toBeDefined();expect(close?.disabled).toBe(false);
  await act(async()=>close?.click());
  expect(mocks.closePlan).toHaveBeenCalledWith(base.id,3,{
   carryOverTaskIds:[],tomorrowFirstTaskId:null,
  });
 });
 it('refuses a future date even with an otherwise committed plan',async()=>{
  mocks.listPlans.mockResolvedValueOnce({items:[{...base,planDate:'2026-11-09'}],total:1,nextCursor:null});
  await render('2026-11-09');
  const close=[...host.querySelectorAll('button')]
   .find(b=>b.textContent?.trim()==='Close 2026-11-09');
  expect(close?.disabled).toBe(true);
  expect(mocks.closePlan).not.toHaveBeenCalled();
 });
 it('rejects an invalid civil date without issuing a close RPC',async()=>{
  await act(async()=>root.render(<MemoryRouter initialEntries={[
   '/today/close?date=2026-02-30',
  ]}><Routes><Route path="/today/close" element={<Page/>}/></Routes></MemoryRouter>));
  expect(host.textContent).toContain('Choose a real YYYY-MM-DD date');
  expect(mocks.closePlan).not.toHaveBeenCalled();
 });
 it('blocks closure until thoughts are resolved and persists explicit carry-over choices',async()=>{
  const task={id:'task-1',title:'Read a lemma',version:2,status:'backlog'};
  const thought={id:'thought-1',text:'Try a proof',version:3,status:'open'};
  mocks.listTasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  mocks.listThoughts.mockResolvedValueOnce({items:[thought],total:1,nextCursor:null})
   .mockResolvedValue({items:[],total:0,nextCursor:null});
  await render('2026-11-08');
  const findClose=()=>[...host.querySelectorAll<HTMLButtonElement>('button')]
   .find(b=>b.textContent?.trim()==='Close 2026-11-08');
  expect(findClose()?.disabled).toBe(true);
  const dismiss=[...host.querySelectorAll<HTMLButtonElement>('button')]
   .find(b=>b.textContent?.trim()==='Dismiss');
  await act(async()=>dismiss?.click());
  expect(mocks.dismissThought).toHaveBeenCalledWith(thought.id,3);
  await vi.waitFor(()=>expect(findClose()?.disabled).toBe(false));
  const carry=host.querySelector<HTMLInputElement>('input[type=checkbox]');
  await act(async()=>carry?.click());
  const nextTask=host.querySelector<HTMLSelectElement>('select');
  await act(async()=>{
   if(nextTask){
    nextTask.value=task.id;
    nextTask.dispatchEvent(new Event('change',{bubbles:true}));
   }
  });
  await act(async()=>findClose()?.click());
  expect(mocks.closePlan).toHaveBeenCalledWith(base.id,3,{
   carryOverTaskIds:[task.id],tomorrowFirstTaskId:task.id,
  });
 });

});
