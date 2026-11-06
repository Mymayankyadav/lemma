import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import {getDayPlanApi,setDayPlanApiForTests} from '../../../src/data/day-plans';
import type {NewDayPlan} from '../../../src/data/day-plans/contract';
const key='lemma.v6.demo.day-plans.v1';
const input=(day:string):NewDayPlan=>({
 planDate:day,timeZone:'Asia/Kolkata',intention:'Proof work',capacityMinutes:75,
 availability:{windows:[{start:day+'T08:00:00+05:30',end:day+'T10:00:00+05:30'}],sources:[]},
 items:[],
 ritual:{choice:'focus',completedSteps:[],reflection:null},
});
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))});
afterEach(()=>{setDayPlanApiForTests(null);vi.useRealTimers();sessionStorage.clear()});
describe('N60 demo dated day plans and closures',()=>{
 it('loads owned civil-day plans with distinct preview, draft and yesterday closure',async()=>{
  const api=createDemoDayPlanApi();
  const all=await api.listDayPlans();
  expect(all).toMatchObject({total:3,nextCursor:null});
  expect(all.items.map(x=>[x.planDate,x.status])).toEqual([
   ['2026-11-05','closed'],['2026-11-06','previewed'],['2026-11-07','draft']
  ]);
  expect(all.items[0].items[0]).toMatchObject({disposition:'carried_over',
   reason:'Available time ended',taskId:'demo-task-2',calendarBlockId:null});
  expect((await api.listDayPlans({status:'closed'})).total).toBe(1);
  expect((await api.listDayPlans({fromDate:'2026-11-07'})).total).toBe(1);
  expect(sessionStorage.getItem(key)).toContain('demo-day-yesterday');
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
 });

 it('creates on an exact civil date and refuses another plan for the date in any zone',async()=>{
  const api=createDemoDayPlanApi();
  const made=await api.createDayPlan(input('2026-11-08'));
  expect(made).toMatchObject({actionNo:null,record:{planDate:'2026-11-08',
   timeZone:'Asia/Kolkata',status:'draft',closedAt:null,version:1,capacityMinutes:75}});
  await expect(api.createDayPlan({...input('2026-11-08'),timeZone:'UTC'}))
   .rejects.toMatchObject({code:'conflict'});
  const loaded=await createDemoDayPlanApi().getDayPlan(made.record.id);
  expect(loaded).toMatchObject({intention:'Proof work',items:[],version:1});
  made.record.intention='Tampered';
  expect((await api.getDayPlan(made.record.id))?.intention).toBe('Proof work');
  expect(await api.getDayPlan('unknown')).toBeNull();
 });

 it('has bounded ordered pages, exact counts and filter-bound opaque cursors after 60 writes',async()=>{
  const api=createDemoDayPlanApi();
  for(let i=0;i<60;i++){
   const day=new Date(Date.UTC(2027,0,1+i)).toISOString().slice(0,10);
   await api.createDayPlan(input(day));
  }
  let cursor:string|null=null;
  const ids:string[]=[];
  for(let n=0;n<8;n++){
   const page=await api.listDayPlans({limit:10,cursor});
   expect(page.total).toBe(63);
   expect(page.items.length).toBeLessThanOrEqual(10);
   ids.push(...page.items.map(p=>p.id));
   cursor=page.nextCursor;
   if(cursor===null)break;
  }
  expect(ids).toHaveLength(63);
  expect(new Set(ids).size).toBe(63);
  expect(ids[0]).toBe('demo-day-yesterday');
  const first=await api.listDayPlans({limit:1});
  await expect(api.listDayPlans({limit:1,status:'closed',cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({limit:1,fromDate:'2027-01-01',cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
 });

 it('captures task/block versions at preview and refuses a stale source at commit',async()=>{
  let taskVersion=1;
  const api=createDemoDayPlanApi({getSourceVersion:(kind,sourceId)=>
   kind==='task'&&sourceId==='demo-task-1'?taskVersion:
   kind==='calendar_block'&&sourceId==='demo-block-1'?1:null});
  const preview=(await api.getDayPlan('demo-day-today'))!;
  taskVersion=2;
  await expect(api.commitDayPlan(preview.id,preview.version))
   .rejects.toMatchObject({code:'conflict'});
  expect((await api.getDayPlan(preview.id))?.version).toBe(1);
  taskVersion=1;
  const commit=await api.commitDayPlan(preview.id,1);
  expect(commit.record).toMatchObject({status:'committed',version:2,
   planDate:'2026-11-06',closedAt:null});
  await expect(api.commitDayPlan(preview.id,2)).rejects.toMatchObject({code:'conflict'});
 });

 it('requires all placed-task and block versions, even when snapshots are otherwise valid',async()=>{
  const api=createDemoDayPlanApi();
  await api.updateDayPlan('demo-day-today',1,{
   status:'previewed',availability:{windows:[],sources:[]}
  });
  await expect(api.commitDayPlan('demo-day-today',2))
   .rejects.toMatchObject({code:'conflict'});
  expect((await api.getDayPlan('demo-day-today'))?.status).toBe('previewed');
 });

 it('closes only the chosen date; dated ritual, tomorrow intention and carry-over stay in place',async()=>{
  const api=createDemoDayPlanApi();
  await api.commitDayPlan('demo-day-today',1);
  const closure=await api.closeDayPlan('demo-day-today',2,{
   tomorrowFirstTaskId:'demo-task-3',ritual:{choice:'short',completedSteps:['review'],
    reflection:'Carry unfinished work'}
  });
  expect(closure.record).toMatchObject({planDate:'2026-11-06',status:'closed',version:3,
   tomorrowFirstTaskId:'demo-task-3',ritual:{choice:'short',reflection:'Carry unfinished work'}});
  expect(closure.record.closedAt).not.toBeNull();
  expect((await api.getDayPlan('demo-day-tomorrow'))?.status).toBe('draft');
  expect((await api.getDayPlan('demo-day-yesterday'))?.status).toBe('closed');
  const reopened=await api.reopenDayPlan('demo-day-today',3);
  expect(reopened.record).toMatchObject({status:'committed',closedAt:null,version:4,
   tomorrowFirstTaskId:'demo-task-3'});
  expect(reopened.record.items).toHaveLength(1);
  await expect(api.reopenDayPlan('demo-day-today',4))
   .rejects.toMatchObject({code:'conflict'});
 });

 it('retains unplaced and carried-over items across update, commit and closure',async()=>{
  const api=createDemoDayPlanApi();
  const changed=await api.updateDayPlan('demo-day-today',1,{
   status:'previewed',availability:{windows:[],sources:[
    {kind:'task',id:'demo-task-4',version:1},{kind:'task',id:'demo-task-5',version:1}]},
   items:[
    {taskId:'demo-task-4',calendarBlockId:null,disposition:'unplaced',reason:'No capacity',position:0},
    {taskId:'demo-task-5',calendarBlockId:null,disposition:'carried_over',reason:'Owner chose tomorrow',position:1}
   ]
  });
  expect(changed.record.items.map(x=>x.disposition)).toEqual(['unplaced','carried_over']);
  await expect(api.commitDayPlan('demo-day-today',2))
   .rejects.toMatchObject({code:'conflict'});
  // A fixture owner supplies the current authoritative versions, not user input.
  const withSource=createDemoDayPlanApi({getSourceVersion:(kind,id)=>
   kind==='task'&&['demo-task-4','demo-task-5'].includes(id)?1:null});
  await withSource.commitDayPlan('demo-day-today',2);
  await withSource.closeDayPlan('demo-day-today',3);
  const saved=await createDemoDayPlanApi().getDayPlan('demo-day-today');
  expect(saved?.items.map(x=>[x.disposition,x.reason])).toEqual([
   ['unplaced','No capacity'],['carried_over','Owner chose tomorrow']
  ]);
 });

 it('version-guards concurrent instances, and edits to a preview return it to draft',async()=>{
  const first=createDemoDayPlanApi(),second=createDemoDayPlanApi();
  const result=await first.updateDayPlan('demo-day-today',1,{intention:'Focused proof'});
  expect(result.record.version).toBe(2);
  await expect(second.updateDayPlan('demo-day-today',1,{intention:'Stale edit'}))
   .rejects.toMatchObject({code:'conflict'});
  const draft=await second.updateDayPlan('demo-day-today',2,{
   capacityMinutes:45,availability:{windows:[],sources:[]}
  });
  expect(draft.record).toMatchObject({status:'draft',capacityMinutes:45,version:3});
  await expect(second.commitDayPlan('demo-day-today',3))
   .rejects.toMatchObject({code:'conflict'});
  await expect(second.updateDayPlan('demo-day-today',3,
   {planDate:'2026-11-10'} as never)).rejects.toMatchObject({code:'invalid'});
 });

 it('rejects invalid civil dates, zones, captured versions and placements without writes',async()=>{
  const api=createDemoDayPlanApi();
  const before=await api.listDayPlans();
  for(const invalidInput of [
   {...input('2026-02-30')},
   {...input('2026-11-09'),timeZone:'Mars/Nowhere'},
   {...input('2026-11-09'),capacityMinutes:1441},
   {...input('2026-11-09'),availability:{windows:[{start:'bad',end:'bad'}],sources:[]}},
   {...input('2026-11-09'),availability:{windows:[],sources:[{kind:'task',id:'t',version:0}]}},
   {...input('2026-11-09'),items:[{taskId:'x',calendarBlockId:null,disposition:'placed',reason:null,position:0}]},
   {...input('2026-11-09'),user_id:'other-owner'},
  ])await expect(api.createDayPlan(invalidInput as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({limit:0})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({cursor:'not-a-cursor!'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({fromDate:'2026-11-09',toDate:'2026-11-07'}))
   .rejects.toMatchObject({code:'invalid'});
  expect(await api.listDayPlans()).toEqual(before);
 });

 it('recovers invalid tab snapshots without leaking data across modules',async()=>{
  sessionStorage.setItem(key,'{broken');
  expect((await createDemoDayPlanApi().listDayPlans()).total).toBe(3);
  const saved=JSON.parse(sessionStorage.getItem(key)!);
  saved.plans[1].capacityMinutes=-1;
  sessionStorage.setItem(key,JSON.stringify(saved));
  expect((await createDemoDayPlanApi().getDayPlan('demo-day-today'))?.capacityMinutes).toBe(120);
  const fake=createDemoDayPlanApi();
  setDayPlanApiForTests(fake);
  sessionStorage.setItem('lemma.demo','1');
  expect(getDayPlanApi()).toBe(fake);
  setDayPlanApiForTests(null);
  expect((await getDayPlanApi().listDayPlans()).total).toBe(3);
 });
});
