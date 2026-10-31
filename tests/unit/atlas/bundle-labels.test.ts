import {describe,expect,it} from 'vitest';
import {GUTTER,ROW,layoutBundleLabels} from '../../../src/features/atlas/Outline';
import type {Arc} from '../../../src/features/atlas/tree';

const arcs:Arc[]=[
 {key:'long-prereq',from:0,to:4,kind:'prereq',count:12,links:[]},
 {key:'short-prereq',from:1,to:3,kind:'prereq',count:18,links:[]},
 {key:'long-related',from:0,to:4,kind:'related',count:32,links:[]},
 {key:'reverse-prereq',from:4,to:0,kind:'prereq',count:15,links:[]},
 {key:'nearby',from:2,to:4,kind:'related',count:7,links:[]},
];

describe('FIX #483 Atlas bundle label placement',()=>{
 it('separates badges that have the same original midpoint',()=>{
  const positions=layoutBundleLabels(arcs,5);
  expect(positions.size).toBe(arcs.length);
  const labels=[...positions.values()];
  for(const label of labels){
   expect(label.x-label.radius).toBeGreaterThanOrEqual(0);
   expect(label.x+label.radius).toBeLessThanOrEqual(GUTTER);
   expect(label.y-label.radius).toBeGreaterThanOrEqual(0);
   expect(label.y+label.radius).toBeLessThanOrEqual(5*ROW);
  }
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j];
   const edgeGap=Math.hypot(a.x-b.x,a.y-b.y)-a.radius-b.radius;
   expect(edgeGap).toBeGreaterThanOrEqual(8-1e-6);
  }
 });
 it('is stable regardless of arc paint order and does not hide counts',()=>{
  const first=layoutBundleLabels(arcs,5);
  const reversed=layoutBundleLabels([...arcs].reverse(),5);
  expect([...first.entries()].sort()).toEqual([...reversed.entries()].sort());
  expect([...first.keys()].sort()).toEqual(arcs.map(arc=>arc.key).sort());
 });
});
