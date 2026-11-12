import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// Part 8 acceptance: PLAN §6.8, §6.9 (Checkpoint, Session) and §6.11 "Done when", on the audit seed with the clock frozen.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
async function open(page:Page,hash:string,size={width:390,height:844}){
 await page.setViewportSize(size);
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}

test("§6.8 Paths: three path cards in the first viewport, each with its emblem, subject and glyph",async({page})=>{
 await open(page,"/projects");
 const cards=page.locator(".v7-paths-card");
 await expect(cards).toHaveCount(3);
 for(const card of await cards.all()){
  const box=(await card.boundingBox())!;
  expect(box.y).toBeLessThan(844);
  await expect(card.locator(".v7-paths-cover svg").first()).toBeVisible();
  await expect(card.locator(".v7-paths-subject svg")).toHaveCount(1);
  expect(await card.locator(".v7-paths-cover").evaluate(node=>getComputedStyle(node).color)).not.toBe(await page.evaluate(()=>getComputedStyle(document.body).color));
 }
 await expect(page.getByRole("navigation",{name:"Paths sections"}).getByRole("link",{name:"Paths"})).toHaveAttribute("aria-current","page");
 expect(await page.locator("main").innerText()).not.toMatch(/project/i);
 await expect(page.getByRole("link",{name:"Start a new path"})).toBeVisible();
});

test("§6.8 Paths: search filters as you type and the status chips filter the list",async({page})=>{
 await open(page,"/projects");
 await page.getByRole("searchbox").fill("topol");
 await expect(page.locator(".v7-paths-card")).toHaveCount(1);
 await page.getByRole("searchbox").fill("");
 await page.getByRole("radio",{name:/^Archived/}).click();
 await expect(page.getByText(/No archived paths|No paths/)).toBeVisible();
});

test("§6.8 New path: the sheet creates a path that opens with a Tell your tutor card",async({page})=>{
 await open(page,"/projects/new");
 const sheet=page.getByRole("dialog",{name:"New path"});
 await expect(sheet.getByRole("textbox",{name:"Name"})).toBeFocused();
 await expect(sheet.getByRole("button",{name:"Create path"})).toBeDisabled();
 await sheet.getByRole("textbox",{name:"Name"}).fill("Abstract Algebra");
 await sheet.getByRole("button",{name:"Create path"}).click();
 await page.waitForURL(/#\/p\/[^?]+\?new=1/);
 await expect(page.getByRole("region",{name:"Tell your tutor"}).getByRole("button",{name:"Copy prompt"})).toBeVisible();
});

test("§6.9 Checkpoint and Session keep their primary action in a sticky bar at the bottom",async({page})=>{
 for(const [hash,name,label] of [["/p/real-analysis/cp/CP4","Checkpoint actions","Work on this with your tutor"],["/s/real-analysis/7","Session actions",/Start another session|Resume session/]] as const){
  await open(page,hash);
  const bar=page.getByRole("group",{name});
  await expect(bar.getByRole("button",{name:label})).toBeVisible();
  const box=(await bar.boundingBox())!;
  expect(box.y+box.height).toBeGreaterThan(844*.75);
  await page.mouse.wheel(0,2000);await page.waitForTimeout(200);
  expect((await bar.boundingBox())!.y).toBeCloseTo(box.y,0);
 }
});

test("§6.9 Checkpoint: the steps show done, current and later, and evidence is grouped by session",async({page})=>{
 await open(page,"/p/real-analysis/cp/CP4");
 const steps=page.getByRole("region",{name:"Steps"}).locator("li");
 await expect(steps.filter({has:page.locator('[aria-current="step"]')}).or(page.locator('li[aria-current="step"]'))).toHaveCount(1);
 await expect(page.locator('.v7-steps li[data-state="done"]').first()).toBeVisible();
 await expect(page.locator(".v7-evidence-label").first()).toHaveText(/^Session \d+ · \w{3} \d{1,2} \w{3,4}$/);
 await page.getByRole("button",{name:"More checkpoint actions"}).click();
 await expect(page.getByRole("menuitem",{name:"Demonstrate"})).toBeVisible();
 await expect(page.getByRole("menuitem",{name:"Defer"})).toBeVisible();
});

test("§6.11 Card: the recall chart has labelled axes, a legend and tap targets; history dates come from the formatter",async({page})=>{
 await open(page,"/cards/1");
 const chart=page.locator(".v7-recall");
 for(const label of ["0%","50%","100%"])await expect(chart.locator("text",{hasText:new RegExp("^"+label+"$")})).toHaveCount(1);
 await expect(chart.locator(".v7-recall-target-label")).toHaveText(/^target \d+%$/);
 await expect(chart.getByRole("list",{name:"Grades"}).getByRole("listitem")).toHaveText(["Again","Hard","Good","Easy"]);
 const hits=chart.locator(".v7-recall-hits button");
 expect(await hits.count()).toBeGreaterThan(1);
 const hit=(await hits.first().boundingBox())!;
 expect(Math.min(hit.width,hit.height)).toBeGreaterThanOrEqual(44);
 await hits.first().click();
 await expect(chart.locator(".v7-recall-picked")).toHaveText(/^\w{3} \d{1,2} \w{3,4} · (Again|Hard|Good|Easy)/);
 for(const row of await page.locator(".v7-card-history > span:first-child").allTextContents())expect(row).toMatch(/^\w{3} \d{1,2} \w{3,4}( \d{4})?$/);
 await expect(page.getByRole("group",{name:"Card actions"}).getByRole("button",{name:"Edit card"})).toBeVisible();
});

test("§6.11 Editor: the primary button stays visible with the keyboard open at 360 × 640",async({page})=>{
 await open(page,"/cards?new=1",{width:360,height:640});
 const sheet=page.getByRole("dialog",{name:"New card"});
 await sheet.getByRole("textbox",{name:"Front"}).click();
 // A software keyboard shrinks the visual viewport; emulate it by shrinking the layout viewport.
 await page.setViewportSize({width:360,height:340});
 await page.waitForTimeout(300);
 const button=sheet.getByRole("button",{name:"Create card"});
 const box=(await button.boundingBox())!;
 expect(box.y+box.height).toBeLessThanOrEqual(340);
 expect(box.y).toBeGreaterThanOrEqual(0);
 await sheet.getByRole("button",{name:"Insert fraction"}).click();
 await expect(sheet.getByRole("textbox",{name:"Front"})).toHaveValue("\\frac{}{}");
});

test("§6.11 Cards: Capture opens the editor and the library highlights Paths",async({page})=>{
 await open(page,"/cards");
 await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Paths"})).toHaveAttribute("aria-current","page");
 await page.getByRole("button",{name:"Capture",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"New card"})).toBeVisible();
});
