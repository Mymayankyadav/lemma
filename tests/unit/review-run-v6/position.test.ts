import {describe,expect,it} from 'vitest';
import {summarizeDurableRun} from '../../../src/features/review-run/v6/position';

describe('N83 durable run position after reload',()=>{
 const cards=[
  {position:0,state:'graded' as const,reviewId:91},
  {position:1,state:'stale' as const,staleReason:'Card version changed'},
  {position:2,state:'pending' as const},
 ];
 it('counts server-backed grades and stale skips without replaying either',()=>{
  expect(summarizeDurableRun(cards,2)).toEqual({
   position:2,total:3,graded:1,skipped:1,remaining:1,done:false});
  expect(summarizeDurableRun(cards.map((x,i)=>i===2?
   {position:2,state:'graded' as const,reviewId:92}:x),3)).toMatchObject({
    position:3,total:3,graded:2,skipped:1,remaining:0,done:true});
 });
 it('rejects impossible positions and corrupt grades, rather than replaying a card',()=>{
  for(const input of [
   [cards,4],[cards,-1],
   [[cards[0],cards[0],cards[2]],2],
   [[{position:0,state:'graded' as const},cards[1],cards[2]],2],
   [[{position:0,state:'pending' as const},cards[1],cards[2]],2],
  ] as const)expect(()=>summarizeDurableRun(input[0],input[1])).toThrow();
 });
 it('empty durable runs finish at position zero',()=>{
  expect(summarizeDurableRun([],0)).toEqual({
   position:0,total:0,graded:0,skipped:0,remaining:0,done:true});
 });
});
