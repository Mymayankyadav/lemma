// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';
import type {QueueFilter} from '../../../src/data/types';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');
const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:false,newOnly:false};

describe('FIX #507: extreme Review queue concept indexing',()=>{
 it('does not clone 26,000 future-due card states before selecting the daily queue',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const cloned=vi.spyOn(globalThis,'structuredClone');
  try{
   const due=await api.getReviewItems({...filter});
   expect(due.length).toBeGreaterThan(0);
   expect(due.length).toBeLessThanOrEqual(200);
   const stateClones=cloned.mock.calls.filter(([value])=>value&&typeof value==='object'&&
    'due' in value&&'stability' in value&&'state' in value).length;
   // The 30k-card fixture has 4k overdue cards. Future cards must not be
   // cloned into ReviewItems just to be discarded by dueToday().
   expect(stateClones).toBeLessThan(6000);
  }finally{cloned.mockRestore()}
 },30_000);

 it('does not rescan 2,500 concepts for each of 30,000 cards',async()=>{
  const fixture=makeStressStore(seed,'extreme',{deferSessions:true});
  // Preserve a genuine concept-filtered card alongside the ordinary backlog.
  fixture.notes[0].conceptId=fixture.concepts[0].id;
  const slug=fixture.concepts[0].slug;
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const concepts=(api as unknown as {store:DemoStore}).store.concepts;
  const find=vi.spyOn(concepts,'find');
  try{
   const due=await api.getReviewItems({...filter});
   expect(due.length).toBeGreaterThan(0);
   expect(due.length).toBeLessThanOrEqual(200);
   const matching=await api.getReviewItems({...filter,conceptSlug:slug});
   expect(matching.map(item=>item.cardId)).toContain('stress-card-1');
   // A map built once per call is O(concepts + cards), not 30k * 2.5k.
   expect(find).not.toHaveBeenCalled();
  }finally{find.mockRestore()}
 },30_000);

 it('keeps 30k synthetic notes and 2.5k Atlas ideas deferred for a bounded Review queue',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const deferred=(key:'notes'|'concepts'|'sources')=>
   typeof Object.getOwnPropertyDescriptor(store,key)?.get==='function';
  expect(deferred('notes')).toBe(true);
  expect(deferred('concepts')).toBe(true);
  expect(deferred('sources')).toBe(true);
  const due=await api.getReviewItems({...filter});
  expect(due).toHaveLength(200);
  expect(due.every(item=>item.cardId.startsWith('stress-card-'))).toBe(true);
  // Review needs only today's bounded cards, not 30k future cards or Atlas.
  expect(deferred('notes')).toBe(true);
  expect(deferred('concepts')).toBe(true);
  expect(deferred('sources')).toBe(true);
 },30_000);

 it('matches the eager stress Review queue exactly, including note metadata',async()=>{
  const eager=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const lazy=new DemoAdapter({fixture:makeStressStore(seed,'stress',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const expected=await eager.getReviewItems({...filter});
  const actual=await lazy.getReviewItems({...filter});
  expect(actual).toEqual(expected);
  expect(actual.length).toBeGreaterThan(0);
  const store=(lazy as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function');
 },30_000);
});
