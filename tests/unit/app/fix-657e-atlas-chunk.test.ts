import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #657e: Atlas is a large d3/outline module and must not be evaluated
// on cold Today. Direct Atlas links still start its chunk immediately.
const routes=readFileSync(new URL('../../../src/app/routes.tsx',import.meta.url),'utf8');
const entry=readFileSync(new URL('../../../src/main.tsx',import.meta.url),'utf8');

describe('cold entry Atlas route isolation',()=>{
 it('keeps Today and Paths eager but splits Atlas into a lazy route',()=>{
  expect(routes).toMatch(/import Page0 from ['"]\.\.\/features\/home\/Page['"]/);
  expect(routes).toMatch(/import Page1 from ['"]\.\.\/features\/projects\/Page['"]/);
  expect(routes).toMatch(/const Page13\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\.\/features\/atlas\/Page['"]\)\)/);
  expect(routes).not.toMatch(/import Page13 from/);
 });
 it('starts direct Atlas deep-link preload before mounting the root',()=>{
  expect(entry).toMatch(/window\.location\.hash\.startsWith\(['"]#\/atlas['"]\)/);
  const preload=entry.indexOf("import('./features/atlas/Page')");
  expect(preload).toBeGreaterThanOrEqual(0);
  expect(preload).toBeLessThan(entry.indexOf('createRoot('));
 });
});
