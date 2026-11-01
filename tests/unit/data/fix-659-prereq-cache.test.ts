// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');

describe('FIX-659h direct Project prerequisite status',()=>{
 it('does not recursively recompute each 100-checkpoint prerequisite chain',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  const baseline=new DemoAdapter({fixture:structuredClone(fixture),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const expected=await baseline.getProject('stress-project-3');
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const subject=api as unknown as {cpUi:(cp:unknown)=>unknown};
  const old=vi.spyOn(subject,'cpUi');
  const actual=await api.getProject('stress-project-3');
  expect(actual).toEqual(expected);
  expect(actual.checkpoints.length).toBeGreaterThanOrEqual(100);
  expect(old.mock.calls.length).toBeLessThanOrEqual(1);
 },30_000);

 it('preserves the cycle-safe original fallback for malformed plans',async()=>{
  const fixture=structuredClone(seed);
  const project=fixture.projects.find(p=>p.slug==='real-analysis')!;
  const cps=fixture.checkpoints.filter(cp=>cp.projectId===project.id);
  cps[0].prereqs=[cps[1].code];
  cps[1].prereqs=[cps[0].code];
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const first=await api.getProject('real-analysis');
  const second=await api.getProject('real-analysis');
  expect(second).toEqual(first);
 },30_000);
});
