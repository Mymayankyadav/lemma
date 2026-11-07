import {describe,expect,it} from 'vitest';
import {civilPlanDate,comparePlanSources,normalizeAvailability,
 normalizeDayPlan,normalizePlanItems,planTimeZone,validatePlanClosure}
 from '../../../src/data/day-plans/model';

describe('N60.1 dated plans, source-version integrity and explicit dispositions',()=>{
 it('uses strict civil dates, including leap days, independent of DST instants',()=>{
  expect(civilPlanDate('2028-02-29')).toBe('2028-02-29');
  expect(civilPlanDate('2026-03-29')).toBe('2026-03-29');
  expect(civilPlanDate('2026-10-25')).toBe('2026-10-25');
  for(const invalid of ['2026-02-29','2026-02-30','2026-13-01',
   '2026-11-7','2026-01-01T12:00:00Z','0000-01-01','today'])
   expect(()=>civilPlanDate(invalid)).toThrow();
 });
 it('validates IANA owner zones and daily whole-minute capacity',()=>{
  expect(planTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
  expect(planTimeZone('America/New_York')).toBe('America/New_York');
  for(const zone of ['', 'Mars/Phobos',' '.repeat(81)])
   expect(()=>planTimeZone(zone)).toThrow();
  for(const minutes of [-1,1441,1.5,NaN,Infinity])
   expect(()=>normalizeDayPlan({planDate:'2026-11-07',timeZone:'UTC',capacityMinutes:minutes})).toThrow();
  expect(normalizeDayPlan({planDate:'2026-11-07',timeZone:'UTC',capacityMinutes:1440}).capacityMinutes)
   .toBe(1440);
 });
 it('normalizes a dated plan without owner fields or shared mutable snapshots',()=>{
  const raw={planDate:'2026-11-07',timeZone:'Asia/Kolkata',
   intention:'Prove the lemma',capacityMinutes:120,
   tomorrowFirstTaskId:'task-1',
   availability:{sources:[{resource:'tasks' as const,id:'task-1',version:3}]},
   ritual:{shutdown:{done:false}}};
  const normalized=normalizeDayPlan(raw);
  expect(normalized).toMatchObject({...raw,capacityMinutes:120});
  raw.availability.sources[0].version=4;
  (raw.ritual.shutdown as {done:boolean}).done=true;
  expect(normalized.availability.sources[0].version).toBe(3);
  expect(normalized.ritual).toEqual({shutdown:{done:false}});
  expect(normalizeDayPlan({planDate:'2026-11-08',timeZone:'UTC'}))
   .toMatchObject({intention:'',capacityMinutes:0,availability:{sources:[]},
    tomorrowFirstTaskId:null,ritual:{}});
  expect(()=>normalizeDayPlan({...raw,user_id:'forged-owner'} as never)).toThrow();
  expect(()=>normalizeDayPlan({...raw,ownerId:'forged-owner'} as never)).toThrow();
 });
 it('rejects malformed and duplicate task/block version sources',()=>{
  const source={resource:'tasks' as const,id:'task-1',version:2};
  expect(normalizeAvailability({sources:[source]})).toEqual({sources:[source]});
  const bad=[
   {sources:[{...source,version:0}]},
   {sources:[{...source,version:2147483648}]},
   {sources:[{...source,version:1.5}]},
   {sources:[{...source,resource:'owners'}]},
   {sources:[{...source,owner_id:'forged'}]},
   {sources:[source,source]},
   {sources:'not-array'},
   {notSources:[]},
  ];
  for(const value of bad)
   expect(()=>normalizeAvailability(value as never)).toThrow();
 });
 it('detects stale and missing preview versions without treating new unlisted sources as stale',()=>{
  const base={sources:[
   {resource:'tasks' as const,id:'t-1',version:3},
   {resource:'calendar_blocks' as const,id:'b-1',version:6}]};
  expect(comparePlanSources(base,{sources:[...base.sources,
   {resource:'tasks',id:'unlisted',version:1}]})).toEqual({ok:true,stale:[]});
  const result=comparePlanSources(base,{sources:[
   {resource:'tasks',id:'t-1',version:4}]});
  expect(result).toEqual({ok:false,stale:[
   {resource:'tasks',id:'t-1',version:3,currentVersion:4},
   {resource:'calendar_blocks',id:'b-1',version:6,currentVersion:null}]});
  expect(base.sources[0].version).toBe(3);
 });
 it('preserves placed, unplaced and carried-over tasks in stable order',()=>{
  const items=normalizePlanItems([
   {taskId:'task-1',blockId:'block-1',disposition:'placed',position:0},
   {taskId:'task-2',disposition:'unplaced',reason:'no_capacity',position:1},
   {taskId:'task-3',disposition:'carried_over',reason:'Move to tomorrow',position:2},
  ]);
  expect(items).toHaveLength(3);
  expect(items.map(x=>x.disposition)).toEqual(['placed','unplaced','carried_over']);
  expect(items[1]).toMatchObject({blockId:null,reason:'no_capacity'});
  expect(items[2]).toMatchObject({blockId:null,reason:'Move to tomorrow'});
 });
 it('refuses silently dropped work, duplicate positions and forged item fields',()=>{
  const base={taskId:'task-1',disposition:'unplaced' as const,position:0};
  for(const item of [
   base,{...base,reason:' '},{...base,blockId:'fake-block',reason:'no_capacity'},
   {...base,reason:'no_capacity',position:-1},
   {...base,reason:'no_capacity',position:1.5},
   {...base,reason:'no_capacity',userId:'other'},
   {...base,reason:'no_capacity',disposition:'ignored'},
  ])expect(()=>normalizePlanItems([item] as never)).toThrow();
  expect(()=>normalizePlanItems([
   {...base,reason:'one'},{...base,position:0,reason:'two'}])).toThrow();
 });
 it('requires closure timestamps on closed days, never on a new date',()=>{
  validatePlanClosure('closed','2026-11-07T18:30:00+05:30');
  validatePlanClosure('draft',null);
  validatePlanClosure('previewed',null);
  validatePlanClosure('committed',null);
  for(const status of ['draft','previewed','committed'] as const)
   expect(()=>validatePlanClosure(status,'2026-11-07T18:30:00Z')).toThrow();
  for(const at of [null,'2026-11-07','not-a-date',
   '2026-02-30T18:30:00Z','2026-11-07T25:00:00Z'])
   expect(()=>validatePlanClosure('closed',at)).toThrow();
  expect(()=>validatePlanClosure('complete' as never,null)).toThrow();
 });
});
