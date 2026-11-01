import {expect,test} from "@playwright/test";

// FIX #712: a proposed change is not an active selection. The red pencil
// belongs only to the selected checkpoint and the primary Approve action.
for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const width of [360,390] as const){
 test(`FIX #712 plan map selection accent ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:740});
  await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({body:""}));
  await page.route("https://fonts.gstatic.com/**",route=>route.fulfill({body:""}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/proposals/proposal-6`);
  const map=page.getByLabel("Checkpoint prerequisites");
  const added=map.getByRole("button",{name:/^Select CP4a /});
  const updated=map.getByRole("button",{name:/^Select CP5 /});
  await expect(added).toBeVisible({timeout:90_000});
  await expect(updated).toBeVisible();
  await expect(page.locator("[data-checkpoint-drawer]")).toHaveCount(0);
  const visibleCircle=(node:typeof added)=>node.locator("circle").nth(1);
  // Existing prerequisite edges remain dashed. Changed nodes keep their
  // separate dashed/weighted distinction, but none is selected by default.
  const prerequisites=map.locator("line[stroke-dasharray='3 4']");
  expect(await prerequisites.count()).toBeGreaterThan(0);
  for(const edge of await prerequisites.all()){
   await expect(edge,"Passive prerequisite links must not use a red alias")
    .toHaveAttribute("stroke","var(--line)");
  }
  await expect(visibleCircle(added)).toHaveAttribute("stroke-dasharray","4 3");
  await expect(visibleCircle(updated)).toHaveAttribute("stroke-width","2");
  for(const node of await map.getByRole("button",{name:/^Select CP/}).all()){
   // A non-red alias is required: --amber-line-2 is red in both Graph
   // themes even though its literal attribute is not --amber.
   await expect(visibleCircle(node),"Every passive ring must be graphite/neutral, not a red alias")
    .toHaveAttribute("stroke",/^var\(--(?:ink-3|line)\)$/);
   const hit=await node.locator("circle").first().getAttribute("r");
   expect(Number(hit)*2,"Every map hit target remains at least 44px").toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await map.screenshot({path:`test-results/screens/fix-712-${profile}-${theme}-${width}-unselected.png`});
  await added.click();
  await expect(page.locator("[data-checkpoint-drawer='CP4a']")).toBeVisible();
  await expect(visibleCircle(added)).toHaveAttribute("stroke","var(--amber)");
  await expect(visibleCircle(updated)).not.toHaveAttribute("stroke","var(--amber)");
 });
}
