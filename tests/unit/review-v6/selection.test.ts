import {describe,expect,it} from 'vitest';
import type {DeckNode,ReviewItem} from '../../../src/data/types';
import {defaultSelection,reviewBatch} from '../../../src/features/review/v6/selection';
const nodes=[{key:'project:proofs',label:'Proofs',due:5,children:[
 {key:'cp:proofs:C1',due:3,label:'C1',children:[]},
 {key:'cp:proofs:C2',due:2,label:'C2',children:[]}
]}] as unknown as DeckNode[];
const cards=[
 {cardId:'1',projectSlug:'proofs',checkpointCode:'C1'},
 {cardId:'2',projectSlug:'proofs',checkpointCode:'C2'},
 {cardId:'3',projectSlug:'proofs',checkpointCode:'C1'},
] as ReviewItem[];
describe('N30.1 selected batch counts',()=>{
 it('keeps all-due distinct from the exact quota-limited queue',()=>{
  const selection=defaultSelection(nodes);
  const selected=reviewBatch(nodes,cards,selection,2);
  expect(selected.allDue).toBe(5);
  expect(selected.eligible).toBe(3);
  expect(selected.batch.map(c=>c.cardId)).toEqual(['1','2']);
  expect(selected.batch).toHaveLength(2);
 });
 it('checkpoint selection cannot silently include unchecked decks',()=>{
  const selected=reviewBatch(nodes,cards,new Set(['cp:proofs:C2']),50);
  expect(selected.allDue).toBe(5);
  expect(selected.eligible).toBe(1);
  expect(selected.batch[0].cardId).toBe('2');
 });
 it('zero quota produces no queue, not a phantom start count',()=>{
  expect(reviewBatch(nodes,cards,defaultSelection(nodes),0).batch).toHaveLength(0);
  expect(reviewBatch(nodes,[],defaultSelection(nodes),20)).toMatchObject({allDue:5,eligible:0,batch:[]});
 });
});
