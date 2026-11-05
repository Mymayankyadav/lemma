import {describe,it,expect} from 'vitest';
import {boundedReminderItems} from '../../../src/features/review/reminder-queue';
import type {ReviewItem} from '../../../src/data/types';

const cards=Array.from({length:70},(_,i)=>({cardId:'card-'+i} as ReviewItem));

describe('notification Review round bounds',()=>{
 it('allows exactly 1 through 50 and never expands to the ordinary daily quota',()=>{
  expect(boundedReminderItems(cards,1)).toHaveLength(1);
  expect(boundedReminderItems(cards,50)).toHaveLength(50);
  expect(boundedReminderItems(cards,50)[49].cardId).toBe('card-49');
 });
 it('rejects unbounded, fractional or negative counts',()=>{
  for(const n of [0,-1,51,1.5,NaN,Infinity])
   expect(()=>boundedReminderItems(cards,n)).toThrow(RangeError);
 });
 it('does not repeat duplicate card ids',()=>{
  expect(boundedReminderItems([cards[0],cards[0],cards[1]],2).map(c=>c.cardId))
   .toEqual(['card-0','card-1']);
 });
 it('preserves the owner-scoped RPC order',()=>{
  expect(boundedReminderItems([cards[4],cards[2],cards[3]],2).map(c=>c.cardId))
   .toEqual(['card-4','card-2']);
 });
});
