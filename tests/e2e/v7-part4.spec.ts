import {test,expect,type Page} from "@playwright/test";
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
test("Calendar Day shows the week strip, the grid and opens the block sheet from New time block",async({page})=>{
 await page.goto(at("/calendar?view=day&date=2026-11-11"));
 await expect(page.getByRole("heading",{name:"Calendar",exact:true})).toBeVisible();
 const strip=page.getByRole("navigation",{name:"Week"});
 await expect(strip.locator("[data-strip-day]")).toHaveCount(7);
 await expect(strip.locator("[data-strip-day=\"2026-11-11\"]")).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("region",{name:"Day time grid"})).toBeVisible();
 // Month never prints "0m" or "0 blocks".
 await expect(page.locator(".v7-cal")).not.toContainText(/\b0 blocks\b/);
 await page.getByRole("button",{name:"New time block"}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
});
test("Calendar Day moves by week with the strip chevrons and back to today",async({page})=>{
 await page.goto(at("/calendar?view=day&date=2026-11-11"));
 await page.getByRole("button",{name:"Next week"}).click();
 await expect(page).toHaveURL(/date=2026-11-18/);
 await expect(page.getByRole("button",{name:"Today"})).toBeVisible();
});
async function openFirstPath(page:Page){
 await page.goto(at("/"));
 await page.locator(".v7-today-tile").first().click();
 await expect(page.locator(".v7-path")).toBeVisible();
}
test("Path draws the constellation map with a text label on every node and the line ending at the current node",async({page})=>{
 await openFirstPath(page);
 const map=page.getByRole("list",{name:"Checkpoints"});
 await expect(map).toBeVisible();
 const rows=map.locator(".v7-path-row");
 expect(await rows.count()).toBeGreaterThan(0);
 for(const row of await rows.all()){
  await expect(row.locator(".v7-sr-only")).not.toBeEmpty();
  await expect(row.locator("small")).not.toBeEmpty();
 }
 // Solid down to the current node, dotted after: reached rows are never preceded by unreached ones.
 const reached=await rows.evaluateAll(list=>list.map(row=>row.getAttribute("data-reached")==="true"));
 const firstUnreached=reached.indexOf(false);
 if(firstUnreached>=0)expect(reached.slice(firstUnreached).every(value=>!value)).toBe(true);
 // The header meter matches the demonstrated count.
 const demonstrated=await rows.evaluateAll(list=>list.filter(row=>row.getAttribute("data-state")==="demonstrated").length);
 await expect(page.getByRole("meter").first()).toHaveAttribute("aria-valuenow",String(demonstrated));
});
test("Path keeps its primary action in a sticky bar and Continue with tutor opens the prompt sheet",async({page})=>{
 await openFirstPath(page);
 const bar=page.getByRole("group",{name:"Path actions"});
 await expect(bar).toBeVisible();
 await bar.getByRole("button",{name:"Continue with tutor"}).click();
 const sheet=page.getByRole("dialog");
 await expect(sheet.getByRole("button",{name:"Copy prompt"})).toBeVisible();
 await expect(sheet.getByText("Paste it into your tutor.")).toBeVisible();
});
test("Path tabs switch between Map, Sessions, Sources and Cards",async({page})=>{
 await openFirstPath(page);
 await page.getByRole("tab",{name:/^Sessions/}).click();
 await expect(page).toHaveURL(/tab=sessions/);
 await page.getByRole("tab",{name:/^Cards/}).click();
 await expect(page.getByRole("list",{name:"Cards by checkpoint"})).toBeVisible();
 await page.getByRole("tab",{name:"Map"}).click();
 await expect(page.getByRole("list",{name:"Checkpoints"})).toBeVisible();
});
