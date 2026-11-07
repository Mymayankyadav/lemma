import {beforeEach,describe,expect,it} from 'vitest';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import {DayPlanError,type PlanAvailability} from '../../../src/data/day-plans/contract';

beforeEach(()=>sessionStorage.clear());
const begin=()=>({planDate:'2020-11-07',timeZone:'Asia/Kolkata',intention:'Proof first'});
const sources=():PlanAvailability=>({sources:[{resource:'tasks',id:'task-1',version:1}]});
const make=()=>{
 let actual=sources();
 const api=createDemoDayPlanApi(async()=>actual);
 return {api,setSources:(next:PlanAvailability)=>{actual=next}};
};
describe('N60.2 persistent demo day plans',()=>{
 it('enforces one plan per owner civil day, optimistic versions and reload isolation',async()=>{
  const {api}=make();
  const created=(await api.createPlan(begin())).record;
  expect(created).toMatchObject({status:'draft',version:1,planDate:'2020-11-07',closedAt:null});
  await expect(api.createPlan(begin())).rejects.toMatchObject({code:'conflict'});
  await expect(api.updatePlan(created.id,2,{intention:'stale'})).rejects.toMatchObject({code:'conflict'});
  const edited=(await api.updatePlan(created.id,1,{intention:'Updated'})).record;
  expect(edited.version).toBe(2);
  expect((await createDemoDayPlanApi().getPlan(created.id))?.intention).toBe('Updated');
  const other=(await api.createPlan({...begin(),planDate:'2020-11-08'})).record;
  expect(other.id).not.toBe(created.id);
  expect((await api.listPlans({from:'2020-11-07',through:'2020-11-08'})).total).toBe(2);
  expect((await api.getPlan('absent'))).toBe(null);
 });
 it('keeps placed, unplaced, carried-over work and checks source versions again at commit',async()=>{
  const {api,setSources}=make();
  const row=(await api.createPlan(begin())).record;
  const items=[
   {taskId:'task-1',disposition:'placed' as const,blockId:'block-1',position:0},
   {taskId:'task-2',disposition:'unplaced' as const,reason:'No available capacity',position:1},
   {taskId:'task-3',disposition:'carried_over' as const,reason:'Tomorrow',position:2},
  ];
  const snapshot:PlanAvailability={sources:[
   {resource:'tasks',id:'task-1',version:1},
   {resource:'tasks',id:'task-2',version:1},
   {resource:'tasks',id:'task-3',version:1},
   {resource:'calendar_blocks',id:'block-1',version:1},
  ]};
  setSources(snapshot);
  const preview=(await api.previewPlan(row.id,1,items,snapshot)).record;
  expect(preview.status).toBe('previewed');
  expect((await api.listItems(row.id)).items.map(x=>x.disposition))
   .toEqual(['placed','unplaced','carried_over']);
  expect((await api.listItems(row.id)).items[1]).toMatchObject({blockId:null,reason:'No available capacity'});
  setSources({sources:snapshot.sources.map(s=>s.id==='task-1'?{...s,version:2}:s)});
  await expect(api.commitPlan(row.id,2)).rejects.toMatchObject({code:'conflict'});
  expect((await api.getPlan(row.id))?.status).toBe('previewed');
  setSources(snapshot);
  const committed=(await api.commitPlan(row.id,2)).record;
  expect(committed.status).toBe('committed');
  await expect(api.previewPlan(row.id,3,items,sources())).rejects.toMatchObject({code:'conflict'});
  expect((await createDemoDayPlanApi().listItems(row.id)).total).toBe(3);
 });
 it('closes and reopens only the chosen date, forbids future close, retains independent rituals',async()=>{
  const {api}=make();
  const first=(await api.createPlan(begin())).record;
  const second=(await api.createPlan({...begin(),planDate:'2020-11-08'})).record;
  const committed=[];
  for(const row of [first,second]){
   const preview=(await api.previewPlan(row.id,1,[],{sources:[]})).record;
   committed.push((await api.commitPlan(row.id,preview.version)).record);
  }
  const closed=(await api.closePlan(committed[0].id,committed[0].version,{reviewed:true})).record;
  expect(closed).toMatchObject({status:'closed',ritual:{reviewed:true},version:4});
  expect(closed.closedAt).toMatch(/Z$/);
  expect((await api.getPlan(second.id))?.status).toBe('committed');
  const reopened=(await api.reopenPlan(closed.id,closed.version)).record;
  expect(reopened).toMatchObject({status:'committed',closedAt:null,ritual:{reviewed:true}});
  expect((await createDemoDayPlanApi().getPlan(second.id))?.closedAt).toBe(null);
  const future=(await api.createPlan({...begin(),planDate:'2099-11-08'})).record;
  const p=(await api.previewPlan(future.id,1,[],{sources:[]})).record;
  const c=(await api.commitPlan(future.id,p.version)).record;
  await expect(api.closePlan(c.id,c.version)).rejects.toMatchObject({code:'invalid'});
 });
 it('binds keyset cursors to filters, returns exact totals, and bounds plan and item pages',async()=>{
  const {api,setSources}=make();
  for(let day=1;day<=53;day++){
   const date=new Date(Date.UTC(2020,0,day)).toISOString().slice(0,10);
   await api.createPlan({...begin(),planDate:date});
  }
  const one=await api.listPlans({limit:50});
  expect(one.items).toHaveLength(50);
  expect(one.total).toBe(53);
  const two=await api.listPlans({limit:50,cursor:one.nextCursor});
  expect(two.items).toHaveLength(3);
  expect(two.total).toBe(53);
  await expect(api.listPlans({limit:10,cursor:one.nextCursor,status:['draft']}))
   .rejects.toBeInstanceOf(DayPlanError);
  await expect(api.listPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
  const row=one.items[0];
  const items=Array.from({length:52},(_,i)=>({
   taskId:'task-'+i,position:i,disposition:'unplaced' as const,reason:'No slot',
  }));
  // Each candidate must be captured in the preview source-version snapshot.
  // The server refuses an empty snapshot even when all items are unplaced.
  await expect(api.previewPlan(row.id,1,items,{sources:[]}))
   .rejects.toMatchObject({code:'invalid'});
  const snapshot:PlanAvailability={sources:items.map(x=>({
   resource:'tasks',id:x.taskId,version:1,
  }))};
  setSources(snapshot);
  await api.previewPlan(row.id,1,items,snapshot);
  const page=await api.listItems(row.id,{limit:50});
  expect(page.total).toBe(52);
  expect(page.items).toHaveLength(50);
  const next=await api.listItems(row.id,{limit:50,cursor:page.nextCursor});
  expect(next.items).toHaveLength(2);
  expect(next.items[0].position).toBe(50);
 });
 it('invalidates old previews and drops placements on a draft edit',async()=>{
  const {api,setSources}=make();
  const plan=(await api.createPlan(begin())).record;
  setSources(sources());
  const preview=(await api.previewPlan(plan.id,1,[{
   taskId:'task-1',disposition:'unplaced',reason:'No time',position:0,
  }],sources())).record;
  expect((await api.listItems(plan.id)).total).toBe(1);
  const edited=(await api.updatePlan(plan.id,preview.version,{intention:'Changed'})).record;
  expect(edited).toMatchObject({status:'draft',availability:{sources:[]},version:3});
  expect((await api.listItems(plan.id)).total).toBe(0);
  await expect(api.commitPlan(plan.id,edited.version)).rejects.toMatchObject({code:'conflict'});
 });
});
