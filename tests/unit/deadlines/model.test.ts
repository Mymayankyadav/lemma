import {describe,it,expect} from 'vitest';
import {nextDeadlineStatus,validateDeadline,validateDeadlinePatch,validateDue} from '../../../src/data/deadlines/model';
const base={title:' Qualifying exam ',kind:'exam' as const,
 due:{kind:'date' as const,date:'2026-11-06'},remainingMinutes:90,estimateSource:'owner' as const};
describe('N56.1 deadline contract and distinct due semantics',()=>{
 it('keeps a civil date distinct from an instant, across timezone changes',()=>{
  expect(validateDeadline(base)).toMatchObject({title:'Qualifying exam',due:{kind:'date',date:'2026-11-06'}});
  expect(validateDue({kind:'instant',at:'2026-11-06T20:30:00+05:30'}))
   .toEqual({kind:'instant',at:'2026-11-06T15:00:00.000Z'});
  expect(validateDue({kind:'date',date:'2026-03-29'}))
   .toEqual({kind:'date',date:'2026-03-29'});
 });
 it('rejects impossible dates and ambiguous instant / date combinations',()=>{
  for(const value of [{kind:'date',date:'2026-02-30'},{kind:'instant',at:'2026-11-06T12:00:00'},
   {kind:'date',date:'2026-11-06',at:'2026-11-06T00:00:00Z'}]){
   expect(()=>validateDue(value as never)).toThrow();
  }
 });
 it('validates kinds, minutes, provenance, and linked identities',()=>{
  expect(()=>validateDeadline({...base,kind:'birthday' as never})).toThrow();
  expect(()=>validateDeadline({...base,remainingMinutes:-1})).toThrow();
  expect(()=>validateDeadline({...base,estimateSource:null})).toThrow();
  expect(()=>validateDeadline({...base,subjectId:'  '})).toThrow();
  expect(validateDeadline({...base,remainingMinutes:null,estimateSource:null}).remainingMinutes).toBeNull();
 });
 it('allows bounded partial updates without silently accepting unknown fields',()=>{
  expect(validateDeadlinePatch({due:{kind:'date',date:'2026-12-31'},title:' Exam '}))
   .toEqual({due:{kind:'date',date:'2026-12-31'},title:'Exam'});
  expect(()=>validateDeadlinePatch({unrecognized:true} as never)).toThrow();
  expect(()=>validateDeadlinePatch({remainingMinutes:3.2})).toThrow();
 });
 it('only permits valid lifecycle transitions',()=>{
  expect(nextDeadlineStatus('open','complete')).toBe('done');
  expect(nextDeadlineStatus('done','reopen')).toBe('open');
  expect(nextDeadlineStatus('open','cancel')).toBe('cancelled');
  expect(nextDeadlineStatus('cancelled','restore')).toBe('open');
  expect(()=>nextDeadlineStatus('cancelled','complete')).toThrow();
  expect(()=>nextDeadlineStatus('done','cancel')).toThrow();
 });
});
