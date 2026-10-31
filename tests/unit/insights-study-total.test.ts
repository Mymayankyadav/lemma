import {describe,expect,it} from 'vitest';
import {compactStudyTotal} from '../../src/features/insights/study-total';

describe('FIX #579: compact but exact study duration',()=>{
 it('preserves exact days, hours and minutes for a 100x stress total',()=>{
  const minutes=1583*1440+8*60+17;
  const result=compactStudyTotal(minutes);
  expect(result.short).toBe('1.6k d');
  expect(result.exact).toBe('1 583 days, 8 hours, 17 minutes');
 });
 it('never rounds a visible day upward into a false exact total',()=>{
  expect(compactStudyTotal(999*1440+23*60).short).toBe('999 d');
  expect(compactStudyTotal(1000*1440).short).toBe('1k d');
 });
 it('handles sub-day, zero and invalid totals',()=>{
  expect(compactStudyTotal(125)).toEqual({short:'2 h',exact:'2 hours, 5 minutes'});
  expect(compactStudyTotal(0)).toEqual({short:'0 m',exact:'0 minutes'});
  expect(compactStudyTotal(Number.NaN)).toEqual({short:'—',exact:'Study time unavailable'});
 });
});
