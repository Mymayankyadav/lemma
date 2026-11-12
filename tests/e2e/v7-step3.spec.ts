import {test,expect} from "@playwright/test";
for(const mode of ["graph","graph-night"] as const){
 test("mathematical galleries and accessible charts work in "+mode,async({page})=>{
  await page.goto("/lemma/?demo=1&flags=v7Shell&theme="+mode+"#/kit");
  const art=page.getByRole("region",{name:"Icons and mathematical emblems"}).locator(".v7-split-panel").first();
  await expect(art.locator(".v7-emblem-choice")).toHaveCount(9);
  await expect(art.locator(".v7-emblem-stage .v7-emblem")).toBeVisible();
  const charts=page.getByRole("region",{name:"Data visualisation"}).locator(".v7-split-panel").first();
  const study=charts.locator(".v7-chart").filter({has:page.getByRole("heading",{name:"Study time"})});
  await study.getByRole("button",{name:/Mon: Analysis/}).focus();
  await page.keyboard.press("Enter");
  await expect(study.getByRole("status")).toContainText("Analysis");
  await study.getByRole("button",{name:"Show as table"}).click();
  await expect(study.getByRole("table")).toContainText("Algebra");
 });
}
test("reduced motion displays full mathematical emblems",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/lemma/?demo=1&flags=v7Shell#/kit");
 const emblem=page.locator(".v7-emblem").first();
 await expect(emblem).toBeVisible();
 expect(await emblem.locator("path").first().evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
});
