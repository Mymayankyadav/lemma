import {describe,expect,it} from 'vitest';
import type {StudyEntryRecord} from '../../../src/data/study/contract';
import type {GoalRecord} from '../../../src/data/study-goals/contract';
import type {Settings} from '../../../src/data/types';
import {effortSummary} from '../../../src/features/progress-v6/model';
import {almanacPeriod,changeChip,currentPeriod,goalView,groupDays,insightSentences,previousPeriod,stackColumns} from '../../../src/features/insights/v7/progressModel';
import {sectionOf,settingsSummary} from '../../../src/features/settings/v7/SettingsV7';
import {chosenColours,colourMap} from '../../../src/app/v7/subjectColours';
import {kitSubject,setChosenSubjects} from '../../../src/features/atlas/v7/model';
import {v7ScreenFor} from '../../../src/app/v7Kit';

const zone='Asia/Kolkata',now=new Date('2026-11-09T08:13:00Z');
const entry=(id:string,start:string,minutes:number,subjectId:string|null):StudyEntryRecord=>({id,status:'saved',subjectId,projectId:null,checkpointId:null,sessionId:null,intent:'x',source:'timer',approximate:false,
 rating:null,reflection:null,voidedAt:null,savedAt:start,createdAt:start,version:1,
 intervals:[{kind:'focus',start,end:new Date(Date.parse(start)+minutes*60000).toISOString()}]} as unknown as StudyEntryRecord);
const entries=[entry('a','2026-10-20T04:00:00Z',50,'s1'),entry('b','2026-11-02T04:00:00Z',70,'s2'),entry('c','2026-11-08T04:00:00Z',25,'s1'),entry('d','2026-10-01T04:00:00Z',40,'s1')];

describe('v7 Progress (PLAN §6.13)',()=>{
 it('the hero equals the sum of the columns, for daily and weekly columns',()=>{
  for(const range of ['7','30','90'] as const){
   const period=currentPeriod(range,now,zone),stamp=now.toISOString();
   const total=effortSummary(entries,period,zone,stamp).minutes;
   for(const size of [1,7]){
    const columns=stackColumns(entries,groupDays(period.days,size),zone,stamp);
    expect(columns.reduce((sum,column)=>sum+column.minutes,0)).toBeCloseTo(total,6);
    for(const column of columns)expect(Object.values(column.bySubject).reduce((a,b)=>a+b,0)).toBeCloseTo(column.minutes,6);
   }
  }
 });
 it('compares with the same number of days just before',()=>{
  const period=currentPeriod('30',now,zone),before=previousPeriod(period,zone);
  expect(before.days).toHaveLength(30);
  expect(before.days.at(-1)).toBe('2026-10-10');
  expect(changeChip(95,40,'30')).toEqual({text:'55 min more than the 30 days before',tone:'success'});
  expect(changeChip(40,95,'30')?.tone).toBe('info');
  expect(changeChip(0,0,'30')).toBeNull();
 });
 it('draws the almanac as 26 whole weeks starting on a Monday',()=>{
  const almanac=almanacPeriod(now,zone);
  expect(almanac.days).toHaveLength(182);
  expect(new Date(almanac.days[0]+'T12:00:00Z').getUTCDay()).toBe(1);
 });
 it('writes at most two insights, each only with enough data',()=>{
  const name=(id:string)=>id==='s1'?'Topology':'Analysis';
  expect(insightSentences({parts:[{id:'s1',minutes:72},{id:'s2',minutes:128}],total:200,name,unsure:{total:12,rate:.71}}))
   .toEqual(['Analysis took 64% of your time in this range.','Your recall on cards you were unsure of is 71%.']);
  expect(insightSentences({parts:[{id:'s1',minutes:30}],total:30,name,unsure:{total:2,rate:1}})).toEqual([]);
 });
 it('writes goal cards in words, never raw dates or zone names',()=>{
  const goal={id:'g',period:'week',startDate:'2026-11-09',endDate:'2026-11-15',timeZone:'Asia/Kolkata',targetMinutes:600,subjectId:null,projectId:null,archivedAt:null,version:1,createdAt:'',updatedAt:''} as GoalRecord;
  const view=goalView(goal,40,'All subjects',now);
  expect(view).toMatchObject({title:'This week · All subjects',done:'40 min',target:'10 h',rest:'9 h 20 min to go · 7 days left',reached:false});
  for(const text of [view.title,view.done,view.target,view.rest])expect(text).not.toMatch(/\d{4}-\d{2}|Asia|UTC|Kolkata/);
  expect(goalView({...goal,endDate:'2026-11-08',startDate:'2026-11-02'},700,'All subjects',now).rest).toBe('Reached');
  expect(goalView({...goal,endDate:'2026-11-08',startDate:'2026-11-02'},480,'All subjects',now).rest).toBe('2 h short');
 });
});

describe('v7 Settings, Sign-in and first run (PLAN §6.14–6.15)',()=>{
 const settings={connectorUrl:'https://x/mcp/abc',preferredChat:'claude',desiredRetention:.9,newPerDay:20,planning:{window_start:'09:00',window_end:'17:00',gap_minutes:10,max_consecutive_minutes:90,daily_minimum_minutes:120,daily_intention:true},
  notify:{enabled:true,mode:'daily',studyTime:'19:00'}} as unknown as Settings;
 it('shows the current value on every index row',()=>{
  expect(settingsSummary('appearance',settings,3,'auto',true)).toBe('Night · follows the system');
  expect(settingsSummary('appearance',settings,3,'day',true)).toBe('Day');
  expect(settingsSummary('tutor',settings,3,'auto',true)).toBe('Connected · Claude');
  expect(settingsSummary('study',settings,3,'auto',true)).toBe('Target recall 90% · 20 new cards a day');
  expect(settingsSummary('planning',settings,3,'auto',true)).toBe('Daily minimum 2 h · day ends 17:00');
  expect(settingsSummary('reminders',settings,3,'auto',true)).toBe('On · daily at 19:00');
  expect(settingsSummary('subjects',settings,1,'auto',true)).toBe('1 subject');
 });
 it('keeps old ?section= links working',()=>{
  expect(sectionOf('connector')).toBe('tutor');
  expect(sectionOf('focus')).toBe('study');
  expect(sectionOf('export')).toBe('data');
  expect(sectionOf('subjects')).toBe('subjects');
  expect(sectionOf('nonsense')).toBeNull();
  expect(sectionOf(null)).toBeNull();
 });
 it('a chosen subject colour overrides the name match everywhere kitSubject is used',()=>{
  const ui={subjectColours:{s1:'Topology',s2:'Not a subject'}};
  expect(chosenColours(ui)).toEqual({s1:'Topology'});
  const map=colourMap(ui,[{id:'s1',name:'Real Analysis'},{id:'s2',name:'Linear Algebra'}]);
  expect(kitSubject('Real Analysis')).toBe('Analysis');
  setChosenSubjects(map);
  expect(kitSubject('Real Analysis')).toBe('Topology');
  expect(kitSubject('Linear Algebra')).toBe('Algebra');
  setChosenSubjects(new Map());
  expect(kitSubject('Real Analysis')).toBe('Analysis');
 });
 it('routes the insight and edge screens to v7',()=>{
  for(const [path,screen] of [['/insights','progress'],['/log','log'],['/settings','settings'],['/sign-in','sign-in'],['/welcome','welcome']] as const)expect(v7ScreenFor(path)).toBe(screen);
 });
});
