import {describe,expect,it} from 'vitest';
import {lengthFromParam,quickInput,quickStart,QUICK_LENGTHS,suggestionLabel} from '../../../src/features/calendar/v7/quickAddModel';

describe('v7 quick-add',()=>{
 it('offers three lengths and parses the len param strictly',()=>{
  expect([...QUICK_LENGTHS]).toEqual([25,50,90]);
  expect(lengthFromParam('45')).toBe(45);
  expect(lengthFromParam('4')).toBeNull();
  expect(lengthFromParam('601')).toBeNull();
  expect(lengthFromParam('1e2')).toBeNull();
  expect(lengthFromParam(null)).toBeNull();
 });
 it('uses the tapped slot when it is an absolute instant, else the next half hour',()=>{
  expect(quickStart('2026-11-11','UTC','2026-11-11T14:30:00Z')).toBe('2026-11-11T14:30:00.000Z');
  expect(quickStart('2026-11-11','UTC','2026-11-11T14:30:00',new Date('2026-11-11T10:10:00Z'))).toBe('2026-11-11T10:30:00.000Z');
  expect(quickStart('2026-11-12','UTC',null,new Date('2026-11-11T10:10:00Z'))).toBe('2026-11-12T09:00:00.000Z');
 });
 it('builds a block of the chosen length and links the task and path',()=>{
  const input=quickInput({title:' Proofs ',kind:'study',startsAt:'2026-11-11T14:30:00Z',minutes:50,zone:'UTC',projectId:'p1',taskId:'t1'});
  expect(input).toMatchObject({title:'Proofs',kind:'study',startsAt:'2026-11-11T14:30:00.000Z',endsAt:'2026-11-11T15:20:00.000Z',timeZone:'UTC',projectId:'p1',taskId:'t1'});
 });
 it('refuses an empty title and a too-short length',()=>{
  expect(()=>quickInput({title:'  ',kind:'busy',startsAt:'2026-11-11T14:30:00Z',minutes:50,zone:'UTC'})).toThrow(/title/i);
  expect(()=>quickInput({title:'x',kind:'busy',startsAt:'2026-11-11T14:30:00Z',minutes:2,zone:'UTC'})).toThrow(/length/i);
 });
 it('words the suggestion banner for one or many',()=>{
  expect(suggestionLabel(1)).toBe('1 suggested block');
  expect(suggestionLabel(3)).toBe('3 suggested blocks');
 });
});
