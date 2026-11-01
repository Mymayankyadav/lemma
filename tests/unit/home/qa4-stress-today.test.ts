import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

describe('FIX #614 QA-4 S-profile Today evidence',()=>{
 it('captures the large-project v4 Route after real data loads, not the Home shell',()=>{
  const capture=readFileSync(join(process.cwd(),'scripts/review-shots.mjs'),'utf8');
  expect(capture).toContain("for(const demo of ['1','stress'])");
  expect(capture).toContain("if(name==='today'&&demo==='stress')");
  expect(capture).toContain('[data-summary-goal][data-goal-card]');
  expect(capture).toContain('[data-route-track]');
  expect(capture).toContain('[data-goal-footnote]');
 });
});
