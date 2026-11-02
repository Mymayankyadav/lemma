import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX-655b regression-first: a mounted CP4 sheet is not necessarily painted.
// Keep the first-attempt CPU gate attached to actual visible sheet geometry.
const source=readFileSync('tests/e2e/fix-655-checkpoint-cold.spec.ts','utf8');

describe('FIX-655b checkpoint first-visible-paint timing',()=>{
 it('waits for two animation frames after real CP4 content is committed',()=>{
  expect(source).toMatch(/requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>/);
  expect(source).toContain("performance.mark('lemma-cp4-loaded')");
 });
 it('requires visible rendered geometry for the sheet and project backdrop',()=>{
  expect(source).toContain('getBoundingClientRect()');
  expect(source).toContain('getComputedStyle(');
  expect(source).toContain('Checkpoint progress');
  expect(source).toContain('Checkpoint steps');
 });
 it('waits for the asynchronous paint mark before reading readyMs',()=>{
  expect(source).toContain("page.waitForFunction(()=>performance.getEntriesByName('lemma-cp4-loaded','mark').length===1");
 });
 it('retains all eight no-retry 4x CPU cells and CP4 interaction contracts',()=>{
  for(const required of [
   'retries:0',"['stress','extreme']","['graph','graph-night']",'[390,360]',
   'Emulation.setCPUThrottlingRate','toBeLessThan(4000)',
   'Switch project','data-sheet-background','toBeLessThan(1500)',
  ])expect(source,required).toContain(required);
 });
});
