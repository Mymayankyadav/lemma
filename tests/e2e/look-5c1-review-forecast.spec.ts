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
    // On a large desk the real forecast is deliberately deferred until it
    // enters view (or its accessible 44px reveal action is used). Test the
    // actual reading journey rather than expecting off-screen work to run.
    const forecast = page.locator("[data-forecast-on-demand]");
    await expect(forecast).toBeAttached({ timeout: 90_000 });
    // Read the optional reveal's hit target atomically before scrolling.
    // Scrolling triggers IntersectionObserver, which can unmount the button
    // between isVisible() and boundingBox(); that race is not a zero-height
    // target. When the button is present it must still meet the 44px budget.
    const revealHeight = await forecast.evaluate((container) => {
      const reveal = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Show seven-day forecast",
      );
      return reveal ? reveal.getBoundingClientRect().height : null;
    });
    if (revealHeight !== null) expect(revealHeight).toBeGreaterThanOrEqual(44);
    // The real user journey is scrolling to the below-fold forecast. The
    // observer may mount the chart before an explicit click is possible.
    await forecast.scrollIntoViewIfNeeded();
    const chart = forecast.getByLabel("Seven-day review forecast");
    await expect(chart).toBeVisible({ timeout: 90_000 });
    await expect(chart.locator(".grid > div")).toHaveCount(7);
    const dayCounts = await chart.locator('[aria-label$="cards due"]').count();
    expect(dayCounts).toBe(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await chart.screenshot({ path: `test-results/screens/look-5c1-${profile}-${theme}-${width}.png` });
  });
}
