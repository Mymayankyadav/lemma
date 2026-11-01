import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildAtlasRowGeometry} from '../../../src/features/atlas/rowGeometry';
import type {Arc} from '../../../src/features/atlas/tree';
import {layoutAtlasLanes} from '../../../src/features/atlas/lanes';

const arc=(key:string,from:number,to:number):Arc=>({key,from,to,kind:'prereq',count:1,links:[]});

describe('LOOK-4c orthogonal Atlas lanes',()=>{
 it('draws rounded right-angle paths with a 9px lane grid',()=>{
  const result=layoutAtlasLanes([arc('long',0,9),arc('short',3,4)],Array.from({length:10},(_,i)=>i*44+22));
  for(const path of result.values()){
   expect(path.x).toBeGreaterThanOrEqual(20);
   expect(path.x).toBeLessThanOrEqual(83);
   expect((83-path.x)%9).toBe(0);
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
 it('assigns the outer lane to the physically longer span when row heights vary',()=>{
  // Three short rows can be physically closer than two rows separated by a
  // tall folded field; compare actual centers rather than row-index distance.
  const centers=[0,30,60,70,400,430];
  const paths=layoutAtlasLanes([arc('three-rows',0,3),arc('two-rows',2,4)],centers);
  expect(paths.get('two-rows')?.x).toBe(83);
  expect(paths.get('three-rows')?.x).toBe(74);
 });
 it('draws eight unrelated overlapping intervals on eight 9px lanes',()=>{
  const arcs=Array.from({length:8},(_,i)=>arc('dense-'+i,i,i+8));
  const centers=Array.from({length:16},(_,i)=>i*44+22);
  const result=layoutAtlasLanes(arcs,centers);
  expect(result.size).toBe(8);
  expect(new Set([...result.values()].map(lane=>lane.x)).size).toBe(8);
  expect(result.has('dense-7')).toBe(true);
 });
 it('prioritizes a selected shortest chain link when capacity is exhausted',()=>{
  const arcs=Array.from({length:9},(_,i)=>arc('dense-'+i,i,i+9));
  const centers=Array.from({length:18},(_,i)=>i*44+22);
  const selected=new Set(['dense-8']);
  const result=layoutAtlasLanes(arcs,centers,selected);
  expect(result.size).toBe(8);
  expect(result.has('dense-8')).toBe(true);
  // No selected link may be dropped merely because an unrelated link was
  // physically longer; a genuinely over-capacity selected chain still needs
  // a separate spec resolution, never a false Ready-to-merge claim.
  expect(result.has('dense-7')).toBe(false);
 });
 it('allows a shared endpoint trunk but not an unrelated overlap on its track',()=>{
  const arcs=[arc('a',0,9),arc('b',0,8),arc('c',1,10)];
  const result=layoutAtlasLanes(arcs);
  expect(result.get('a')?.x).toBe(result.get('b')?.x);
  expect(result.get('c')?.x).not.toBe(result.get('a')?.x);
 });
 it('is stable across paint order and supports variable field row centers',()=>{
  const arcs=[arc('a',0,5),arc('b',1,4),arc('c',3,6)];
  const centers=[28,78,122,166,210,254,298];
  const forward=layoutAtlasLanes(arcs,centers),reverse=layoutAtlasLanes([...arcs].reverse(),centers);
  expect([...forward].sort()).toEqual([...reverse].sort());
  expect(forward.get('a')?.fromY).toBe(28);
  expect(forward.get('a')?.toY).toBe(254);
 });

 it('uses the same variable-height row centers for embedded plan-review IdeaGraph wires',()=>{
  const geometry=buildAtlasRowGeometry(['cluster','galaxy','planet']);
  const lane=layoutAtlasLanes([arc('plan-prerequisite',0,2)],geometry.centers).get('plan-prerequisite')!;
  expect(lane.fromY).toBe(geometry.centers[0]);
  expect(lane.toY).toBe(geometry.centers[2]);
  expect(geometry.centers[0]).not.toBe(22);
  const source=readFileSync(join(process.cwd(),'src/features/atlas/IdeaGraph.tsx'),'utf8');
  expect(source).toContain('buildAtlasRowGeometry');
  expect(source).toContain('centers={geometry.centers}');
  expect(source).toContain('heightPx={geometry.totalHeight}');
 });
});
