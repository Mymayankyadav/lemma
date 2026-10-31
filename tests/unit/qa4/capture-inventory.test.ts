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
 it('keeps PR screenshot checks free of skipped write jobs and publishes only on review branches',()=>{
  const pr=readFileSync('.github/workflows/review-shots.yml','utf8');
  const publish=readFileSync('.github/workflows/review-shots-publish.yml','utf8');
  expect(pr).toContain('  pull_request:');
  expect(pr).toContain('  workflow_dispatch:');
  expect(pr).toContain("'scripts/qa4-screens.ts'");
  expect(pr).toContain("'tests/unit/qa4/**'");
  expect(pr).toContain('  contents: read');
  expect(pr).not.toMatch(/^  publish:/m);
  expect(pr).not.toContain('contents: write');
  expect(pr).not.toContain("branches: ['review/**']");
  expect(pr).toContain("V4_MATRIX: '1'");
  expect(pr).toContain('npx tsx scripts/qa4-screens.ts');
  expect(publish).toContain("branches: ['review/**']");
  expect(publish).toContain('  contents: write');
  expect(publish).toContain('    if: "!contains(github.event.head_commit.message, \'[shots]\')"');
  expect(publish).toContain('node scripts/review-shots.mjs');
  expect(publish).toContain('actions/upload-artifact@v4');
  expect(publish).toContain('name: v4-review-screens');
  expect(publish).toContain('git push');
  expect(publish).not.toContain('pull_request:');
 });
});
