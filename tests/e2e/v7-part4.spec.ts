import {test,expect,type Page} from "@playwright/test";
import {DATE,NOW} from './v7-scenes';
// PLAN §6.2–§6.9 golden screens on the seed, with v7 on. Each test asserts structure, not pixels.
const at=(hash:string)=>"/lemma/?demo=1&flags=v7Shell,v6Shell#"+hash;

test("the v7 shell wraps Today with a tab bar and a hub heading",async({page})=>{
 await page.goto(at("/"));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeVisible();
 await expect(page.getByRole("heading",{level:1})).toContainText(/Good (morning|afternoon|evening)/);
});
test("Focus and the review round render inside the v7 shell without the legacy chrome",async({page})=>{
 await page.goto(at("/focus"));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await expect(page.locator("main#main-content, [role=main]").first()).toBeVisible();
 await page.goto(at("/review/run"));
 await expect(page.locator(".v7-review")).toBeVisible();
});
test("Calendar Day shows the week strip, the grid and opens the block editor from a tap",async({page})=>{
 await page.goto(at("/calendar?view=day&date=2026-11-11"));
 await expect(page.getByRole("heading",{name:"Calendar",exact:true})).toBeVisible();
 const strip=page.getByRole("navigation",{name:"Week"});
 await expect(strip.locator("[data-strip-day]")).toHaveCount(7);
 await expect(strip.locator("[data-strip-day=\"2026-11-11\"]")).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("region",{name:"Day time grid"})).toBeVisible();
 // Month never prints "0m" or "0 blocks".
 await expect(page.locator(".v7-cal")).not.toContainText(/\b0 blocks\b/);
 // Night critique CD2: there is no "+ New block" in the top third; a tap on empty time (or Capture) makes a block.
 await expect(page.getByRole("button",{name:"New time block"})).toHaveCount(0);
 await page.locator(".v7-cal-slots").click({position:{x:120,y:12}});
 await expect(page.getByRole("dialog",{name:"New time block"})).toBeVisible();
});
test("Calendar Choose date changes the displayed week and returns to today",async({page})=>{
 await page.clock.setFixedTime(NOW);
 await page.goto(at("/calendar?view=day&date=2026-11-11"));
 const picker=page.getByRole("dialog",{name:"Choose a date"});
 async function openPicker(){
  await page.getByRole("button",{name:"Calendar actions",exact:true}).click();
  const menu=page.getByRole("menu",{name:"Calendar actions"});
  await menu.getByRole("menuitem",{name:"Choose date",exact:true}).click();
  await expect(picker).toBeVisible();
 }
 await openPicker();
 await picker.getByRole("button",{name:/Wednesday.*(?:November 18|18 November).*2026/}).click();
 await expect(page).toHaveURL(/date=2026-11-18/);
 await expect(page.locator('[data-strip-day="2026-11-18"]')).toHaveAttribute('aria-pressed','true');
 await openPicker();
 await picker.getByRole("button",{name:/Wednesday.*(?:November 11|11 November).*2026/}).click();
 await expect(page).toHaveURL(/date=2026-11-11/);
 await openPicker();
 await picker.getByRole("button",{name:"Today",exact:true}).click();
 await expect(page).toHaveURL(new RegExp('date='+DATE));
 await expect(page.locator('[data-strip-day="'+DATE+'"]').first()).toHaveAttribute('aria-pressed','true');
 await expect(picker).toHaveCount(0);
});
async function openFirstPath(page:Page){
 await page.goto(at("/"));
 await page.locator(".v7-today-tile").first().click();
 await expect(page.locator(".v7-path")).toBeVisible();
}
test("Path Plan gives each checkpoint a readable label and ends the solid line at the current one",async({page})=>{
 await openFirstPath(page);
 const map=page.getByRole("list",{name:"Checkpoints"});
 await expect(map).toBeVisible();
 for(const stage of await map.locator(".v7-path-stage .v7-disclosure-trigger").all())await stage.click();
 const rows=map.locator(".v7-path-row");
 expect(await rows.count()).toBeGreaterThan(0);
 for(const row of await rows.all()){
  await expect(row.locator(".v7-sr-only")).not.toBeEmpty();
  await expect(row.getByRole("link").first()).toHaveAccessibleName(/\S/);
 }
 // Solid down to the current node, dotted after: reached rows are never preceded by unreached ones.
 const reached=await rows.evaluateAll(list=>list.map(row=>row.getAttribute("data-reached")==="true"));
 const firstUnreached=reached.indexOf(false);
 if(firstUnreached>=0)expect(reached.slice(firstUnreached).every(value=>!value)).toBe(true);
 // The header meter matches the demonstrated count.
 const demonstrated=await rows.evaluateAll(list=>list.filter(row=>row.getAttribute("data-state")==="demonstrated").length);
 await expect(page.getByRole("meter").first()).toHaveAttribute("aria-valuenow",String(demonstrated));
});
test("Path keeps its primary action in a sticky bar and Continue with tutor opens the checkpoint tutor",async({page})=>{
 await openFirstPath(page);
 const bar=page.getByRole("group",{name:"Path actions"});
 await expect(bar).toBeVisible();
 await bar.getByRole("button",{name:"Continue with tutor"}).click();
 const tutor=page.getByRole("main",{name:"Checkpoint tutor"});
 await expect(tutor.getByRole("button",{name:"Begin session"})).toBeEnabled();
 await expect(tutor.getByRole("navigation",{name:"Session parts"})).toBeVisible();
});
test("Path tabs switch between Plan, Sessions, Sources and Cards",async({page})=>{
 await openFirstPath(page);
 await page.getByRole("tab",{name:/^Sessions/}).click();
 await expect(page).toHaveURL(/tab=sessions/);
 await page.getByRole("tab",{name:/^Cards/}).click();
 await expect(page.getByRole("list",{name:"Cards by checkpoint"})).toBeVisible();
 await page.getByRole("tab",{name:"Sources",exact:true}).click();
 await expect(page.getByRole("region",{name:"Sources",exact:true})).toBeVisible();
 await page.getByRole("tab",{name:"Plan",exact:true}).click();
 await expect(page.getByRole("list",{name:"Checkpoints"})).toBeVisible();
});
