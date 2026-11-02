import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// AUDIT QA-4 #737: a structurally valid Today PNG must not capture the
// transient Suspense/loading forecast while the 7-day review data is pending.
// This guard is deliberately regression-first; main has no Today readiness
// assertion between the exact route heading and screenshot.
const runner=readFileSync('scripts/review-shots.mjs','utf8');
const heading=runner.indexOf("await phone.getByRole('heading',{name:heading,level:1,exact:true}).waitFor({state:'visible'})");
const screenshot=runner.indexOf("await phone.screenshot({path:join(dir,name+'.png'),animations:'disabled'})");

describe('AUDIT QA-4 #737 data-backed Today screenshots',()=>{
 it('waits for all seven forecast bars after the Today route heading, before capture',()=>{
  const today=runner.indexOf("if(name==='today'){");
  expect(heading).toBeGreaterThan(0);
  expect(today).toBeGreaterThan(heading);
  expect(screenshot).toBeGreaterThan(today);
  const block=runner.slice(today,screenshot);
  expect(block).toContain("review.locator('[data-review-spark-bar]').first().waitFor({state:'visible'})");
  expect(block).toContain("if(bars!==7)throw Error(");
  expect(block).toContain('Loading forecast');
 });
 it('uses semantic readiness without sleeps, retries, or bypassing no-due Today',()=>{
  const today=runner.indexOf("if(name==='today'){");
  const block=runner.slice(today,screenshot);
  expect(block).toMatch(/if\(hasDue\)\{/);
  expect(block).not.toMatch(/waitForTimeout|setTimeout|\bretry\s*\(/i);
  expect(runner).toContain("await phone.locator('#main-content').waitFor({state:'visible'})");
  expect(runner).toContain("await phone.getByRole('heading',{name:heading,level:1,exact:true}).waitFor({state:'visible'})");
 });
});
