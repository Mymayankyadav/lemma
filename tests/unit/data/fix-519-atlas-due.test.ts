// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';
import type {ReviewItem} from '../../../src/data/types';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');

describe('FIX #519: Atlas linked due-card counts without rich global queue',()=>{
 it('preserves the exact daily queue and concept due totals',async()=>{
  const api=new DemoAdapter({now:()=>now,timeZone:'UTC'});
  const selected=(api as unknown as {eligible:()=>ReviewItem[]}).eligible();
  const ids=new Set(selected.map(item=>item.cardId));
  const store=(api as unknown as {store:DemoStore}).store;
  const expected=new Map<string,number>();
  for(const note of store.notes)if(note.conceptId)
   for(const card of note.cards)if(ids.has(card.id))
    expected.set(note.conceptId,(expected.get(note.conceptId)??0)+1);
  const graph=await api.getAtlas();
  for(const concept of graph.concepts)
   expect(concept.dueCards).toBe(expected.get(concept.id)??0);
 });

 for(const profile of ['stress','extreme'] as const)
 it(`${profile} Atlas does not construct all rich card items to count linked cards`,async()=>{
  const fixture=makeStressStore(seed,profile,{deferSessions:true});
  expect(fixture.notes).toHaveLength(profile==='extreme'?30_000:5_000);
  const api=new DemoAdapter({fixture,now:()=>now,timeZone:'UTC'});
  const allItems=vi.spyOn(api as unknown as {allItems:()=>ReviewItem[]},'allItems');
  try{
   const graph=await api.getAtlas();
   expect(graph.concepts.length).toBeGreaterThan(profile==='extreme'?2_000:500);
   expect(graph.links.length).toBeGreaterThan(profile==='extreme'?7_000:1_000);
   expect(allItems).not.toHaveBeenCalled();
  }finally{allItems.mockRestore()}
 },30_000);
});
