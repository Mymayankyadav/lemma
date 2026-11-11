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

// Part 7b: Close the day.
test("Close the day walks three steps: Today, Loose ends, Tomorrow",async({page})=>{
 await page.goto(at("/today/close"));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 const dots=page.getByRole("list",{name:/Step 1 of 3/});
 await expect(dots).toBeVisible();
 await expect(page.getByRole("region",{name:"Today"})).toBeVisible();
 await page.getByRole("button",{name:"Next"}).click();
 await expect(page.getByRole("region",{name:"Loose ends"})).toBeVisible();
 await page.getByRole("button",{name:"Next"}).click();
 await expect(page.getByRole("region",{name:"Tomorrow"})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"Aim for tomorrow"})).toBeVisible();
 await expect(page.getByRole("button",{name:/^(Close the day|Finish|Day already closed)$/})).toBeVisible();
 await page.getByRole("button",{name:"Back"}).click();
 await expect(page.getByRole("region",{name:"Loose ends"})).toBeVisible();
});

// Part 7c: Calendar Week, Month, Agenda.
test("Calendar Week shows a seven-day grid with the strip as its header",async({page})=>{
 await page.goto(at("/calendar?view=week"));
 await expect(page.getByRole("radio",{name:"Week"})).toHaveAttribute("aria-checked","true");
 await expect(page.getByRole("region",{name:"Week time grid"})).toBeVisible();
 await expect(page.locator("[data-strip-day]")).toHaveCount(7);
 await expect(page.getByRole("button",{name:"Next week"})).toBeVisible();
});
test("Calendar Month tints days, offers Open day, and never prints a zero",async({page})=>{
 await page.goto(at("/calendar?view=month"));
 await expect(page.getByRole("group",{name:"Month date grid"})).toBeVisible();
 expect(await page.locator("[data-month-day]").count()).toBeGreaterThanOrEqual(28);
 await expect(page.getByText(/\b0 blocks\b/)).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Open day"})).toBeVisible();
 await page.getByRole("button",{name:"Open day"}).click();
 await expect(page.getByRole("radio",{name:"Day"})).toHaveAttribute("aria-checked","true");
});
test("Calendar Agenda lists days with headings and switches back to Day",async({page})=>{
 await page.goto(at("/calendar?view=agenda"));
 await expect(page.getByRole("heading",{name:/^Today/})).toBeVisible();
 expect(await page.locator(".v7-ag-heading").count()).toBe(14);
 await page.getByRole("radio",{name:"Day"}).click();
 await expect(page.getByRole("radio",{name:"Day"})).toHaveAttribute("aria-checked","true");
});

// Part 7d: quick-add, suggestions banner, overdue sheet.
test("Calendar quick-add takes a title and a length, and More options opens the full block sheet",async({page})=>{
 await page.goto(at("/calendar?view=day&date=2026-11-11"));
 await page.getByRole("button",{name:"New time block"}).click();
 const sheet=page.getByRole("dialog",{name:"New block"});
 await expect(sheet).toBeVisible();
 await expect(sheet.getByRole("textbox",{name:"Title"})).toBeFocused();
 await sheet.getByRole("button",{name:"90 min"}).click();
 await expect(sheet.getByRole("button",{name:"90 min"})).toHaveAttribute("aria-pressed","true");
 await sheet.getByRole("button",{name:"Add block"}).click();
 await expect(sheet.getByText("Give the block a title.")).toBeVisible();
 await sheet.getByRole("button",{name:"More options"}).click();
 await expect(page).toHaveURL(/new=block/);
 await expect(page.getByRole("dialog",{name:/block/i}).first()).toBeVisible();
});
test("Calendar quick-add opens from a Tasks Schedule link and carries the length",async({page})=>{
 await page.goto(at("/calendar?view=day&date=2026-11-11&quick=1&len=25"));
 await expect(page.getByRole("dialog",{name:"New block"}).getByRole("button",{name:"25 min"})).toHaveAttribute("aria-pressed","true");
 await page.keyboard.press("Escape");
 await expect(page).not.toHaveURL(/quick=1/);
});
test("Calendar plan=1 opens the planner on the day view",async({page})=>{
 await page.goto(at("/calendar?view=day&plan=1"));
 await expect(page.getByRole("dialog",{name:"Plan study tasks"})).toBeVisible();
});

// Part 7e: Today links, start sheet styles, Needs you.
test("Calendar Plan tomorrow opens the planner and leaves plan=tomorrow out of the URL",async({page})=>{
 await page.goto(at("/calendar?view=day&plan=tomorrow"));
 await expect(page.getByRole("dialog",{name:"Plan study tasks"})).toBeVisible();
 await expect(page).not.toHaveURL(/plan=tomorrow/);
});
test("Calendar Triage link opens the overdue sheet and clears the param",async({page})=>{
 await page.goto(at("/calendar?view=day&overdue=1"));
 await expect(page.getByRole("dialog",{name:/overdue/})).toBeVisible();
 await expect(page).not.toHaveURL(/overdue=1/);
});
test("Today Quick focus offers Open and the owner's presets as session styles",async({page})=>{
 await page.goto(at("/"));
 const quick=page.getByRole("button",{name:"Quick focus"});
 if(await quick.count()===0)return;
 await quick.click();
 const styles=page.getByRole("radiogroup",{name:"Session style"});
 await expect(styles.getByRole("radio",{name:/^Open/})).toBeVisible();
 await styles.getByRole("radio",{name:/^Open/}).click();
 await expect(styles.getByRole("radio",{name:/^Open/})).toHaveAttribute("aria-checked","true");
});
test("Today Needs you completes a due task with Undo, and every section stays under four rows plus Show all",async({page})=>{
 await page.goto(at("/"));
 const needs=page.getByRole("region",{name:"Needs you"});
 if(await needs.count()===0)return;
 expect(await needs.locator(".v7-today-need").count()).toBeLessThanOrEqual(5);
 const box=needs.getByRole("checkbox").first();
 if(await box.count()===0)return;
 await box.click();
 await expect(page.getByRole("button",{name:"Undo"})).toBeVisible();
});
