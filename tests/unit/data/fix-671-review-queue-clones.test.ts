// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';
import type {QueueFilter} from '../../../src/data/types';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');
const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const adapter=(deferred:boolean)=>new DemoAdapter({fixture:makeStressStore(seed,'stress',
 deferred?{deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true}:{deferSessions:true}),
 ownedFixture:true,now:()=>now,timeZone:'UTC'});

describe('FIX #671 private stress Review-run queue first paint',()=>{
 it('matches eager due order and session/concept filters exactly',async()=>{
  const eager=adapter(false),lazy=adapter(true);
  for(const options of [filter,{...filter,sessionId:'stress-session-0-1'},
   {...filter,conceptSlug:'compactness'},{...filter,newOnly:true}]){
   expect(await lazy.getReviewItems(options)).toEqual(await eager.getReviewItems(options));
  }
 },30_000);
 it('does not clone thousands of read-only virtual card states before the final response clone',async()=>{
  const api=adapter(true);
  await api.getReviewItems(filter); // Warm fixture once; measure only repeat query work.
  const original=globalThis.structuredClone;
  let clones=0;
  globalThis.structuredClone=((value:unknown)=>{clones++;return original(value)}) as typeof structuredClone;
  let cards;
  try{cards=await api.getReviewItems(filter)}finally{globalThis.structuredClone=original}
  expect(cards.length).toBeGreaterThan(0);
  // Before the fix this is O(4,000) structuredClone calls in allItems/item.
  // The returned filtered array still receives one defensive clone.
  expect(clones).toBeLessThan(100);
  const before=cards[0].state.due;
  cards[0].state.due='1900-01-01T00:00:00Z';
  const again=await api.getReviewItems(filter);
  expect(again[0].state.due).toBe(before);
 },30_000);
});
