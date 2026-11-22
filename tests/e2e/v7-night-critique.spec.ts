import {test,expect,type Page} from "@playwright/test";
import {at} from './v7-scenes';
// End-to-end checks for the v7 Night critique (v2, 11 Nov 2026), on the audit seed with the clock frozen at
// Mon 9 Nov 2026, 13:43 IST. The ids in the test names are the critique's.
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
 await page.getByRole("button",{name:"Filter",exact:true}).click();
 const tasks=Number((await page.getByRole("button",{name:/^Overdue \d+$/}).textContent())!.match(/\d+/)![0]);
 await page.keyboard.press("Escape");
 const group=page.getByRole("region",{name:"Overdue"});
 await expect(group.getByRole("heading")).toHaveText("Overdue · "+tasks);
 // The global triage number is identical on all three screens. The task-only
 // filter and group both count the task subset of that same summary.
 expect(tasks).toBeLessThanOrEqual(today);
});

test("K1/KC13 · in Night the selected segment is lighter than its track",async({page})=>{
 // N161: on a phone the view choice is a header menu; the segmented control (this check) is from 700 px.
 await open(page,"/calendar?view=day&date=2026-11-09",1024);
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

// N220 (Owner report): Calendar's header is every hub's header (title, Search, Inbox, then the page's ⋯), the sections
// are tabs beneath it, and the view and period controls share one toolbar row under the tabs.
for(const view of ["Day","Week","Month"])test(`B4 · Calendar ${view} period actions fit one line at 320 px and Choose date works`,async({page})=>{
 await open(page,"/calendar?view="+view.toLowerCase()+"&date=2026-11-11",320);
 await expect(page.getByRole("heading",{name:"Calendar",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:/^Calendar date:/})).toHaveCount(0);
 const menu=page.getByRole("button",{name:`Calendar view: ${view}`,exact:true});
 const sections=page.getByRole("navigation",{name:"Calendar sections"});
 const navigation=page.getByRole("group",{name:"Calendar navigation"});
 const period=view==="Month"?"month":"week";
 const controls=[navigation.getByRole("button",{name:`Previous ${period}`,exact:true}),
  navigation.getByRole("button",{name:`Next ${period}`,exact:true})];
 const header=page.locator(".v7-hub-bar"),more=header.getByRole("navigation",{name:"Page actions"}).getByRole("button",{name:"Calendar actions",exact:true});
 for(const control of [menu,sections,more,...controls])await expect(control).toBeVisible();
 await expect(navigation.getByRole("button",{name:`Calendar view: ${view}`,exact:true})).toBeVisible();
 await expect(header.getByRole("button",{name:/^Calendar view:/})).toHaveCount(0);
 const row=(await navigation.boundingBox())!,tabs=(await sections.boundingBox())!,viewBox=(await menu.boundingBox())!,bar=(await header.boundingBox())!;
 expect(row.height).toBeLessThanOrEqual(48);
 expect(viewBox.height).toBeLessThanOrEqual(48);
 expect(row.y).toBeGreaterThanOrEqual(tabs.y+tabs.height-1);
 expect(row.y-(tabs.y+tabs.height)).toBeLessThanOrEqual(16);
 expect(Math.abs(viewBox.y+viewBox.height/2-row.y-row.height/2)).toBeLessThanOrEqual(4);
 expect(viewBox.x+viewBox.width).toBeLessThanOrEqual(320);
 for(const control of controls){
  const box=(await control.boundingBox())!;
  expect(Math.abs(box.y+box.height/2-row.y-row.height/2)).toBeLessThanOrEqual(4);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(320);
 }
 const moreBox=(await more.boundingBox())!;
 expect(moreBox.y+moreBox.height).toBeLessThanOrEqual(bar.y+bar.height+1);
 expect(moreBox.x+moreBox.width).toBeLessThanOrEqual(320);
 await more.click();
 const actions=page.getByRole("menu",{name:"Calendar actions"});
 await expect(actions.getByRole("menuitem")).toHaveText(["Go to today","Browse day","Plan study tasks","Choose date"]);
 await actions.getByRole("menuitem",{name:"Choose date",exact:true}).click();
 const picker=page.getByRole("dialog",{name:"Choose a date"});
 await expect(picker).toBeVisible();
 await picker.getByRole("button",{name:/Wednesday.*(?:November 18|18 November).*2026/}).click();
 await expect(picker).toHaveCount(0);
 await expect(page).toHaveURL(/date=2026-11-18/);
 await expect(menu).toBeVisible();
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
 await expect(page.getByRole("button",{name:"Add task",exact:true})).toBeDisabled();
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
