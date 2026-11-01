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
      const firstRow=choices.first().getByRole("button").first();
      await expect(firstRow).toBeVisible();
      expect((await firstRow.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const math=choices.locator(".katex").first();
      await expect(math).toBeVisible();
      expect(await math.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      const previews=choices.locator("[data-proposal-front-scroll]");
      await expect(previews.first()).toBeVisible();
      const overflowing=await previews.evaluateAll(nodes=>nodes.findIndex(el=>el.scrollWidth>el.clientWidth+1));
      expect(overflowing).toBeGreaterThanOrEqual(0);
      const preview=previews.nth(overflowing);
      await expect(preview.locator("..").locator("[data-proposal-front-cue]")).toBeVisible();
      const height=await preview.evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));
      expect(height.scroll).toBeLessThanOrEqual(height.client+1);
      const batchAction = groups.getByRole("button", { name: /Approve all from/ }).first();
      await expect(batchAction).toBeVisible();
      const primaryAction = page.getByRole("button", { name: "Approve card" });
      const batchColor = await batchAction.evaluate((element) => getComputedStyle(element).color);
      const primaryColor = await primaryAction.evaluate((element) => getComputedStyle(element).backgroundColor);
      // Batch is a quiet secondary action; red belongs to the current card's
      // primary Approve button, not every proposal-group control.
      expect(batchColor).not.toBe(primaryColor);
      expect((await batchAction.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `test-results/screens/look-8a-group-${theme}-${width}.png`,
        fullPage: true,
      });
    });
  }
}


// S/X must preserve a legible, horizontally revealable first line rather than
// clipping mathematical glyphs vertically. The stress fixture has hundreds of
// proposal rows, so test only the visible page and keep pagination intact.
for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const width of [360,390] as const){
 test(`LOOK-8a proposal fronts ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:844});
  await page.goto(`./?demo=${profile}&theme=${theme}#/proposals`);
  const groups=page.getByRole("region",{name:"Proposal groups"});
  const choices=groups.getByRole("group",{name:"Cards in this proposal group"});
  await expect(choices.first()).toBeVisible({timeout:90_000});
  const first=choices.first().getByRole("button").first();
  await expect(first).toBeVisible();
  const box=await first.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  const previews=choices.locator("[data-proposal-front-scroll]");
  await expect(previews.first()).toBeVisible();
  const metrics=await previews.evaluateAll(nodes=>nodes.map(el=>({
   height:el.clientHeight,scrollHeight:el.scrollHeight,
   math:[...el.querySelectorAll(".katex")].map(node=>parseFloat(getComputedStyle(node).fontSize)),
  })));
  expect(metrics.length).toBeGreaterThan(0);
  for(const item of metrics){
   expect(item.scrollHeight).toBeLessThanOrEqual(item.height+1);
   for(const size of item.math)expect(size).toBeGreaterThanOrEqual(16);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-8a-fronts-${profile}-${theme}-${width}.png`,fullPage:true});
 });
}
