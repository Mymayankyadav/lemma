import { expect, test } from "@playwright/test";

// The zero-forecast case is covered by the pure predicate's unit regression.
// These browser cases protect the positive forecast and its seven visible days
// across both high-density profiles and the two owner-approved worlds.
for (const profile of ["stress", "extreme"] as const)
for (const theme of ["graph", "graph-night"] as const)
for (const width of [360, 390] as const) {
  test(`LOOK-5c1 nonzero forecast ${profile} ${theme} ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`./?demo=${profile}&theme=${theme}#/`);
    const chart = page.getByLabel("Seven-day review forecast");
    await expect(chart).toBeVisible({ timeout: 90_000 });
    await expect(chart.locator(".grid > div")).toHaveCount(7);
    const dayCounts = await chart.locator('[aria-label$="cards due"]').count();
    expect(dayCounts).toBe(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await chart.screenshot({ path: `test-results/screens/look-5c1-${profile}-${theme}-${width}.png` });
  });
}
