import {describe,expect,it,vi} from 'vitest';
import type {LemmaApi} from '../../../src/data/api';
import type {QueueFilter} from '../../../src/data/types';
import {prepareSessionNewRound} from '../../../src/features/review-done/newSession';
import {card,settings} from '../lib/fixtures';

const sessionFilter:QueueFilter={
 decks:[],sessionId:'session-7',conceptSlug:null,includeNew:true,newOnly:false,
};
describe('FIX #418: start a fresh new-only round after a session',()=>{
 it('fetches only eligible new session cards and replaces the finished queue',async()=>{
  const newCard=card('new',{state:{state:0}});
  const mature=card('mature',{state:{state:2}});
  const getReviewItems=vi.fn().mockResolvedValue([mature,newCard]);
  const initialize=vi.fn();
  const started=await prepareSessionNewRound(
   {getReviewItems} as Pick<LemmaApi,'getReviewItems'>,settings,sessionFilter,initialize,
  );
  expect(started).toBe(true);
  expect(getReviewItems).toHaveBeenCalledExactlyOnceWith({
   ...sessionFilter,includeNew:true,newOnly:true,
  });
  expect(initialize).toHaveBeenCalledExactlyOnceWith(
   [newCard],settings,{...sessionFilter,includeNew:true,newOnly:true},
  );
 });
 it('keeps the summary intact if the session has no new cards due',async()=>{
  const getReviewItems=vi.fn().mockResolvedValue([card('review')]);
  const initialize=vi.fn();
  expect(await prepareSessionNewRound(
   {getReviewItems} as Pick<LemmaApi,'getReviewItems'>,settings,sessionFilter,initialize,
  )).toBe(false);
  expect(initialize).not.toHaveBeenCalled();
 });
 it('does not load cards without a session filter',async()=>{
  const getReviewItems=vi.fn();
  const initialize=vi.fn();
  expect(await prepareSessionNewRound(
   {getReviewItems} as Pick<LemmaApi,'getReviewItems'>,settings,{...sessionFilter,sessionId:null},initialize,
  )).toBe(false);
  expect(getReviewItems).not.toHaveBeenCalled();
  expect(initialize).not.toHaveBeenCalled();
 });
 it('propagates read errors without changing the current review state',async()=>{
  const getReviewItems=vi.fn().mockRejectedValue(new Error('offline'));
  const initialize=vi.fn();
  await expect(prepareSessionNewRound(
   {getReviewItems} as Pick<LemmaApi,'getReviewItems'>,settings,sessionFilter,initialize,
  )).rejects.toThrow('offline');
  expect(initialize).not.toHaveBeenCalled();
 });
});
