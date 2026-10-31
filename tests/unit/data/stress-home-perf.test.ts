// @vitest-environment node
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');

describe('FIX #507: cold Today stress summary',()=>{
 it('derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme'),now:()=>now,timeZone:'UTC'});
  const started=performance.now();
  const home=await api.getHome();
  const elapsed=performance.now()-started;
  expect(home.projects).toHaveLength(60);
  expect(home.due).toBe(4000);
  expect(home.pendingProposals).toBe(600);
  const baseline=home.projects.find(p=>p.id===seed.projects[0].id);
  expect(baseline).toMatchObject({done:3,total:36});
  expect(home.projects.find(p=>p.slug==='stress-project-3')).toMatchObject({done:3,total:100});
  // Project counts must stay exact when summary scans are replaced with
  // per-project indexes; the 30,000 cards are distributed evenly.
  expect(baseline).toMatchObject({cardsCount:500,sessionsCount:1000,sourcesCount:100});
  expect(home.projects.find(p=>p.slug==='stress-project-3'))
   .toMatchObject({cardsCount:500,sessionsCount:0,sourcesCount:100});
  // This is an unthrottled adapter-only guard. The separate ST-0 browser gate
  // retains its stricter 1,500ms end-to-end limit under actual 4x CPU.
  expect(elapsed).toBeLessThan(1500);
 },30_000);
});
