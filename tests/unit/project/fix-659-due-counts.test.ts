// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';

const now=Date.parse('2026-10-29T12:00:00Z');
const filter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false} as const;

describe('FIX-659 Project checkpoint daily due-card count index',()=>{
 it('indexes the bounded daily cohort once instead of filtering it for every checkpoint',()=>{
  const source=readFileSync('src/data/demo/adapter.ts','utf8');
  const start=source.indexOf('async getProject(slug:');
  const end=source.indexOf('async getCheckpoint(slug:',start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const project=source.slice(start,end);
  expect(project).toContain('const dueByCheckpoint=new Map<string,number>();');
  expect(project).toContain('dueByCheckpoint.get(cp.code)??0');
 });
 for(const profile of ['default','stress','extreme'] as const){
  it('preserves per-checkpoint daily due counts for '+profile,async()=>{
   const api=profile==='default'
    ?new DemoAdapter({now:()=>now,timeZone:'UTC'})
    :new DemoAdapter({
      fixture:makeStressStore(demoSeedFixture,profile,{
       deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
      }),
      ownedFixture:true,now:()=>now,timeZone:'UTC',
     });
   const project=await api.getProject('real-analysis');
   const cards=await api.getReviewItems(filter);
   const expected=new Map<string,number>();
   for(const card of cards)if(card.projectSlug==='real-analysis')
    expected.set(card.checkpointCode,(expected.get(card.checkpointCode)??0)+1);
   for(const cp of project.checkpoints)
    expect(cp.dueCards,'daily due for '+profile+' '+cp.code)
     .toBe(expected.get(cp.code)??0);
  });
 }
});
