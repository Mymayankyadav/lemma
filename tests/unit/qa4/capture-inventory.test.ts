import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// QA-4: the optional screenshot matrix must match the owner-approved route
// inventory, including interaction states. A five-screen contact sheet is
// useful for a quick preview but is not the complete visual acceptance.
const guide=readFileSync('docs/design/v4/capture-routes.md','utf8');
const documented=[...guide.matchAll(/^\| ([a-z][a-z0-9-]*) \| `([^\x60]+)` \|/gm)]
 .map(([,name,route])=>({name,route}));
const scenes=JSON.parse(readFileSync('scripts/v4-capture-inventory.json','utf8')) as
 Array<{name:string;route:string;action?:string}>;

describe('QA-4 approved screenshot inventory',()=>{
 it('captures each documented scene exactly once with its canonical route',()=>{
  expect(scenes.map(({name,route})=>({name,route}))).toEqual(documented);
  expect(new Set(scenes.map(scene=>scene.name)).size).toBe(scenes.length);
 });
 it('captures interaction states rather than duplicate idle screenshots',()=>{
  const actions=Object.fromEntries(scenes.filter(scene=>scene.action).map(scene=>[scene.name,scene.action]));
  expect(actions).toEqual({
   'review-run-answer':'show-answer',
   'atlas-selected':'atlas-select',
   'atlas-details':'atlas-details',
   'atlas-all':'atlas-all',
  });
 });
 it('runs PR captures with a read-only token and isolates publishing to review branches',()=>{
  const workflow=readFileSync('.github/workflows/review-shots.yml','utf8');
  expect(workflow).toContain("  pull_request:");
  expect(workflow).toContain("  workflow_dispatch:");
  expect(workflow).toContain("  contents: read");
  expect(workflow).toContain("  publish:");
  expect(workflow).toContain("    if: github.event_name == 'push'");
  expect(workflow).toContain("      contents: write");
  expect(workflow).toContain("V4_MATRIX: ${{ github.event_name == 'push' && '0' || '1' }}");
  expect(workflow).toContain('npx tsx scripts/qa4-screens.ts');
 });
});
