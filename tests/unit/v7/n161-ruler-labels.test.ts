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
 // Incident #1404: Today's window follows the clock, so a six-hour step could leave only 12:00 and 18:00 in a 14-hour window.
 it('never leaves fewer than three labels in a window that has room for three',()=>{
  const labels=(window:[number,number],every:number)=>rulerTicks(window,every).filter(tick=>tick.label).map(tick=>tick.label);
  expect(labels([600,1380],360)).toEqual(['10:00','16:00','22:00']);
  expect(labels([480,1320],360)).toEqual(['08:00','14:00','20:00']);
  // On the midnight grid when it already gives three or more, so the usual windows keep their usual labels.
  expect(labels([360,1440],360)).toEqual(['06:00','12:00','18:00','00:00']);
  expect(labels([480,1200],240)).toEqual(['08:00','12:00','16:00','20:00']);
  // No room for three: unchanged.
  expect(labels([600,900],360)).toEqual(['12:00']);
  for(let from=0;from<=720;from+=60)for(const every of [120,240,360,480]){
   const to=Math.min(1440,from+840);
   if(to-from>=2*every)expect(labels([from,to],every).length,'['+from+','+to+'] every '+every).toBeGreaterThanOrEqual(3);
  }
 });
});
