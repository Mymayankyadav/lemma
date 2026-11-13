import {beforeEach,describe,expect,it} from 'vitest';
import {createDemoStudyApi} from '../../../src/data/study/demo';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';

beforeEach(()=>sessionStorage.clear());
describe('Calendar sees an atomic demo suggestion immediately',()=>{
 it('publishes into the same study adapter already used by the calendar, without a reload',async()=>{
  const study=createDemoStudyApi();
  const plans=createDemoDayPlanApi(async expected=>expected,study);
  const range={start:'2028-01-01T00:00:00Z',end:'2028-01-02T00:00:00Z'};
  const before=await study.listCalendarBlocks(range);
  const done=await plans.commitPlacements({operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',days:[{
   planDate:'2028-01-01',timeZone:'UTC',sources:[{resource:'tasks',id:'task1',version:1}],
   placements:[{taskId:'task1',title:'Read a theorem',startsAt:'2028-01-01T10:00:00Z',endsAt:'2028-01-01T10:30:00Z',position:0}],
  }]});
  const after=await study.listCalendarBlocks(range);
  expect(after).toHaveLength(before.length+1);
  expect(after.find(block=>block.id===done.record.blockIds[0])?.title).toBe('Read a theorem');
 });
});
