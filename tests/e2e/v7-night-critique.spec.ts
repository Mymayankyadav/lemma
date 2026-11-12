import {test,expect,type Page} from "@playwright/test";
// End-to-end checks for the v7 Night critique (v2, 11 Nov 2026), on the audit seed with the clock frozen at
// Mon 9 Nov 2026, 13:43 IST. The ids in the test names are the critique's.
const at=(hash:string)=>"/lemma/?demo=1&flags=v7Shell,v6Shell#"+hash;
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
async function open(page:Page,hash:string,width=390){
 await page.setViewportSize({width,height:844});
 await page.clock.setFixedTime(new Date("2026-11-09T13:43:00+05:30"));
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}
const rgb=(value:string)=>value.match(/\d+(\.\d+)?/g)!.slice(0,3).map(Number);
const lum=([r,g,b]:number[])=>.2126*r+.7152*g+.0722*b;

test("B3 · Today, Calendar and Tasks show the same overdue count",async({page})=>{
 await open(page,"/");
 const today=Number((await page.getByText(/^\d+ overdue$/).first().textContent())!.match(/\d+/)![0]);
 expect(today).toBeGreaterThan(0);
 await page.goto(at("/calendar?view=day&date=2026-11-09"));
 await expect(page.getByRole("button",{name:today+" overdue. Triage"})).toBeVisible();
 await page.goto(at("/tasks"));
 await page.waitForLoadState("networkidle");
 await expect(page.getByRole("link",{name:today+" overdue. Triage"})).toBeVisible();
 const tasks=Number((await page.getByRole("button",{name:/^Overdue \d+$/}).textContent())!.match(/\d+/)![0]);
 const group=page.getByRole("region",{name:"Overdue"});
 await expect(group.getByRole("heading")).toHaveText("Overdue · "+tasks);
 // The global triage number is identical on all three screens. The task-only
 // filter and group both count the task subset of that same summary.
 expect(tasks).toBeLessThanOrEqual(today);
});

test("K1/KC13 · in Night the selected segment is lighter than its track",async({page})=>{
 await open(page,"/calendar?view=day&date=2026-11-09");
 const group=page.getByRole("radiogroup",{name:"Calendar view"});
 const track=await group.evaluate(node=>getComputedStyle(node).backgroundColor);
 const thumb=await group.locator('[aria-checked="true"]').evaluate(node=>getComputedStyle(node).backgroundColor);
 expect(lum(rgb(thumb))).toBeGreaterThan(lum(rgb(track)));
});

test("CD1/PA5 · the Day grid starts above 45% of the viewport and shows at least 4 hours",async({page})=>{
 await open(page,"/calendar?view=day&date=2026-11-09");
 const grid=await page.getByRole("region",{name:"Day time grid"}).boundingBox();
 expect(grid!.y).toBeLessThan(844*.45+4);
 const dock=await page.locator(".v7-dock").boundingBox();
 expect(dock!.y-grid!.y).toBeGreaterThanOrEqual(4*64);
 await expect(page.getByRole("button",{name:"New time block"})).toHaveCount(0);
});

test("B4 · the Calendar date row is one line at 320 px in Day, Week and Month",async({page})=>{
 for(const view of ["day","week","month"]){
  await open(page,"/calendar?view="+view+"&date=2026-11-11",320);
  const row=page.locator(".v7-cal-dateRow");
  const box=await row.boundingBox(),month=await page.locator(".v7-cal-month").boundingBox();
  expect(box!.height).toBeLessThanOrEqual(48);
  expect(month!.height).toBeLessThanOrEqual(30);
 }
});

test("B5 · the Review split cuts no text at 320 px and its parts add up to the hero number",async({page})=>{
 await open(page,"/review",320);
 const hero=Number(await page.getByLabel("Cards in this round").textContent());
 const legend=page.getByRole("group",{name:"Subjects in this round"}).getByRole("button");
 const counts=await legend.locator("strong").allTextContents();
 expect(counts.map(Number).reduce((a,b)=>a+b,0)).toBe(hero);
 for(const item of await legend.all())expect(await item.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 await expect(page.getByText(/To…/)).toHaveCount(0);
});

test("B6 · the capture sheet opens with the focus ring, never a danger colour",async({page})=>{
 await open(page,"/");
 await page.getByRole("button",{name:"Capture",exact:true}).click();
 const field=page.getByRole("textbox",{name:"What do you want to add?"});
 await expect(field).toBeFocused();
 const outline=await field.evaluate(node=>getComputedStyle(node).outlineColor);
 const ring=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--v7-role-focus-ring").trim());
 const probe=await page.evaluate(colour=>{const el=document.createElement("i");el.style.color=colour;document.body.append(el);const value=getComputedStyle(el).color;el.remove();return value;},ring);
 expect(rgb(outline)).toEqual(rgb(probe));
 await expect(page.getByText("Unavailable · Type something to add.")).toBeVisible();
});

test("B7/PA11 · no visible native select, date or time control on the v7 sheets and Close the day",async({page})=>{
 const native='select:visible, input[type="date"]:visible, input[type="time"]:visible, input[type="datetime-local"]:visible';
 for(const hash of ["/calendar?view=day&date=2026-11-09&new=block","/calendar?view=day&date=2026-11-09&plan=1","/calendar?view=day&date=2026-11-09&quick=1"]){
  await open(page,hash);
  await page.waitForTimeout(400);
  expect(await page.locator(native).count(),hash).toBe(0);
 }
 await open(page,"/today/close");
 for(let step=0;step<2;step++)await page.getByRole("button",{name:"Next",exact:true}).click();
 expect(await page.locator(native).count()).toBe(0);
 await expect(page.getByRole("button",{name:"Close the day"})).toBeVisible();
});

test("KC1/KC7/KC12 · badges carry icons, hub tabs are underlined, the tab bar is solid",async({page})=>{
 await open(page,"/");
 const badge=page.locator(".v7-badge.v7-tone-warning").first();
 await expect(badge.locator("svg.v7-status-icon")).toHaveCount(1);
 const dock=await page.locator(".v7-dock").evaluate(node=>{const style=getComputedStyle(node);return {bg:style.backgroundColor,filter:style.backdropFilter};});
 expect(dock.bg).not.toMatch(/rgba\(.*,\s*0\.\d+\)/);
 await page.goto(at("/review"));
 const current=page.getByRole("navigation",{name:"Review sections"}).getByRole("link",{name:"Due"});
 expect(await current.evaluate(node=>getComputedStyle(node).borderBottomWidth)).toBe("2px");
 expect(await current.evaluate(node=>getComputedStyle(node).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test("KC8/KC22 · titles use kit roles and buttons use kit heights",async({page})=>{
 await open(page,"/");
 expect(await page.getByRole("heading",{level:1}).first().evaluate(node=>getComputedStyle(node).fontSize)).toBe("44px");
 await page.goto(at("/review"));
 await page.waitForLoadState("networkidle");
 expect(await page.getByRole("heading",{name:"Review",level:1}).evaluate(node=>getComputedStyle(node).fontSize)).toBe("32px");
 for(const button of await page.locator("main .v7-button:visible").all()){
  const height=Math.round((await button.boundingBox())!.height);
  expect([44,48]).toContain(height);
 }
});
