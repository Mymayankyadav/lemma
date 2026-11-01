// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');

describe('FIX-659f direct Project summary',()=>{
 it('does not enumerate every unrelated stress project to open one Project',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  // Capture the exact pre-optimization contract, including daily-limited
  // checkpoint card counts, session summaries and 100 per-project sources.
  const expected=await api.getProject('stress-project-3');
  expect(expected.sources).toHaveLength(100);
  const library=vi.spyOn(api,'listProjects').mockImplementation(()=>{
   throw Error('Direct Project must not build all 60 library summaries');
  });
  // getProject needs only the daily-limited counts, not thousands of fully
  // materialized ReviewItem objects (rich card text, subject glyph, state clones).
  // The existing queue assertion below guards the exact daily-cap semantics.
  const eligible=vi.spyOn(api as unknown as {eligible:()=>unknown},'eligible')
   .mockImplementation(()=>{throw Error('Direct Project must not hydrate ReviewItem queue');});
  const actual=await api.getProject('stress-project-3');
  eligible.mockRestore();
  expect(library).not.toHaveBeenCalled();
  expect(actual).toEqual(expected);
  // Project badge counts are the daily-limited queue, not the full backlog.
  const queue=await api.getReviewItems({decks:[],sessionId:null,conceptSlug:null,
   includeNew:true,newOnly:false});
  for(const cp of actual.checkpoints){
   const due=queue.filter(card=>card.projectSlug==='stress-project-3'&&card.checkpointCode===cp.code).length;
   expect(cp.dueCards,cp.code).toBe(due);
  }
  const store=(api as unknown as {store:DemoStore}).store;
  for(const key of ['notes','sources','concepts'] as const)
   expect(typeof Object.getOwnPropertyDescriptor(store,key)?.get).toBe('function');
 },30_000);

 it('retains the ordinary project progress and due-card contract',async()=>{
  const api=new DemoAdapter({now:()=>now,timeZone:'UTC'});
  const expected=await api.getProject('real-analysis');
  const actual=await api.getProject('real-analysis');
  expect(actual).toEqual(expected);
  const summary=(await api.listProjects()).find(p=>p.slug==='real-analysis')!;
  expect(actual.done).toBe(summary.done);
  expect(actual.total).toBe(summary.total);
  // The lightweight count path must also agree with the full queue for
  // ordinary authored data, not only the private synthetic stress fixture.
  const queue=await api.getReviewItems({decks:[],sessionId:null,conceptSlug:null,
   includeNew:true,newOnly:false});
  for(const cp of actual.checkpoints)
   expect(cp.dueCards,cp.code).toBe(queue.filter(card=>
    card.projectSlug==='real-analysis'&&card.checkpointCode===cp.code).length);
 },30_000);
});
