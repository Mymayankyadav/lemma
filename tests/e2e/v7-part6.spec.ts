import {test,expect} from "@playwright/test";
// PLAN §6.1 F/G and §6.4 A, with v7 on. Structure and behaviour, not pixels.
const at=(hash:string)=>"/lemma/?demo=1&flags=v7Shell,v6Shell#"+hash;

test("Capture reads a time block out of one sentence and saves it with Undo",async({page})=>{
 await page.goto(at("/"));
 await page.getByRole("button",{name:"Capture",exact:true}).click();
 const field=page.getByRole("textbox",{name:"What do you want to add?"});
 await expect(field).toBeFocused();
 await field.fill("Rudin ch 4 tomorrow 4pm 90m");
 await expect(page.getByRole("radio",{name:"Time block"})).toHaveAttribute("aria-checked","true");
 await expect(page.getByRole("list",{name:"Recognised"}).getByRole("button")).toHaveCount(3);
 // A recognised token can be removed and goes back to the title.
 await page.getByRole("button",{name:"Remove 16:00"}).click();
 await expect(page.getByRole("list",{name:"Recognised"}).getByRole("button")).toHaveCount(2);
 await page.getByRole("button",{name:"Add block"}).click();
 await expect(page.getByRole("button",{name:"Undo"})).toBeVisible();
});
test("Capture falls back to a task for plain text",async({page})=>{
 await page.goto(at("/"));
 await page.getByRole("button",{name:"Capture",exact:true}).click();
 await page.getByRole("textbox",{name:"What do you want to add?"}).fill("Buy a notebook");
 await expect(page.getByRole("radio",{name:"Task"})).toHaveAttribute("aria-checked","true");
 await expect(page.getByRole("button",{name:"Add task"})).toBeEnabled();
});
test("Search lists Recent and Actions before typing and groups results while typing",async({page})=>{
 await page.goto(at("/"));
 await page.getByRole("button",{name:"Search",exact:true}).click();
 const field=page.getByRole("combobox",{name:"Search"});
 await expect(field).toBeFocused();
 await expect(page.getByRole("region",{name:"Actions"})).toBeVisible();
 await field.fill("a");
 const groups=page.locator(".v7-search-group");
 expect(await groups.count()).toBeGreaterThan(0);
 for(const group of await groups.all())expect(await group.getByRole("option").count()).toBeLessThanOrEqual(4);
 await field.press("Enter");
 await expect(page.getByRole("combobox",{name:"Search"})).toBeHidden();
});
test("Review hub shows one count, one primary button, the forecast and memory tiles",async({page})=>{
 await page.goto(at("/review"));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await expect(page.getByRole("heading",{level:1,name:"Review"})).toBeVisible();
 await expect(page.getByLabel("Cards in this round")).toBeVisible();
 await expect(page.getByRole("button",{name:/^(Start \d+ cards|Resume)/}).first()).toBeVisible();
 await expect(page.getByRole("region",{name:"Due each day"})).toBeVisible();
 await expect(page.getByRole("region",{name:"Memory, last 30 days"})).toBeVisible();
 await page.getByRole("button",{name:"Customise this round"}).click();
 await expect(page.getByRole("dialog",{name:"Customise this round"})).toBeVisible();
});
test("Review hub subject bar narrows the round and updates the count",async({page})=>{
 await page.goto(at("/review"));
 const bar=page.getByRole("group",{name:"Subjects in this round"});
 await expect(bar).toBeVisible();
 const total=Number(await page.getByLabel("Cards in this round").textContent());
 const segments=bar.getByRole("button");
 if(await segments.count()>1){
  await segments.first().click();
  await expect(segments.first()).toHaveAttribute("aria-pressed","true");
  expect(Number(await page.getByLabel("Cards in this round").textContent())).toBeLessThanOrEqual(total);
 }
});
test("Round complete without a saved run keeps the existing results page",async({page})=>{
 await page.goto(at("/review/done"));
 await expect(page.locator(".v7-rc")).toHaveCount(0);
});
test("Path More menu pauses a path and its Cards tab lists cards; Review N opens the hub for that path",async({page})=>{
 await page.goto(at("/"));
 await page.locator(".v7-today-tile").first().click();
 await expect(page.locator(".v7-path")).toBeVisible();
 await page.getByRole("button",{name:"More"}).click();
 await page.getByRole("menuitem",{name:"Pause path"}).click();
 await expect(page.locator(".v7-path-chips")).toContainText("Paused");
 await page.getByRole("tab",{name:/^Cards/}).click();
 await expect(page.getByRole("list",{name:"Cards on this path"})).toBeVisible();
 await page.getByRole("group",{name:"Path actions"}).getByRole("link",{name:/^Review/}).click();
 await expect(page).toHaveURL(/#\/review\?path=/);
 await expect(page.getByLabel("Cards in this round")).toBeVisible();
});
test("Practice shows a card per topic and records practice from a sheet",async({page})=>{
 await page.goto(at("/practice"));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await expect(page.getByRole("heading",{level:1,name:"Practice"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:/Review/})).toHaveAttribute("aria-current","page");
 const first=page.getByRole("list",{name:"Practice topics"}).getByRole("listitem").first();
 if(await first.count()===0)return;
 await first.getByRole("button",{name:/^Practice /}).click();
 const sheet=page.getByRole("dialog");
 await expect(sheet.getByRole("radiogroup",{name:"How did it go?"}).getByRole("radio")).toHaveCount(4);
 await sheet.getByRole("radio",{name:"Good"}).click();
 await sheet.getByRole("button",{name:"Save"}).click();
 await expect(page.getByRole("dialog")).toBeHidden();
});

// Part 7a: Tasks.
test("Tasks groups To do into cards and completing a task offers Undo",async({page})=>{
 await page.goto(at("/tasks"));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await expect(page.getByRole("navigation",{name:"Calendar sections"}).getByRole("link",{name:"Tasks"})).toHaveAttribute("aria-current","page");
 await expect(page.getByRole("radiogroup",{name:"Task status"})).toBeVisible();
 await expect(page.getByRole("group",{name:"Filters"})).toBeVisible();
 const box=page.locator(".v7-tk-card").first();
 if(await box.count()===0)return;
 await expect(box.locator(".v7-tk-card")).toHaveCount(0);
 await box.getByRole("checkbox").first().click();
 await expect(page.getByRole("button",{name:"Undo"})).toBeVisible();
});
test("Tasks segments switch between To do, Doing and Done",async({page})=>{
 await page.goto(at("/tasks"));
 await page.getByRole("radio",{name:"Doing"}).click();
 await expect(page.getByRole("radio",{name:"Doing"})).toHaveAttribute("aria-checked","true");
 await page.getByRole("radio",{name:"Done"}).click();
 await expect(page.getByRole("radio",{name:"Done"})).toHaveAttribute("aria-checked","true");
});
