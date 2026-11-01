import {expect,test} from "@playwright/test";

// FIX #705: passive plan checkpoints are graphite, not repeated red-pencil
// marks. This checks the real S/X plan-change proposal in both Graph themes.
for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const width of [360,390] as const){
 test(`FIX #705 plan checkpoint accent budget ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:740});
  await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({body:""}));
  await page.route("https://fonts.gstatic.com/**",route=>route.fulfill({body:""}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/proposals/proposal-6`);
  const list=page.getByRole("region",{name:"Checkpoints"});
  const passive=["CP1","CP2","CP3"];
  for(const code of passive){
   const row=list.getByRole("button",{name:new RegExp(`^Open ${code} `)});
   await expect(row).toBeVisible({timeout:90_000});
   const pill=row.locator("span").first();
   await expect(pill,`${code} is not the selected checkpoint`).toHaveClass(/text-ink-3/);
   await expect(pill).not.toHaveClass(/text-amber/);
   const box=await row.boundingBox();
   expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  // Proposed amendment type labels are explanatory, not active actions.
  const add=page.getByText("Add",{exact:true}).first();
  await expect(add).toBeVisible();
  await expect(add).toHaveClass(/text-ink-3/);
  await expect(add).not.toHaveClass(/text-amber/);
  const changed=list.getByRole("button",{name:/^Open CP4a /});
  await expect(changed).toBeVisible();
  const changedPill=changed.locator("span").first();
  // An added checkpoint keeps its dashed outline without turning every
  // unselected code into an active selection.
  await expect(changedPill).toHaveClass(/border-dashed/);
  await expect(changedPill).toHaveClass(/text-ink-3/);
  await changed.click();
  await expect(page.locator("[data-checkpoint-drawer='CP4a']")).toBeVisible();
  await expect(changedPill).toHaveClass(/text-amber/);
  await expect(changedPill).not.toHaveClass(/text-ink-3/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/fix-705-${profile}-${theme}-${width}.png`});
 });
}
