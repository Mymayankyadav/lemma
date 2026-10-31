import {describe,expect,it} from 'vitest';
import {atlasRowAt,atlasRowHeight,buildAtlasRowGeometry} from '../../../src/features/atlas/rowGeometry';

describe('LOOK-4b Atlas variable row geometry',()=>{
 it('reserves 56px for fields and 44px for all other levels',()=>{
  expect(atlasRowHeight('cluster')).toBe(56);
  for(const level of ['galaxy','system','planet','moon'] as const)expect(atlasRowHeight(level)).toBe(44);
 });
 it('provides exact row centers and total height for wires and virtual windows',()=>{
  const geometry=buildAtlasRowGeometry(['cluster','galaxy','planet','cluster','moon']);
  expect(geometry.offsets).toEqual([0,56,100,144,200,244]);
  expect(geometry.centers).toEqual([28,78,122,172,222]);
  expect(geometry.totalHeight).toBe(244);
  for(let i=0;i<5;i++){
   expect(atlasRowAt(geometry.offsets,geometry.centers[i])).toBe(i);
   expect(atlasRowAt(geometry.offsets,geometry.offsets[i])).toBe(i);
  }
  expect(atlasRowAt(geometry.offsets,-10)).toBe(0);
  expect(atlasRowAt(geometry.offsets,999)).toBe(4);
 });
 it('handles empty and 2,500-row outlines without a linear scroll lookup',()=>{
  expect(atlasRowAt([0],10)).toBe(0);
  const geometry=buildAtlasRowGeometry(Array.from({length:2500},(_,i)=>i%500===0?'cluster':'planet'));
  expect(geometry.totalHeight).toBe(2500*44+5*12);
  expect(atlasRowAt(geometry.offsets,geometry.totalHeight-1)).toBe(2499);
 });
});
