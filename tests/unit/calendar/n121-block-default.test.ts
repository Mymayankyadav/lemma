import {describe,it,expect} from 'vitest';
import {suggestedBlockStart} from '../../../src/features/calendar/block-sheet/BlockSheet';
describe('N121 calendar block default',()=>{
 it('prefills the next half hour instead of an already passed morning time',()=>{
  expect(suggestedBlockStart('2026-11-09','Asia/Kolkata',new Date('2026-11-09T08:13:00Z')))
   .toBe('2026-11-09T14:00');
 });
 it('keeps a chosen future day at a predictable morning slot',()=>{
  expect(suggestedBlockStart('2026-11-10','Asia/Kolkata',new Date('2026-11-09T08:13:00Z')))
   .toBe('2026-11-10T09:00');
 });
});
