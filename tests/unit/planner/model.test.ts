import {describe,expect,it} from 'vitest';
import {DEFAULT_PLANNING,planTaskPlacements,type PlannerBlock,
 type PlannerInput,type PlannerTask} from '../../../src/features/planner/model';

const date='2026-11-07';
const none={kind:'none'} as const;
const task=(id:string,minutes:number|null,other:Partial<PlannerTask>={}):PlannerTask=>({
 id,priority:'normal',due:none,estimateMinutes:minutes,status:'backlog',...other,
});
const base=(tasks:PlannerTask[],extra:Partial<PlannerInput>={}):PlannerInput=>({
 from:date,through:date,timeZone:'UTC',tasks,...extra,
});
const clock=(iso:string)=>iso.slice(11,16);
const block=(id:string,start:string,end:string):PlannerBlock=>({
 id,kind:'busy',status:'planned',startsAt:start,endsAt:end,
});

describe('N67 deterministic planner placement engine',()=>{
 it('uses deployed settings.planning defaults and adds mandatory gaps',()=>{
  expect(DEFAULT_PLANNING).toEqual({
   window_start:'08:00',window_end:'22:00',gap_minutes:10,
   max_consecutive_minutes:120,daily_minimum_minutes:20,daily_intention:true,
  });
  const result=planTaskPlacements(base([task('alpha',30),task('beta',20)]));
  expect(result.placements.map(x=>[x.taskId,clock(x.start),clock(x.end),x.minutes]))
   .toEqual([['alpha','08:00','08:30',30],['beta','08:40','09:00',20]]);
  expect(result.days).toHaveLength(1);
  expect(result.days[0].capacityMinutes).toBe(840);
  expect(result.days[0].remainingMinutes).toBe(770);
  expect(result.days[0].placedMinutes).toBe(50);
  expect(result.unplaced).toEqual([]);
 });
 it('is stable under arbitrary task/block input order; priority outranks due, then due, then id',()=>{
  const values=[
   task('low',20,{priority:'low',due:{kind:'date',date:'2026-11-07'}}),
   task('normal-b',20,{due:{kind:'date',date:'2026-11-08'}}),
   task('normal-a',20,{due:{kind:'date',date:'2026-11-08'}}),
   task('high',20,{priority:'high',due:none}),
  ];
  const blocks=[
   block('late','2026-11-07T12:00:00Z','2026-11-07T12:45:00Z'),
   block('early','2026-11-07T10:00:00Z','2026-11-07T11:00:00Z'),
  ];
  const one=planTaskPlacements(base(values,{blocks}));
  const two=planTaskPlacements(base([...values].reverse(),{blocks:[...blocks].reverse()}));
  expect(one).toEqual(two);
  expect(one.placedTaskIds).toEqual(['high','normal-a','normal-b','low']);
  expect(values[0].priority).toBe('low');
  expect(blocks[0].startsAt).toBe('2026-11-07T12:00:00Z');
 });
 it('treats saved focus, planned/busy calendar blocks as unioned occupied time',()=>{
  const result=planTaskPlacements(base([task('later',45)],{
   planning:{window_start:'08:00',window_end:'12:00',gap_minutes:10},
   blocks:[
    block('b','2026-11-07T09:00:00Z','2026-11-07T10:00:00Z'),
    {...block('gone','2026-11-07T08:00:00Z','2026-11-07T12:00:00Z'),status:'cancelled'},
   ],
   savedEntries:[{id:'saved',status:'saved',intervals:[
    {kind:'focus',start:'2026-11-07T09:30:00Z',end:'2026-11-07T10:30:00Z'},
    {kind:'break',start:'2026-11-07T09:40:00Z',end:'2026-11-07T09:50:00Z'},
   ]}],
  }));
  expect(result.days[0].occupiedMinutes).toBe(90);
  expect(result.days[0].capacityMinutes).toBe(130);
  expect(result.placements[0]).toMatchObject({
   taskId:'later',start:'2026-11-07T08:00:00.000Z',end:'2026-11-07T08:45:00.000Z',
  });
 });
 it('never places an item after its due instant even when later hours are free',()=>{
  const result=planTaskPlacements(base([
   task('early-due',30,{due:{kind:'instant',at:'2026-11-07T09:00:00Z'}}),
  ],{planning:{window_start:'08:00',window_end:'12:00',gap_minutes:10},
   blocks:[block('busy','2026-11-07T08:00:00Z','2026-11-07T10:00:00Z')]}));
  expect(result.placements).toHaveLength(0);
  expect(result.unplaced).toMatchObject([{taskId:'early-due',reason:'after_due'}]);
  expect(result.days[0].remainingMinutes).toBe(110);
 });
 it('requires consent to split and enforces a gap and maximum consecutive length',()=>{
  const planning={window_start:'08:00',window_end:'10:00',
   gap_minutes:10,max_consecutive_minutes:60};
  const tooLong=planTaskPlacements(base([task('one',90)],{planning}));
  expect(tooLong.placements).toHaveLength(0);
  expect(tooLong.unplaced[0]).toMatchObject({
   reason:'too_long',suggestion:'make_smaller_step'});
  const split=planTaskPlacements(base([task('one',90,{allowSplit:true})],{planning}));
  expect(split.placements.map(x=>[x.minutes,clock(x.start),clock(x.end),x.part]))
   .toEqual([[60,'08:00','09:00',1],[30,'09:10','09:40',2]]);
  expect(split.unplaced).toHaveLength(0);
 });
 it('rolls back partial speculative fragments when the full selected task cannot fit',()=>{
  const result=planTaskPlacements(base([
   task('big',90,{priority:'high',allowSplit:true}),
   task('small',20,{priority:'low'}),
  ],{planning:{window_start:'08:00',window_end:'09:00',
   max_consecutive_minutes:30,gap_minutes:10}}));
  expect(result.unplaced).toMatchObject([{taskId:'big',reason:'no_capacity'}]);
  expect(result.placedTaskIds).toEqual(['small']);
  expect(result.placements.map(p=>p.taskId)).toEqual(['small']);
  expect(result.placements[0].start).toBe('2026-11-07T08:00:00.000Z');
  expect(result.days[0].suggestions).toContain('make_smaller_step');
  expect(result.days[0].suggestions).toContain('move_to_next_free_day');
 });
 it('never treats unknown availability as zero, and never manufactures an estimate',()=>{
  const noEstimate=planTaskPlacements(base([task('unknown',null)]));
  expect(noEstimate.unplaced).toMatchObject([
   {reason:'no_estimate',suggestion:'make_smaller_step'}]);
  const noAvailability=planTaskPlacements(base([task('ready',30)],{planning:null}));
  expect(noAvailability.days[0]).toMatchObject({
   windowMinutes:null,capacityMinutes:null,remainingMinutes:null,
   suggestions:['set_availability']});
  expect(noAvailability.unplaced).toMatchObject([
   {reason:'no_capacity',availabilityKnown:false,suggestion:'set_availability'}]);
  const unmeasuredDay=planTaskPlacements(base([task('ready',30)],{
   dayWindows:{[date]:null},
  }));
  expect(unmeasuredDay.days[0].capacityMinutes).toBeNull();
  expect(unmeasuredDay.placements).toEqual([]);
 });
 it('offers a next step on an empty day rather than marking it overloaded',()=>{
  const result=planTaskPlacements(base([],{
   planning:{window_start:'08:00',window_end:'09:00',gap_minutes:0},
  }));
  expect(result.days[0]).toMatchObject({
   empty:true,overloaded:false,windowMinutes:60,remainingMinutes:60,
   suggestions:['plan_next_step']});
 });
 it('resolves spring gaps and fall folds in the owner zone, not the browser zone',()=>{
  const spring=planTaskPlacements(base([],{from:'2026-03-08',through:'2026-03-08',
   timeZone:'America/New_York',planning:{
    window_start:'01:00',window_end:'04:00',gap_minutes:0,
   }}));
  expect(spring.days[0].windowMinutes).toBe(120);
  expect(spring.days[0].windowStart).toBe('2026-03-08T06:00:00.000Z');
  expect(spring.days[0].windowEnd).toBe('2026-03-08T08:00:00.000Z');
  const autumn=planTaskPlacements(base([],{from:'2026-11-01',through:'2026-11-01',
   timeZone:'America/New_York',planning:{
    window_start:'01:00',window_end:'02:00',gap_minutes:0,
   }}));
  expect(autumn.days[0].windowMinutes).toBe(120);
  expect(autumn.days[0].windowStart).toBe('2026-11-01T05:00:00.000Z');
  expect(autumn.days[0].windowEnd).toBe('2026-11-01T07:00:00.000Z');
 });
 it('handles a missing spring-clock boundary by advancing to the first real minute',()=>{
  const result=planTaskPlacements(base([],{from:'2026-03-08',through:'2026-03-08',
   timeZone:'America/New_York',planning:{
    window_start:'02:30',window_end:'04:00',gap_minutes:0,
   }}));
  expect(result.days[0].windowStart).toBe('2026-03-08T07:00:00.000Z');
  expect(result.days[0].windowMinutes).toBe(60);
 });
 it('moves a task to the next free date, respecting due civil dates',()=>{
  const result=planTaskPlacements(base([
   task('later',30,{due:{kind:'date',date:'2026-11-08'}}),
  ],{through:'2026-11-08',planning:{
   window_start:'08:00',window_end:'09:00',gap_minutes:0,
  },blocks:[block('b','2026-11-07T08:00:00Z','2026-11-07T09:00:00Z')]}));
  expect(result.placements).toMatchObject([
   {date:'2026-11-08',start:'2026-11-08T08:00:00.000Z'}]);
  expect(result.unplaced).toHaveLength(0);
  expect(result.days[0].remainingMinutes).toBe(0);
  expect(result.days[1].remainingMinutes).toBe(30);
 });
 it('rejects invalid ranges, zones, tasks, estimates and occupancy',()=>{
  const good=base([task('okay',30)]);
  for(const change of [
   {from:'2026-02-30'}, {through:'2026-11-06'},
   {through:'2026-12-09'}, {timeZone:'Mars/Olympus'},
   {tasks:[task('x',30),task('x',30)]},
   {tasks:[task('bad',0)]},
   {tasks:[task('bad',30,{priority:'urgent' as never})]},
   {planning:{gap_minutes:121}},
   {planning:{window_start:'25:00'}},
   {blocks:[block('bad','2026-11-07T10:00:00Z','2026-11-07T09:00:00Z')]},
   {blocks:[block('bad','2026-11-07T09:00:00','2026-11-07T10:00:00Z')]},
  ])expect(()=>planTaskPlacements({...good,...change} as PlannerInput)).toThrow();
 });
});
