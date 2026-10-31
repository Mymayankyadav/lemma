import {describe,expect,it} from 'vitest';
import {sessionCardSummary} from '../../../src/features/session/counts';

describe('LOOK-6a Session card count grammar',()=>{
 it('uses singular for exactly one card',()=>{
  expect(sessionCardSummary(1,0)).toBe('1 card · 0 waiting');
  expect(sessionCardSummary(1,1)).toBe('1 card · 1 waiting');
 });
 it('uses plural for zero, two and large rounds',()=>{
  expect(sessionCardSummary(0,0)).toBe('0 cards · 0 waiting');
  expect(sessionCardSummary(2,1)).toBe('2 cards · 1 waiting');
  expect(sessionCardSummary(100,30)).toBe('100 cards · 30 waiting');
 });
});
