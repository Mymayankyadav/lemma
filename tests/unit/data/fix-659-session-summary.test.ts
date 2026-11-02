// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');

describe('FIX-659g direct Project session summaries',()=>{
 for(const profile of ['stress','extreme'] as const){
  it(profile+' builds session rows without repeated 60-project lookups',async()=>{
   const fixture=makeStressStore(seed,profile,{
    deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
   });
   const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
   const expected=await api.listSessions('stress-project-3');
   expect(expected).toHaveLength(profile==='extreme'?1000:300);
   const store=(api as unknown as {store:DemoStore}).store;
   const find=vi.spyOn(store.projects,'findIndex');
   const subject=api as unknown as {projectById:(id:string)=>unknown};
   const lookup=vi.spyOn(subject,'projectById');
   const actual=await api.listSessions('stress-project-3');
   expect(actual).toEqual(expected);
   expect(find.mock.calls.length).toBeLessThanOrEqual(2);
   expect(lookup.mock.calls.length).toBeLessThanOrEqual(2);
  },30_000);
 }
 it('preserves the empty-slug alias for unscoped session reads',async()=>{
  const api=new DemoAdapter({now:()=>now,timeZone:'UTC'});
  expect(await api.listSessions('')).toEqual(await api.listSessions());
 },30_000);

});
