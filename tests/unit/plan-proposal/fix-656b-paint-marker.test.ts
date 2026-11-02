import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX-656b regression-first: DOM insertion is not first visible paint.
// A MutationObserver runs before the browser paints; the cold-route clock
// must be recorded after a frame boundary and only for visible real regions.
const source=readFileSync('tests/e2e/fix-656-proposal-cold.spec.ts','utf8');

describe('FIX-656b cold plan proposal first-visible-paint marker',()=>{
 it('waits for two animation frames after content appears',()=>{
  expect(source).toMatch(/requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>/);
  expect(source).toMatch(/performance\.mark\('lemma-proposal-loaded'\)/);
 });
 it('requires visible rendered geometry before marking ready',()=>{
  expect(source).toContain('getBoundingClientRect()');
  expect(source).toContain('getComputedStyle(');
 });
 it('preserves eight no-retry 4x CPU cells and the strict 1500ms budget',()=>{
  expect(source).toContain('retries:0');
  expect(source).toContain("['stress','extreme']");
  expect(source).toContain("['graph','graph-night']");
  expect(source).toContain('[390,360]');
  expect(source).toContain('Emulation.setCPUThrottlingRate');
  expect(source).toContain("toBeLessThan(1500)");
  expect(source).toContain('Plan errata');
  expect(source).toContain('Checkpoint prerequisites');
  expect(source).toContain('Ideas in this plan');
 });
});
