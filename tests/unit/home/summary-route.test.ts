import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {SummaryGoalCard} from '../../../src/features/home/SummaryGoalCard';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {ProjectSummary} from '../../../src/data/types';
import {summaryRouteCheckpoints,summaryScheduleStatus} from '../../../src/features/home/summaryRoute';

const project=(overrides:Partial<ProjectSummary>={}):ProjectSummary=>({
 id:'algebra',slug:'algebra',title:'Algebra 1',subject:{id:'math',name:'Mathematics',glyph:'∑',hue:'slate',position:0},
 status:'active',done:0,total:36,current:{code:'CP1',title:'Sets, maps, well-definedness',step:1,stepsTotal:5},
 lastActivityAt:null,cardsCount:0,sessionsCount:0,sourcesCount:0,
 ...overrides,
});

describe('FIX #614 v4 large-project summary Route',()=>{
 it('renders 36 un-staged checkpoints as neutral groups of eight without detail fetches',()=>{
  const result=summaryRouteCheckpoints(project());
  expect(result.checkpoints).toHaveLength(36);
  expect(result.checkpoints[0].code).toBe('CP1');
  expect(result.checkpoints[0].ui).toBe('now');
  expect(result.checkpoints.slice(0,8).every(cp=>cp.stage==='CP1–8')).toBe(true);
  expect(result.checkpoints.slice(8,16).every(cp=>cp.stage==='CP9–16')).toBe(true);
  expect(result.foldedLabel).toBe('4 groups · 28 to go');
  expect(result.scheduleRows).toHaveLength(36);
  const forty=summaryRouteCheckpoints(project({total:40}));
  expect(forty.checkpoints).toHaveLength(40);
  expect(forty.checkpoints.slice(32).every(cp=>cp.stage==='CP33–40')).toBe(true);
  expect(forty.foldedLabel).toBe('4 groups · 32 to go');
 });
 it('preserves real stage totals, the current checkpoint link and done counts from the summary',()=>{
  const result=summaryRouteCheckpoints(project({
   done:20,total:40,current:{code:'CP21',title:'Current proof',step:1,stepsTotal:3},
   stageProgress:[
    {label:'Foundations',firstCode:'CP1',lastCode:'CP20',done:20,total:20,overdue:0,schedule:'complete'},
    {label:'Proofs',firstCode:'CP21',lastCode:'CP40',done:0,total:20,overdue:0,schedule:'dated'},
   ],
  }));
  expect(result.checkpoints).toHaveLength(40);
  expect(result.checkpoints[20].code).toBe('CP21');
  expect(result.checkpoints[20].ui).toBe('now');
  expect(result.checkpoints.slice(0,20).every(cp=>cp.ui==='done')).toBe(true);
  expect(result.checkpoints[20].stage).toBe('Proofs');
  expect(result.foldedLabel).toBe('0 stages · 0 to go');
 });
 it('maps old aggregate headlines to the approved schedule-chip vocabulary',()=>{
  expect(summaryScheduleStatus(project({scheduleHeadline:'Dates planned'}))).toBe('On schedule');
  expect(summaryScheduleStatus(project({scheduleHeadline:'3 overdue'}))).toBe('Behind schedule');
  expect(summaryScheduleStatus(project({scheduleHeadline:'6 days behind'}))).toBe('6 days behind');
  expect(summaryScheduleStatus(project({scheduleHeadline:'9 days ahead'}))).toBe('9 days ahead');
  expect(summaryScheduleStatus(project())).toBe('Not started');
 });
 it('never links a guessed checkpoint when home_summary has no current checkpoint',()=>{
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,
   createElement(SummaryGoalCard,{project:project({current:null}),events:undefined})));
  const routeHref=html.match(/data-route-mode="today"[\\s\\S]*?<a[^>]+href="([^"]+)"/)?.[1];
  expect(routeHref).toBe('/p/algebra');
  expect(html).not.toContain('href="/p/algebra/cp/CP1"');
  const routeSvg=html.match(/<svg data-route-track[\\s\\S]*?<\\/svg>/)?.[0]??'';
  expect(routeSvg,'no synthetic checkpoint may wear the red current marker').not.toContain('fill="var(--accent)"');
  const current=renderToStaticMarkup(createElement(MemoryRouter,null,
   createElement(SummaryGoalCard,{project:project(),events:undefined})));
  expect(current).toContain('href="/p/algebra/cp/CP1"');
 });
 it('does not add a per-project detail query to the large-card component',()=>{
  const source=readFileSync(join(process.cwd(),'src/features/home/SummaryGoalCard.tsx'),'utf8');
  expect(source).not.toContain('useProject(');
  expect(source).not.toContain('getApi(');
  expect(source).toContain('data-goal-footnote');
  expect(source).toContain('data-goal-now');
 });
});
