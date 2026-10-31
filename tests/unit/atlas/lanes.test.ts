import {describe,expect,it} from 'vitest';
import type {Arc} from '../../../src/features/atlas/tree';
import {layoutAtlasLanes} from '../../../src/features/atlas/lanes';

const arc=(key:string,from:number,to:number):Arc=>({key,from,to,kind:'prereq',count:1,links:[]});

describe('LOOK-4c orthogonal Atlas lanes',()=>{
 it('draws rounded right-angle paths with a 9px lane grid',()=>{
  const result=layoutAtlasLanes([arc('long',0,9),arc('short',3,4)],Array.from({length:10},(_,i)=>i*44+22));
  for(const path of result.values()){
   expect(path.x).toBeGreaterThanOrEqual(20);
   expect(path.x).toBeLessThanOrEqual(74);
   expect((74-path.x)%9).toBe(0);
   expect(path.d).toContain(' Q');
   expect(path.d).not.toContain(' C');
  }
  expect(result.get('long')!.x).toBeGreaterThanOrEqual(result.get('short')!.x);
 });
 it('shares a trunk for links with a common endpoint',()=>{
  const paths=layoutAtlasLanes([arc('one',2,6),arc('two',2,8)],Array.from({length:10},(_,i)=>i*44+22));
  expect(paths.get('one')?.x).toBe(paths.get('two')?.x);
  expect(paths.get('one')?.fromY).toBe(paths.get('two')?.fromY);
 });
 it('is stable across paint order and supports variable field row centers',()=>{
  const arcs=[arc('a',0,5),arc('b',1,4),arc('c',3,6)];
  const centers=[28,78,122,166,210,254,298];
  const forward=layoutAtlasLanes(arcs,centers),reverse=layoutAtlasLanes([...arcs].reverse(),centers);
  expect([...forward].sort()).toEqual([...reverse].sort());
  expect(forward.get('a')?.fromY).toBe(28);
  expect(forward.get('a')?.toY).toBe(254);
 });
});
