import {describe,expect,it} from 'vitest';
import {weekSeed} from '../../../src/data/study/demo';
import {conceptCounts,buildAtlasTree} from '../../../src/features/atlas/tree';
import {taskOverdue} from '../../../src/features/tasks/Page';
import {todaysSchedule,ownerHour} from '../../../src/features/home/V6TodayPlan';
import {changeSummary} from '../../../src/features/plan-proposal/v6/PlanProposalV6';
import {dailyColumns,progressRange} from '../../../src/features/progress-v6/Page';
import {focusEntryStatus} from '../../../src/lib/focus/status';
import {groupLabel} from '../../../src/features/proposals/v6/Selection';
import {sortCards} from '../../../src/features/cards/v6/V6Cards';
import {civilRangeLabel,civilDayLabel,subjectColor} from '../../../src/features/calendar/views/labels';
import {dayCapacity} from '../../../src/features/calendar/model';
import type {AtlasGraph,CardRow} from '../../../src/data/types';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../src/data/study/contract';

describe('N121 G1 demo study seed',()=>{
 it('never seeds saved focus in the future and plans one study block ahead',()=>{
  const now=new Date('2026-11-09T08:13:00Z');
  const seed=weekSeed(now);
  for(const entry of seed.entries)for(const interval of entry.intervals)
   expect(Date.parse(interval.end!)).toBeLessThan(now.getTime());
  const study=seed.blocks.filter(block=>block.kind==='study');
  expect(study).toHaveLength(1);
  expect(Date.parse(study[0].startsAt)).toBeGreaterThan(now.getTime());
  expect((Date.parse(study[0].endsAt)-Date.parse(study[0].startsAt))/60000).toBe(50);
 });
});

describe('N121 E5 concept counts',()=>{
 it('counts real concepts and unique connections once, ignoring generated groups and duplicates',()=>{
  const concept=(id:string,parentId:string|null=null)=>({id,slug:id,name:id,parentId,blurb:null,subjectId:'s',
   status:'not_started' as const,pinX:null,pinY:null,checkpointRefs:[],dueCards:0});
  const graph:AtlasGraph={subjects:[{id:'s',name:'Algebra',glyph:'∑',hue:'slate',position:0}],misconceptions:[],
   concepts:[concept('a'),concept('b'),concept('c')],
   links:[{fromId:'a',toId:'b',kind:'prereq'},{fromId:'b',toId:'a',kind:'related'},{fromId:'b',toId:'c',kind:'prereq'}],
  } as unknown as AtlasGraph;
  const counts=conceptCounts(buildAtlasTree(graph));
  // A generated root for the subject is not a concept.
  expect(counts.concepts).toBe(3);
  expect(counts.connections).toBe(2);
 });
});

describe('N121 F10 overdue tasks',()=>{
 const now=new Date('2026-11-09T08:13:00Z');
 it('is overdue for a civil date before the owner today or a past instant, never when done',()=>{
  expect(taskOverdue({status:'backlog',due:{kind:'date',date:'2026-11-08'}},now,'Asia/Kolkata')).toBe(true);
  expect(taskOverdue({status:'backlog',due:{kind:'date',date:'2026-11-09'}},now,'Asia/Kolkata')).toBe(false);
  expect(taskOverdue({status:'in_progress',due:{kind:'instant',at:'2026-11-09T08:00:00Z'}},now)).toBe(true);
  expect(taskOverdue({status:'completed',due:{kind:'date',date:'2026-11-01'}},now)).toBe(false);
  expect(taskOverdue({status:'backlog',due:{kind:'none'}},now)).toBe(false);
 });
});

describe('N121 C1 Today reads the calendar',()=>{
 const block=(id:string,start:string,end:string,status:CalendarBlockRecord['status']='planned'):CalendarBlockRecord=>({
  id,title:id,kind:'study',startsAt:start,endsAt:end,status,version:1,timeZone:'Asia/Kolkata'});
 it('lists planned blocks that have not ended, in order, with no day plan needed',()=>{
  const now='2026-11-09T08:13:00Z';
  const rows=todaysSchedule([
   block('later','2026-11-09T14:00:00Z','2026-11-09T15:30:00Z'),
   block('ongoing','2026-11-09T08:00:00Z','2026-11-09T09:00:00Z'),
   block('past','2026-11-09T05:00:00Z','2026-11-09T06:00:00Z'),
   block('cancelled','2026-11-09T10:00:00Z','2026-11-09T11:00:00Z','cancelled'),
  ],now);
  expect(rows.map(row=>row.id)).toEqual(['ongoing','later']);
  expect(ownerHour('Asia/Kolkata',new Date(now))).toBe(13);
 });
});

