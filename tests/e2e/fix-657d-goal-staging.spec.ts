import {test,expect} from '@playwright/test';

// FIX #657d: secondary goals may wait until the first meaningful goal paints,
// but they must all become accessible without scrolling or a hidden timer.
test('large Today desk reveals every secondary goal after real first paint',async({page})=>{
 test.setTimeout(90_000);
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto('./?demo=extreme&theme=graph#/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-summary-goal]').first()).toBeVisible();
 await page.waitForFunction(()=>
  performance.getEntriesByName('lemma-stress-first-goal-paint','mark').length===1);
 await expect(page.locator('[data-summary-goal]')).toHaveCount(3);
 const compact=page.locator('[data-compact-goals]');
 await expect(compact).toBeAttached();
 await expect(compact.locator('[data-compact-goal]')).toHaveCount(3);
 const reveal=compact.getByRole('button',{name:/Show all \d+ projects/});
 const label=await reveal.textContent();
 const total=Number(label?.match(/\d+/)?.[0]);
 expect(total).toBeGreaterThan(3);
 await reveal.click();
 await expect(compact.locator('[data-compact-goal]')).toHaveCount(total);
 await expect(compact.getByRole('button',{name:'Show fewer'})).toBeVisible();
});
