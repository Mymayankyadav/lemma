import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

for (const theme of ["graph", "graph-night"] as const)
for (const width of [360, 390] as const) {
  test(`FIX #492 active first PDF stays visible in 100-file queue ${theme} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
    await page.goto(`/lemma/?demo=1&theme=${theme}#/p/real-analysis?tab=sources`);
    const sources = page.getByRole("region", { name: "Sources" });
    await expect(sources).toBeVisible();
    // Keep the first PDF in the reading phase while the remaining 99 queue.
    // No network or PDF worker is needed for this visibility regression.
    await page.evaluate(() => {
      Object.defineProperty(crypto.subtle, "digest", {
        configurable: true,
        value: () => new Promise(() => {}),
      });
    });
    const files = Array.from({ length: 100 }, (_, i) => ({
      name: `batch-${String(i + 1).padStart(3, "0")}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\\n%fixture\\n"),
    }));
    await sources.locator('input[type="file"]').setInputFiles(files);
    const queue = sources.getByRole("list", { name: "Source upload queue" });
    const rows = queue.getByRole("listitem");
    await expect(rows.first()).toContainText("batch-001.pdf");
    await expect(rows.first().getByLabel("Upload status: reading")).toBeVisible();
    await expect(rows.first().getByRole("button", { name: "Cancel reading" })).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(21);
    await expect(queue).toContainText("batch-100.pdf");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    mkdirSync("test-results/screens/fix-492", { recursive: true });
    await page.screenshot({ path: `test-results/screens/fix-492/${theme}-${width}.png` });
    await rows.first().getByRole("button", { name: "Cancel reading" }).click();
    await expect(queue.getByText("batch-001.pdf")).toHaveCount(0);
  });
}