describe('N121 shared v6 helpers',()=>{
 it('summarises a plan change',()=>{
  expect(changeSummary(3,2,1)).toBe('Adds 3 checkpoints · changes 2 · removes 1');
  expect(changeSummary(1,0,0)).toBe('Adds 1 checkpoint');
  expect(changeSummary(0,0,0)).toBe('No checkpoint changes');
 });
 it('maps the one Progress range control and buckets 90 days by week, never into the future',()=>{
  expect(progressRange('week')).toBe('7');expect(progressRange('month')).toBe('30');
  expect(progressRange('90')).toBe('90');expect(progressRange(null)).toBe('day');
  // Progress opens on 30 days, as in the mockup; ?range=day still means today.
  expect(progressRange(null,'30')).toBe('30');expect(progressRange('day','30')).toBe('day');
  const daily=Array.from({length:90},(_,i)=>({day:'d'+i,minutes:1}));
  const weeks=dailyColumns(daily,'90');
  expect(weeks).toHaveLength(13);
  expect(weeks[weeks.length-1].to).toBe('d89');
  expect(weeks.reduce((sum,week)=>sum+week.minutes,0)).toBe(90);
 });
 it('reads a break from the saved entry the same way as the Today card (A5)',()=>{
  const entry={status:'paused',phase:'break',intervals:[{kind:'focus',end:'x'},{kind:'break',end:null}]};
  expect(focusEntryStatus(entry)).toBe('On a break');
  expect(focusEntryStatus({...entry,intervals:[{kind:'focus',end:null}]})).toBe('Paused · break');
  expect(focusEntryStatus({status:'running',phase:'focus',intervals:[{kind:'focus',end:null}]})).toBe('In focus');
 });
 it('names Inbox groups without codes',()=>{
  expect(groupLabel('S7 / CP4')).toBe('Session 7 · Checkpoint CP4');
  expect(groupLabel('General')).toBe('General');
 });
 it('sorts cards due first, then newest, then by path',()=>{
  const row=(noteNo:number,due:string|null,projectSlug='a'):CardRow=>({noteNo,front:'Same',type:'basic',kind:'other',
   projectSlug,glyph:'∫',checkpointCode:null,due,status:'active',openComments:0});
  const rows=[row(1,'2026-12-01'),row(2,null),row(3,'2026-11-01','b')];
  expect(sortCards(rows,'due',slug=>slug).map(r=>r.noteNo)).toEqual([3,1,2]);
  expect(sortCards(rows,'newest',slug=>slug).map(r=>r.noteNo)).toEqual([3,2,1]);
  expect(sortCards(rows,'path',slug=>slug).map(r=>r.noteNo)).toEqual([1,2,3]);
 });
 it('labels civil ranges and days in the mockup order',()=>{
  const year=new Date().getUTCFullYear();
  expect(civilRangeLabel(year+'-11-09',year+'-11-15')).toBe('Nov 9 – 15');
  expect(civilRangeLabel(year+'-11-30',year+'-12-06')).toBe('Nov 30 – Dec 6');
  expect(civilDayLabel(year+'-11-09')).toMatch(/^[A-Z][a-z]{2}, Nov 9$/);
  expect(subjectColor(null)).toBeNull();
  expect(subjectColor('subject-analysis')).toBe(subjectColor('subject-analysis'));
 });
 it('counts Free time only inside the planning window (B3)',()=>{
  const none:StudyEntryRecord[]=[];
  const whole=dayCapacity('2026-11-09','UTC',none,[]);
  const planning=dayCapacity('2026-11-09','UTC',none,[],{start:'08:00',end:'22:00'});
  expect(whole.free).toBe(1440);
  expect(planning.free).toBe(14*60);
 });
});
