import { expect, test } from "@playwright/test";

// LOOK-8a: the project, not an internal session/checkpoint code, is the
// visible heading for each proposal group. The code remains available as
// secondary context and the maths preview remains selectable.
for (const theme of ["graph", "graph-night"] as const) {
  for (const width of [360, 390] as const) {
    test(`LOOK-8a titled proposal groups in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/lemma/?demo=1&theme=${theme}#/proposals`);
      const groups = page.getByRole("region", { name: "Proposal groups" });
      const group = groups.getByRole("heading", { name: "Real Analysis", exact: true }).first();
      await expect(group).toBeVisible();
      await expect(group.locator("..")).toContainText(/S\d+ \/ CP\d+/);
      await expect(groups.getByText("S12 / CP9 · 1 card", { exact: true })).toBeVisible();
      const choices = groups.getByRole("group", { name: "Cards in this proposal group" });
      await expect(choices.first().getByRole("button").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `test-results/screens/look-8a-group-${theme}-${width}.png`,
        fullPage: true,
      });
    });
  }
}
