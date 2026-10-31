import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

for (const theme of ["graph", "graph-night"] as const)
for (const width of [360, 390] as const) {
  test(`FIX #476 transcription edit previews valid and invalid LaTeX ${theme} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
    await page.goto(`/lemma/?demo=1&theme=${theme}#/p/real-analysis?tab=sources`);
    const sources = page.getByRole("region", { name: "Sources" });
    await sources.getByRole("button", { name: "View pages" }).first().click();
    const viewer = page.getByRole("region", { name: "Page transcription for Principles of Mathematical Analysis" });
    await expect(viewer.getByText("Demo source page 1.")).toBeVisible();
    await viewer.getByRole("button", { name: "Edit page" }).click();
    const editor = viewer.getByRole("textbox", { name: "Edit page transcription" });
    await editor.fill(String.raw`Prove $x^2+1>0$ and \(x\in\mathbb{R}\)`);
    const preview = viewer.getByRole("region", { name: "Math preview" });
    await expect(preview.locator(".katex")).toHaveCount(2);
    await editor.fill("Incomplete $x^2");
    await expect(viewer.getByRole("alert", { name: "Math preview" })).toContainText("Unclosed $");
    await expect(editor).toHaveValue("Incomplete $x^2");
    await expect(viewer.getByRole("button", { name: "Save page" })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    mkdirSync("test-results/screens/fix-476", { recursive: true });
    await page.screenshot({ path: `test-results/screens/fix-476/${theme}-${width}.png` });
  });
}
