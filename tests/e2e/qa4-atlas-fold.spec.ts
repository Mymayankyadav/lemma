import {expect,test} from "@playwright/test";

// FIX #707 / QA-4a: stress Atlas can start fully expanded. A screenshot of
// "All" must follow a genuine folded state, never an already-All no-op.
for(const theme of ["graph","graph-night"] as const)
for(const width of [360,390] as const){
 test(`QA-4a Atlas Fields→All changes visible rows ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:780});
  await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({body:""}));
  await page.route("https://fonts.gstatic.com/**",route=>route.fulfill({body:""}));
  await page.goto(`./?demo=stress&theme=${theme}#/atlas`);
  const group=page.getByRole("group",{name:"Fold to depth"});
  const fields=group.getByRole("button",{name:"Fields",exact:true});
  const all=group.getByRole("button",{name:"All",exact:true});
  const tree=page.locator("[data-atlas-row-count]");
  await expect(fields).toBeVisible({timeout:90_000});
  await fields.click();
  await expect(fields).toHaveAttribute("aria-pressed","true");
  const folded=Number(await tree.getAttribute("data-atlas-row-count"));
  expect(folded).toBeGreaterThan(0);
  await all.click();
  // Stress contains >300 ideas; the confirmation Sheet is lazy-loaded.
  // isVisible() immediately after click races its module import.
  const confirmation=page.getByRole("dialog",{name:"Unfold every idea?"});
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button",{name:"Unfold all"}).click();
  await expect(confirmation).toBeHidden();
  await expect(all).toHaveAttribute("aria-pressed","true");
  await expect.poll(async()=>Number(await tree.getAttribute("data-atlas-row-count")))
   .toBeGreaterThan(folded);
 });
}
