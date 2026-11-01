import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {layoutBundleLabels,OVERFLOW_BUNDLE_KEY} from '../../../src/features/atlas/Outline';
import type {Arc} from '../../../src/features/atlas/tree';

// FIX #647: the 60-arc first paint must not rescan every previously placed
// badge for every candidate position. The spatial index must preserve exact
// painted-edge clearance, overflow disclosure and deterministic placement.
const arcs:Arc[]=Array.from({length:96},(_,i)=>({
 key:'bundle-'+i,from:i%24,to:25+(i*7)%72,
 kind:i%3===0?'related':'prereq',count:2+i%41,links:[],
}));

describe('FIX #647 bounded badge collision search',()=>{
 it('indexes placed badges by vertical buckets rather than rescanning all placements',()=>{
  const source=readFileSync('src/features/atlas/Outline.tsx','utf8');
  expect(source).toContain('const placedByY=');
  expect(source).not.toContain('placed.every(');
 });
 it('keeps repeatable, nonoverlapping placements and a truthful overflow summary',()=>{
  const first=layoutBundleLabels(arcs,110);
  const second=layoutBundleLabels(arcs,110);
  expect([...first]).toEqual([...second]);
  const badges=[...first].filter(([key])=>key!==OVERFLOW_BUNDLE_KEY).map(([,value])=>value);
  for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++){
   const dx=badges[i].x-badges[j].x,dy=badges[i].y-badges[j].y;
   expect(dx*dx+dy*dy).toBeGreaterThanOrEqual((badges[i].radius+badges[j].radius+9)**2-1e-8);
  }
  const overflow=first.get(OVERFLOW_BUNDLE_KEY);
  if(overflow){
   expect(overflow.hiddenKeys?.length).toBeGreaterThan(0);
   for(const key of overflow.hiddenKeys??[])expect(first.has(key)).toBe(false);
  }
 });
});
