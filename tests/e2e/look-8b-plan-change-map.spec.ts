import {test,expect} from "@playwright/test";

test.beforeEach(async({page})=>{
 await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({body:""}));
 await page.route("https://fonts.gstatic.com/**",route=>route.fulfill({body:""}));
});

for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const width of [360,390] as const){
 test(`LOOK-8b changed-plan context ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:740});
  await page.goto(`./?demo=${profile}&theme=${theme}#/proposals/proposal-6`);
  await expect(page.getByRole("heading",{name:"Plan proposal"})).toBeVisible({timeout:90_000});
  const map=page.getByLabel("Checkpoint prerequisites");
  await expect(map.getByRole("group",{name:"Map of proposed checkpoints and prerequisites"})).toBeVisible();
  const changed=map.getByRole("button",{name:/^Select CP/});
  const full=page.getByRole("region",{name:"Checkpoints"}).getByRole("button",{name:/^Open CP/});
  await expect(full.first()).toBeVisible();
  // The proposal may load before the approved project plan. Wait for its
  // actual existing checkpoints instead of passing on a transient two-node map.
  await expect.poll(()=>full.count(),{timeout:90_000}).toBeGreaterThan(10);
  const shown=await changed.count(),total=await full.count();
  expect(shown).toBeGreaterThanOrEqual(3);
  expect(shown).toBeLessThan(total);
  await expect(map.getByRole("button",{name:/^Select CP4a /})).toBeVisible();
  await expect(map.getByRole("button",{name:/^Select CP5 /})).toBeVisible();
  await expect(page.locator("[data-change-map-count]")).toContainText(`${shown} of ${total} checkpoints shown`);
  await expect(page.getByRole("region",{name:"Ideas in this plan"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await map.screenshot({path:`test-results/screens/look-8b-${profile}-${theme}-${width}.png`});
  await map.getByRole("button",{name:/^Select CP4a /}).click();
  await expect(page.locator("[data-checkpoint-drawer='CP4a']")).toBeVisible();
 });
}
