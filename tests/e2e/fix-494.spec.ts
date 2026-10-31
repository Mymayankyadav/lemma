import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

for (const theme of ["graph", "graph-night"] as const) {
  for (const width of [360, 390] as const) {
    test(`FIX #494 bulk preview typesets card maths in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
      await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ body: "" }));
      await page.goto(`/lemma/?demo=1&theme=${theme}#/proposals`);
      const groups = page.getByRole("region", { name: "Proposal groups" });
      await groups.getByRole("button", { name: /Approve all from/ }).first().click();
      const dialog = page.getByRole("dialog", { name: /Approve .* from/ });
      await expect(dialog).toBeVisible();
      const preview = dialog.getByRole("list");
      await expect(preview.locator("li").first()).toContainText("Why must");
      // Demo proposal #1 contains $U_y$; the old raw-text preview has no KaTeX.
      await expect(preview.locator("li").first().locator(".katex")).toHaveCount(2);
      await expect(preview.locator("li").first().locator(".katex-html")).toBeVisible();
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
      }));
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      for (const name of ["Cancel", "Queue approvals"]) {
        const rect = await dialog.getByRole("button", { name, exact: true }).boundingBox();
        expect(rect, name).not.toBeNull();
        expect(rect!.height, name).toBeGreaterThanOrEqual(44);
      }
      mkdirSync("test-results/screens/fix-494", { recursive: true });
      await page.screenshot({ path: `test-results/screens/fix-494/${theme}-${width}.png`, fullPage: false });
    });
  }
}
