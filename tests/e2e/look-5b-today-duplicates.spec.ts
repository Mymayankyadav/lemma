import { expect, test } from "@playwright/test";

// LOOK-5b: Goal Routes already expose the project destinations. Repeating
// those same projects below the tutor section wastes an entire phone screen.
for (const profile of ["stress", "extreme"] as const) {
  for (const theme of ["graph", "graph-night"] as const) {
    for (const width of [360, 390] as const) {
      test(`LOOK-5b one project list on Today: ${profile} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/`);
        const goals = page.getByRole("region", { name: "Distance to your goals" });
        await expect(goals).toBeVisible();
        const allPaths = goals.getByRole("link", { name: "All paths" });
        await expect(allPaths).toBeVisible();
        const navigationColor = await allPaths.evaluate((element) => getComputedStyle(element).color);
        const accentColor = await page.evaluate(() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--accent)";
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        });
        // Secondary navigation must not consume the red primary-action token.
        expect(navigationColor).not.toBe(accentColor);
        expect((await allPaths.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await expect(goals.getByRole("article", { name: /Goal progress for/ })).toHaveCount(3);
        await expect(page.getByRole("region", { name: "Projects", exact: true })).toHaveCount(0);
        await expect(page.getByRole("region", { name: "Continue" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width + 1);
        await page.screenshot({
          path: `test-results/screens/look-5b-today-${profile}-${theme}-${width}.png`,
          fullPage: true,
        });
      });
    }
  }
}
