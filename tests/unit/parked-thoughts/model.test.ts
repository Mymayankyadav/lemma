import {describe,it,expect} from 'vitest';
import {thoughtTransition,validateNewThought,validateThoughtPatch} from '../../../src/data/parked-thoughts/model';
const open={status:'open' as const,destinationKind:null,destinationId:null,resolvedAt:null};
const at='2026-11-06T10:00:00+05:30';
describe('N58.1 typed parked thoughts and atomic destination contract',()=>{
 it('allows a private thought without fabricating a task or a study-entry link',()=>{
  expect(validateNewThought({text:' Recall proof idea '})).toEqual({text:'Recall proof idea'});
  expect(validateNewThought({text:'Try lemma',studyEntryId:null})).toEqual({text:'Try lemma',studyEntryId:null});
 });
 it('allows safe text edits but rejects an injected destination or owner field',()=>{
  expect(validateThoughtPatch({text:' Improve proof '})).toEqual({text:'Improve proof'});
  expect(()=>validateThoughtPatch({destinationId:'fake'} as never)).toThrow();
  expect(()=>validateNewThought({text:'thought',userId:'owner'} as never)).toThrow();
  expect(()=>validateNewThought({text:' '})).toThrow();
 });
 it('dismisses with an actual resolution time, and reopening restores open invariants',()=>{
  const dismissed=thoughtTransition(open,'dismiss',at);
  expect(dismissed).toEqual({status:'dismissed',resolvedAt:'2026-11-06T04:30:00.000Z',
   destinationKind:null,destinationId:null});
  expect(thoughtTransition(dismissed,'reopen')).toEqual(open);
 });
 it('only converts using a real task ID in the same receipt',()=>{
  const converted=thoughtTransition(open,'convert',at,'task-123');
  expect(converted).toMatchObject({status:'converted',destinationKind:'task',destinationId:'task-123'});
  expect(()=>thoughtTransition(open,'convert',at,null)).toThrow();
  expect(()=>thoughtTransition(converted,'reopen')).toThrow();
  expect(()=>thoughtTransition(converted,'convert',at,'task-again')).toThrow();
 });
 it('prevents terminal-state edits and invalid resolution instants',()=>{
  expect(()=>thoughtTransition(open,'dismiss','not a time')).toThrow();
  expect(()=>thoughtTransition(open,'reopen')).toThrow();
  expect(()=>thoughtTransition(thoughtTransition(open,'dismiss',at),'dismiss',at)).toThrow();
 });
});
