import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// FIX #734: the screenshot matrix must not retain session, localStorage or
// service-worker state across independent profile/width captures. This is
// one fresh page per matrix, never a retry of a failed route or assertion.
const runner=readFileSync('scripts/review-shots.mjs','utf8');

describe('FIX #734 QA-4 screenshot matrix isolation',()=>{
 it('starts a fresh browser page for each theme/profile/width matrix',()=>{
  expect(runner).toContain('async function newCapturePhone(browser,width=390,height=844)');
  expect(runner).toContain('let phone=await newCapturePhone(browser)');
  expect(runner).toMatch(/for\(const \[width,height\] of \[\[360,780\],\[390,844\]\]\)\{\s*await phone\.close\(\);\s*phone=await newCapturePhone\(browser,width,height\);/);
 });
 it('preserves Atlas reset and all first-attempt screenshot readiness gates',()=>{
  expect(runner).toContain('await page.addInitScript');
  expect(runner).toContain("await phone.locator('#main-content').waitFor({state:'visible'})");
  expect(runner).toContain("await phone.getByRole('heading',{name:heading,level:1,exact:true}).waitFor({state:'visible'})");
  expect(runner).toContain("await phone.screenshot({path:join(dir,name+'.png'),animations:'disabled'})");
  expect(runner).toContain("await phone.screenshot({path:join(dir,name+'-full.png'),animations:'disabled',fullPage:true})");
  expect(runner).not.toMatch(/\bretry\b\s*\(/i);
 });
});
