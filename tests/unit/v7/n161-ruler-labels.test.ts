import {describe,expect,it} from 'vitest';
import {rulerLabelEvery,rulerTicks} from '../../../src/features/home/v7/Ruler';

// N161: Today's ruler labels ran into each other on a phone ("0:0002:0004:00…").
describe('N161 ruler label spacing',()=>{
 it('keeps every two hours when the labels fit, and widens by whole two-hour steps when they do not',()=>{
  expect(rulerLabelEvery(1000,[0,1440],39)).toBe(120);
  expect(rulerLabelEvery(320,[0,1440],39)).toBe(360);
  expect(rulerLabelEvery(320,[0,1440],62)).toBe(480);
  expect(rulerLabelEvery(120,[0,1440],62)).toBe(1440);
  for(const [width,label] of [[300,39],[330,48],[360,62],[280,70]] as const){
   const every=rulerLabelEvery(width,[0,1440],label);
   expect(every%120).toBe(0);
   const shown=rulerTicks([0,1440],every).filter(tick=>tick.label).length;
   // Two neighbouring labels, one flush with the edge, never touch: a step is at least 1.5 labels plus a 12 px gap.
   const step=width*every/1440;
   expect(step).toBeGreaterThanOrEqual(label*1.5+12);
   expect(shown).toBeGreaterThanOrEqual(2);
  }
 });
 it('labels only the chosen steps',()=>{
  expect(rulerTicks([0,1440],360).filter(tick=>tick.label).map(tick=>tick.label)).toEqual(['00:00','06:00','12:00','18:00','00:00']);
 });
});
