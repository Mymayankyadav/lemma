import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOneShotReviewPrefetch} from '../../../src/features/review-run/preload';
import type {QueueFilter} from '../../../src/data/types';

const base:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

describe('FIX #651 cold direct Review-run prefetch',()=>{
 it('warms once, reuses the exact promise for the first matching query, then reads fresh',async()=>{
  const fetch=vi.fn(async()=>['real card']);
  const preload=createOneShotReviewPrefetch(fetch);
  preload.warm(base);
  preload.warm({...base,decks:[]});
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await preload.take({...base,decks:[]})).toEqual(['real card']);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await preload.take(base)).toEqual(['real card']);
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('does not substitute an unfiltered prefetch for a filtered review and never warms after a query',async()=>{
  const fetch=vi.fn(async(filter:QueueFilter)=>filter.conceptSlug);
  const preload=createOneShotReviewPrefetch(fetch);
  preload.warm(base);
  const filtered={...base,conceptSlug:'rings'};
  expect(await preload.take(filtered)).toBe('rings');
  preload.warm(base);
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('clears a failed warmup rather than caching its rejection',async()=>{
  let attempts=0;
  const fetch=vi.fn(async()=>{if(++attempts===1)throw Error('offline');return 'recovered'});
  const preload=createOneShotReviewPrefetch(fetch);
  preload.warm(base);
  // Let the rejected speculative promise's cleanup microtask settle.
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  expect(await preload.take(base)).toBe('recovered');
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('starts only for direct stress/extreme demo deep links, never live or other routes',()=>{
  const main=readFileSync('src/main.tsx','utf8');
  expect(main).toContain('warmReviewRun');
  expect(main).toContain("profile==='stress'||profile==='extreme'");
  expect(main).toContain("window.location.hash==='#/review/run'");
  expect(main).not.toContain('try{getApi()}');
 });
});
