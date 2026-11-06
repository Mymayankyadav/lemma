import {describe,it,expect} from 'vitest';
import {civilPracticeDate,nextPracticeDue,validateCadence} from '../../../src/data/practice-topics/cadence';
describe('N57.1 civil-day manual practice cadence, no FSRS coupling',()=>{
 it('shifts a fixed cadence across spring and fall DST, independent of elapsed hours',()=>{
  expect(nextPracticeDue('2026-03-28',4,{kind:'fixed_days',days:2})).toBe('2026-03-30');
  expect(nextPracticeDue('2026-10-24',1,{kind:'fixed_days',days:3})).toBe('2026-10-27');
 });
 it('uses the explicit delay per 1–4 rating, without reading FSRS cards',()=>{
  const c={kind:'after_rating' as const,daysByRating:[1,2,4,8] as [number,number,number,number]};
  for(const [rating,due] of [[1,'2026-11-07'],[2,'2026-11-08'],[3,'2026-11-10'],[4,'2026-11-14']] as const)
   expect(nextPracticeDue('2026-11-06',rating,c)).toBe(due);
 });
 it('handles leap years and year boundaries as dates, not timezone-dependent instants',()=>{
  expect(nextPracticeDue('2028-02-28',2,{kind:'fixed_days',days:1})).toBe('2028-02-29');
  expect(nextPracticeDue('2026-12-31',2,{kind:'fixed_days',days:1})).toBe('2027-01-01');
 });
 it('rejects fabricated civil dates and invalid rating values',()=>{
  for(const x of ['2026-02-30','2026-13-01','today','2026-11-6'])expect(()=>civilPracticeDate(x)).toThrow();
  expect(()=>nextPracticeDue('2026-11-06',0 as never,{kind:'fixed_days',days:1})).toThrow();
 });
 it('validates bounded whole-day delays and an exact 4-rating rule',()=>{
  for(const days of [0,-1,1.5,3651])expect(()=>validateCadence({kind:'fixed_days',days})).toThrow();
  expect(()=>validateCadence({kind:'after_rating',daysByRating:[1,2,3] as never})).toThrow();
  expect(()=>validateCadence({kind:'after_rating',daysByRating:[1,2,3,0]})).toThrow();
  expect(validateCadence({kind:'after_rating',daysByRating:[1,3,7,14]}))
   .toEqual({kind:'after_rating',daysByRating:[1,3,7,14]});
 });
});
