import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { measureSvgMarks } from "../../scripts/stress-marks";

for (const theme of ["graph", "graph-night"] as const)
for (const width of [360, 390] as const) {
  test(`FIX #489 spatial SVG count-mark fixture ${theme} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
    await page.goto(`/lemma/?demo=1&theme=${theme}#/sign-in`);
    await page.evaluate(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = "stress-mark-fixture";
      svg.setAttribute("width", "300");
      svg.setAttribute("height", "100");
      svg.style.position = "fixed";
      svg.style.left = "0";
      svg.style.top = "0";
      svg.innerHTML = '<circle data-stress-mark cx="10" cy="10" r="3"/><circle data-stress-mark cx="200" cy="10" r="3"/><circle data-stress-mark cx="10" cy="10" r="3"/>';
      document.body.appendChild(svg);
    });
    expect(await page.evaluate(measureSvgMarks)).toBe(0);
    await page.evaluate(() => {
      document.getElementById("stress-mark-fixture")!.innerHTML =
        '<rect data-stress-mark x="10" y="10" width="20" height="8"/><rect data-stress-mark x="18" y="12" width="20" height="8"/>';
    });
    expect(await page.evaluate(measureSvgMarks)).toBe(0);
    await page.evaluate(() => {
      document.getElementById("stress-mark-fixture")!.innerHTML =
        '<circle data-stress-mark cx="10" cy="10" r="3"/><circle data-stress-mark cx="100" cy="10" r="3"/>';
    });
    expect(await page.evaluate(measureSvgMarks)).toBe(8);
    mkdirSync("test-results/screens/fix-489", { recursive: true });
    await page.screenshot({ path: `test-results/screens/fix-489/${theme}-${width}.png` });
  });
}
