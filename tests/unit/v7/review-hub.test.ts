import {describe,expect,it} from 'vitest';
import type {DeckNode,InsightData} from '../../../src/data/types';
import type {Subject} from '../../../src/ui/v7/Subject';
import {activeSubject,selectionForSlug,clock,forecastBars,memoryStats,roundSummary,selectionFor,subjectSegments} from '../../../src/features/review/v7/reviewModel';
import {v7ScreenFor} from '../../../src/app/v7Kit';

const node=(slug:string,due:number,children:{code:string;due:number}[]=[]):DeckNode=>({key:'project:'+slug,label:slug,glyph:'sigma' as never,level:0,due,
 children:children.map(child=>({key:'cp:'+slug+':'+child.code,label:child.code,glyph:'sigma' as never,level:1,due:child.due,children:[]}))});
const nodes=[node('real',12,[{code:'CP1',due:7},{code:'CP2',due:5}]),node('topology',5),node('algebra',3),node('empty',0)];
const subjectOf=(slug:string):Subject=>slug==='real'?'Analysis':slug==='topology'?'Topology':slug==='algebra'?'Algebra':'Other';

describe('v7 review hub model',()=>{
 it('groups due cards by subject, largest first, skipping empty decks',()=>{
  expect(subjectSegments(nodes,subjectOf)).toEqual([{subject:'Analysis',due:12},{subject:'Topology',due:5},{subject:'Algebra',due:3}]);
 });
 it('selects a whole subject including its checkpoints, and names the active choice',()=>{
  const analysis=selectionFor(nodes,subjectOf,'Analysis');
  expect([...analysis].sort()).toEqual(['cp:real:CP1','cp:real:CP2','project:real']);
  expect(activeSubject(nodes,subjectOf,analysis)).toBe('Analysis');
  expect(activeSubject(nodes,subjectOf,selectionFor(nodes,subjectOf,null))).toBeNull();
  expect(activeSubject(nodes,subjectOf,new Set(['project:topology','project:algebra']))).toBe('custom');
 });
 it('limits a round to one path, or to nothing when that path has no cards due',()=>{
  expect([...selectionForSlug(nodes,'real')].sort()).toEqual(['cp:real:CP1','cp:real:CP2','project:real']);
  expect(selectionForSlug(nodes,'empty').size).toBe(0);
  expect(selectionForSlug(nodes,'missing').size).toBe(0);
 });
 it('labels the forecast Today then weekdays, never negative',()=>{
  const bars=forecastBars([{day:'2026-11-11',due:4},{day:'2026-11-12',due:-2},{day:'2026-11-13',due:9}]);
  expect(bars).toEqual([{label:'Today',due:4},{label:'Thu',due:0},{label:'Fri',due:9}]);
 });
 it('computes recall and a median answer time',()=>{
  const row=(rating:1|2|3|4,durationMs:number)=>({reviewedAt:'2026-11-10T10:00:00Z',rating,stateBefore:2 as never,confidence:null,durationMs,projectId:'p'});
  const stats=memoryStats([row(3,4000),row(1,8000),row(4,6000),row(2,0)] as InsightData['reviews']);
  expect(stats).toEqual({recallPct:75,reviews:4,typicalSeconds:6});
  expect(memoryStats([])).toEqual({recallPct:null,reviews:0,typicalSeconds:null});
 });
 it('summarises a round from the reviews inside its time window only',()=>{
  const row=(at:string,rating:1|2|3|4,durationMs:number)=>({reviewedAt:at,rating,stateBefore:2 as never,confidence:null,durationMs,projectId:'p'});
  const reviews=[row('2026-11-11T09:00:05Z',3,5000),row('2026-11-11T09:00:20Z',1,7000),row('2026-11-11T09:00:40Z',4,3000),row('2026-11-11T08:00:00Z',1,9000)] as InsightData['reviews'];
  const summary=roundSummary(reviews,{startedAt:'2026-11-11T09:00:00Z',endedAt:'2026-11-11T09:01:00Z',graded:3});
  expect(summary.grades).toEqual({again:1,hard:0,good:1,easy:1});
  expect(summary).toMatchObject({cards:3,seconds:15,recalledPct:67,counted:3});
  expect(roundSummary([],{startedAt:'2026-11-11T09:00:00Z',endedAt:'2026-11-11T09:01:00Z',graded:3})).toMatchObject({recalledPct:null,seconds:60,counted:0});
 });
 it('formats minutes and seconds',()=>{expect(clock(75)).toBe('1:15');expect(clock(5)).toBe('0:05');});
 it('routes the hub always and the results page only for a saved run',()=>{
  expect(v7ScreenFor('/review')).toBe('review');
  expect(v7ScreenFor('/review/done','?run=abc')).toBe('review-done');
  expect(v7ScreenFor('/review/done')).toBeNull();
 });
});
