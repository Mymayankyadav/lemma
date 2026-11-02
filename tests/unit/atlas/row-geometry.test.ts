import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {Wires} from '../../../src/features/atlas/Outline';
import type {Arc} from '../../../src/features/atlas/tree';
import {atlasRowAt,atlasRowGap,atlasRowHeight,buildAtlasRowGeometry} from '../../../src/features/atlas/rowGeometry';

describe('LOOK-4b Atlas variable row geometry',()=>{
 it('reserves 56px for fields and 44px for all other levels',()=>{
  expect(atlasRowHeight('cluster')).toBe(56);
  for(const level of ['galaxy','system','planet','moon'] as const)expect(atlasRowHeight(level)).toBe(44);
  expect(atlasRowGap('cluster')).toBe(8);
  expect(atlasRowGap('galaxy')).toBe(8);
  for(const level of ['system','planet','moon'] as const)expect(atlasRowGap(level)).toBe(0);
 });
 it('provides exact row centers and total height for wires and virtual windows',()=>{
  const geometry=buildAtlasRowGeometry(['cluster','galaxy','planet','cluster','moon']);
  expect(geometry.offsets).toEqual([0,64,116,160,224,268]);
  expect(geometry.centers).toEqual([36,94,138,196,246]);
  expect(geometry.totalHeight).toBe(268);
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
  expect(geometry.totalHeight).toBe(2500*44+5*12+5*8);
  expect(atlasRowAt(geometry.offsets,geometry.totalHeight-1)).toBe(2499);
 });
 it('anchors rendered dependency wires to actual variable-height row centers',()=>{
  const arcs:Arc[]=[{key:'a',from:0,to:2,kind:'prereq',count:1,links:[]}];
  const geometry=buildAtlasRowGeometry(['cluster','galaxy','planet']);
  const markup=renderToStaticMarkup(createElement(Wires,{
   arcs,rows:3,focus:null,centers:geometry.centers,heightPx:geometry.totalHeight,
  }));
  expect(markup).toContain('height="160"');
  // LOOK-4c replaces cubic arcs with rounded right-angle lanes. Preserve
  // the exact 56/44px physical centers while asserting the approved path.
  expect(markup).toContain('data-atlas-lane="83"');
  expect(markup).toContain('M 8 36 H');
  expect(markup).toContain(' Q 83 36 83 41');
  expect(markup).toContain(' V 133 Q 83 138');
  expect(markup).toContain(' H 8');
  expect(markup).not.toContain(' C');
 });
});
