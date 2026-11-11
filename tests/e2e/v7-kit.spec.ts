import {test,expect} from "@playwright/test";
const kit="/lemma/?demo=1&flags=v7Shell,v6Shell&mode=day#/kit";
test("the new v7 gallery shows Day and Night together, and four contrast modes",async({page})=>{
 await page.goto(kit);
 await expect(page.getByRole("heading",{name:"A little more clarity."})).toBeVisible();
 const intro=page.locator(".v7-kit-header .v7-intro"),themeToggle=page.locator(".v7-kit-header .v7-segmented");
 const introBox=await intro.boundingBox(),toggleBox=await themeToggle.boundingBox();
 expect(introBox).not.toBeNull();expect(toggleBox).not.toBeNull();
 expect(introBox!.y+introBox!.height).toBeLessThan(toggleBox!.y);
 await expect(page.getByRole("region",{name:"Principles"})).toBeVisible();
 const pair=page.getByRole("region",{name:"Tokens and typography"}).locator(".v7-split-panel");
 await expect(pair).toHaveCount(2);
 await expect(pair.nth(0)).toHaveAttribute("data-theme","graph");
 await expect(pair.nth(1)).toHaveAttribute("data-theme","graph-night");
 await expect(pair.nth(0).locator(".v7-token-card")).toHaveCount(50);
 await expect(pair.nth(0).locator(".v7-type-card")).toHaveCount(17);
 await page.getByRole("checkbox",{name:"High contrast comparison"}).check();
 await expect(pair.nth(0)).toHaveAttribute("data-contrast","high");
 await expect(pair.nth(1)).toHaveAttribute("data-contrast","high");
 await page.getByRole("checkbox",{name:"High contrast comparison"}).uncheck();
 await page.getByRole("radio",{name:"Night",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-theme","graph-night");
});
test("nine subject constructions and three levels appear in each mode",async({page})=>{
 await page.goto(kit);
 const art=page.getByRole("region",{name:"Icons and mathematical emblems"});
 const pair=art.locator(".v7-split-panel");
 await expect(pair).toHaveCount(2);
 for(const panel of [pair.nth(0),pair.nth(1)]){
  await expect(panel.locator(".v7-emblem-choice")).toHaveCount(9);
  await expect(panel.locator(".v7-emblem-choice .v7-mark-glyph")).toHaveCount(9);
  await expect(panel.locator(".v7-emblem-choice .v7-mark-tile")).toHaveCount(9);
  await expect(panel.locator(".v7-emblem-stage .v7-emblem")).toBeVisible();
  await panel.getByRole("button",{name:"Probability"}).click();
  await expect(panel.locator(".v7-emblem-stage")).toContainText("Probability");
  await expect(panel.locator(".v7-emblem-stage .v7-emblem path")).not.toHaveCount(0);
 }
});
test("time range, form states and controls are usable with keyboard",async({page})=>{
 await page.goto(kit);
 const controls=page.getByRole("region",{name:"Components and states"}).locator(".v7-split-panel").first();
 await expect(controls.getByRole("button",{name:"50 min",exact:true})).toHaveAttribute("aria-pressed","true");
 await controls.getByRole("button",{name:"25 min",exact:true}).click();
 await expect(controls.getByRole("button",{name:"25 min",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(controls.locator('.v7-time-input input').nth(1)).toHaveValue("09:25");
 await expect(controls.getByRole("textbox",{name:"Pinned theorem",exact:true})).toHaveAttribute("readonly","");
 await expect(controls.getByRole("switch",{name:/Session reminders/}).nth(1)).toBeDisabled();
 const menu=controls.getByRole("button",{name:"Open menu"});
 await menu.click();await expect(controls.getByRole("menu")).toBeVisible();
 await page.keyboard.press("Escape");await expect(controls.getByRole("menu")).toBeHidden();
});
test("progress and mathematical statements keep semantic completion",async({page})=>{
 await page.goto(kit);
 const patterns=page.getByRole("region",{name:"Patterns"}).locator(".v7-split-panel").first();
 await expect(patterns.getByRole("progressbar",{name:"Topology mastery"})).toHaveAttribute("aria-valuetext","Demonstrated");
 await expect(patterns.locator(".v7-constellation ol li")).toHaveCount(7);
 await expect(patterns.locator(".v7-statement-theorem .v7-qed")).toHaveText("∎");
 await patterns.getByRole("button",{name:/Open delete confirmation/}).click();
 const dialog=page.getByRole("dialog",{name:"Delete this session and its 12 cards?"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"Cancel"}).click();
 await expect(dialog).toBeHidden();
});
test("every chart has a summary, keyboard data and an equivalent table",async({page})=>{
 await page.goto(kit);
 const charts=page.getByRole("region",{name:"Data visualisation"}).locator(".v7-split-panel").first();
 await expect(charts.locator(".v7-chart")).toHaveCount(4);
 await expect(charts.locator(".v7-chart-summary")).toHaveCount(4);
 const study=charts.locator(".v7-chart").filter({has:page.getByRole("heading",{name:"Study time"})});
 const point=study.getByRole("button",{name:/Mon: Analysis/});
 await point.focus();await page.keyboard.press("Enter");
 await expect(study.getByRole("status")).toContainText("Analysis");
 await study.getByRole("button",{name:"Show as table"}).click();
 await expect(study.getByRole("table")).toContainText("2 h");
 const heat=charts.locator(".v7-chart").filter({has:page.getByRole("heading",{name:"Activity"})});
 await expect(heat.locator(".v7-heat-swatches span")).toHaveCount(5);
});
test("320px and 200% text remain readable without horizontal overflow",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 await page.goto(kit);
 await expect(page.getByRole("heading",{name:"A little more clarity."})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addStyleTag({content:"html { font-size:200%; }"});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("v7 flag isolation keeps the v6 shell available",async({page})=>{
 await page.goto(kit);
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 // Today is a v7 screen now; a route that has not been migrated keeps the v6 shell.
 await page.evaluate(()=>{location.hash="#/projects";});
 await expect(page.locator("html")).toHaveAttribute("data-v6","");
 await page.evaluate(()=>{location.hash="#/kit";});
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
});

