// #1319 (N119): saved focus that overlaps or lies in the future is reported; totals stay counted once elsewhere.
import {describe,expect,it} from 'vitest';
import {needsAttention,savedTimeIssues} from '../../../src/features/insights/savedTimeIssues';
import type {StudyEntryRecord} from '../../../src/data/study/contract';

const entry=(id:string,start:string,end:string|null,extra:Partial<StudyEntryRecord>={}):StudyEntryRecord=>({
 id,intent:'Study',source:'timer',status:'saved',version:1,reflection:null,rating:null,
 createdAt:start,updatedAt:start,savedAt:start,subjectId:null,projectId:null,checkpointId:null,sessionId:null,
 intervals:[{id:id+'-i',kind:'focus',start,end}],...extra,
} as StudyEntryRecord);
const now='2026-11-07T12:00:00Z';

describe('#1319 saved time issues',()=>{
 it('reports overlapping saved minutes once and ignores breaks, open, discarded and voided entries',()=>{
  expect(savedTimeIssues([entry('a','2026-11-07T09:00:00Z','2026-11-07T10:00:00Z')],now)).toEqual({overlapMinutes:0,futureRecords:0});
  const issues=savedTimeIssues([
   entry('a','2026-11-07T09:00:00Z','2026-11-07T10:00:00Z'),
   entry('b','2026-11-07T09:30:00Z','2026-11-07T10:30:00Z'),
   entry('c','2026-11-07T09:00:00Z','2026-11-07T11:00:00Z',{status:'discarded' as StudyEntryRecord['status']}),
   entry('d','2026-11-07T09:00:00Z','2026-11-07T11:00:00Z',{voidedAt:'2026-11-07T11:00:00Z'}),
   entry('e','2026-11-07T09:00:00Z',null),
   {...entry('f','2026-11-07T09:00:00Z','2026-11-07T11:00:00Z'),intervals:[{id:'f-b',kind:'break',start:'2026-11-07T09:00:00Z',end:'2026-11-07T11:00:00Z'}]},
  ],now);
  expect(issues).toEqual({overlapMinutes:30,futureRecords:0});
  expect(needsAttention(issues)).toBe(true);
 });
 it('reports saved focus that ends after now',()=>{
  const issues=savedTimeIssues([entry('a','2026-11-07T11:30:00Z','2026-11-07T13:00:00Z')],now);
  expect(issues.futureRecords).toBe(1);
  expect(needsAttention(issues)).toBe(true);
  expect(needsAttention(null)).toBe(false);
 });
});
