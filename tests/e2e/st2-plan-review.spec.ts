import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

for (const theme of ["graph","graph-night"] as const)
for (const [width,height] of [[390,844],[360,740]] as const) {
  test(`ST-2 plan review remains navigable in ${theme} at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height});
    await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:""}));
    await page.goto(`/lemma/?demo=1&theme=${theme}#/proposals/proposal-6`);
    await expect(page.getByRole("heading",{name:"Plan proposal"})).toBeVisible();
    const map=page.getByLabel("Checkpoint prerequisites");
    await expect(map.getByRole("group",{name:"Map of proposed checkpoints and prerequisites"})).toBeVisible();
    // The owner's compact plan keeps its full dependency tree rather than stage folding.
    await expect(map.getByRole("button",{name:"Expand all"})).toHaveCount(0);
    const ideas=page.getByRole("region",{name:"Ideas in this plan"});
    await expect(ideas.getByRole("tree",{name:"Ideas in this plan"})).toBeVisible();
    const overflowing=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    expect(overflowing).toBe(false);
    const file=`test-results/screens/st2/plan-${theme}-${width}.png`;
    mkdirSync("test-results/screens/st2",{recursive:true});
    await map.screenshot({path:file});
    await map.getByRole("button",{name:/^Select CP/}).first().click();
    await expect(page.locator("[data-checkpoint-drawer]")).toBeVisible();
    await page.screenshot({path:`test-results/screens/st2/drawer-${theme}-${width}.png`});
  });
}
