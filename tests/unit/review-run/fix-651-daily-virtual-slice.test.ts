// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import type {DemoStore,DemoNote} from '../../../src/data/demo/model';
import type {QueueFilter} from '../../../src/data/types';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');
const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
function make(profile:'stress'|'extreme',quota:number,deferred:boolean){
 const fixture=makeStressStore(seed,profile,deferred
  ?{deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true}
  :{deferSessions:true});
 fixture.settings.reviewsPerDay=quota;
 return new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
}
const virtualCount=(api:DemoAdapter)=>
 ((api as unknown as {virtualReviewNotes:DemoNote[]|null}).virtualReviewNotes??[]).length;

describe('FIX #651 private generated Review queue only hydrates daily share',()=>{
 it('matches eager S ordering, filters and returned-object isolation at 200/day',async()=>{
  const eager=make('stress',200,false),lazy=make('stress',200,true);
  const first=await lazy.getReviewItems(filter);
  expect(first).toEqual(await eager.getReviewItems(filter));
  expect(first).toHaveLength(200);
  expect(virtualCount(lazy)).toBe(200);
  for(const narrowed of [{...filter,sessionId:'stress-session-0-1'},
   {...filter,conceptSlug:'compactness'},{...filter,newOnly:true},
   {...filter,decks:['project:real-analysis']}]){
   expect(await lazy.getReviewItems(narrowed)).toEqual(await eager.getReviewItems(narrowed));
  }
  const due=first[0].state.due;
  first[0].state.due='1900-01-01T00:00:00Z';
  expect((await lazy.getReviewItems(filter))[0].state.due).toBe(due);
 },30_000);
 it('bounds X private note generation to a 200-card daily share, not 4000 backlog',async()=>{
  const api=make('extreme',200,true);
  expect(await api.getReviewItems(filter)).toHaveLength(200);
  expect(virtualCount(api)).toBe(200);
 },30_000);
 it('preserves explicit zero and raised daily quotas',async()=>{
  const zero=make('stress',0,true);
  expect(await zero.getReviewItems(filter)).toHaveLength(0);
  expect(virtualCount(zero)).toBe(0);
  const raised=make('stress',500,true);
  expect(await raised.getReviewItems(filter)).toHaveLength(500);
  expect(virtualCount(raised)).toBe(500);
 },30_000);
});
