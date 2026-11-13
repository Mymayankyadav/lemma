import {test,expect,type Locator,type Page} from "@playwright/test";
import {NOW,DATE,at} from "./v7-scenes";
// N138 · v7 UX audit r3, V36: the six kinds of control whose true hit area was under 44 px (almanac cells, "Adjust",
// "1 overdue · Triage", "14 due" on path cards, the narrow hub tabs, the time-log days) and Agenda's "Add". A control
// passes when a tap 21 px from its centre, in each of the four directions, still lands on it.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});

async function open(page:Page,hash:string,width:number){
 await page.setViewportSize({width,height:844});
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}
/** How far from its centre, up to 21 px, a tap still lands on the control in each direction (the smallest of the four). */
async function reach(control:Locator){
 await control.evaluate(node=>node.scrollIntoView({block:"center",inline:"center"}));
 return control.evaluate(node=>{
  const box=node.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
  const lands=(dx:number,dy:number)=>{const hit=document.elementFromPoint(x+dx,y+dy);return !!hit&&(hit===node||node.contains(hit));};
  let least=21;
  for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){let step=0;while(step<21&&lands(dx*(step+1),dy*(step+1)))step++;least=Math.min(least,step);}
  return least;
 });
}

for(const width of [360,390]){
 test(`V36 · at ${width} px the narrow tabs, the log's days, path cards' due chips, Triage, Adjust and Add take a 44 px tap`,async({page})=>{
  await open(page,"/review",width);
  expect(await reach(page.getByRole("link",{name:"Due",exact:true}))).toBe(21);
  await open(page,"/cards",width);
  expect(await reach(page.getByRole("link",{name:"Atlas",exact:true}))).toBe(21);
  await open(page,"/log",width);
  for(const name of ["Time","Log"])expect(await reach(page.getByRole("link",{name,exact:true}))).toBe(21);
  const days=page.locator(".v7-log-day");
  await expect(days).toHaveCount(7);
  for(let day=0;day<7;day++)expect(await reach(days.nth(day))).toBe(21);
  await expect(page.getByRole("heading",{name:"9–15 November",exact:true})).toBeVisible();
  await open(page,"/projects",width);
  expect(await reach(page.getByRole("link",{name:"Review 14 due on Real Analysis"}))).toBe(21);
  await open(page,`/calendar?view=day&date=${DATE}`,width);
  expect(await reach(page.getByRole("button",{name:"1 overdue. Triage"}))).toBe(21);
  expect(await reach(page.getByRole("button",{name:"Adjust",exact:true}))).toBe(21);
  await open(page,`/calendar?view=agenda&date=${DATE}`,width);
  expect(await reach(page.getByRole("button",{name:"Add",exact:true}).first())).toBe(21);
 });
}

test("V36 · the almanac is one touch target: a tap between two days still picks the day under the finger",async({page})=>{
 await open(page,"/insights",390);
 const almanac=page.locator("section.v7-chart",{hasText:"Study almanac"});
 const grid=almanac.locator(".v7-heatmap");
 await grid.scrollIntoViewIfNeeded();
 const today=almanac.locator('[data-chart-point][aria-current="date"]');
 const label=await today.getAttribute("aria-label");
 const cell=(await today.boundingBox())!;
 // Half a pixel left of today's cell is the gap between two weeks: it belongs to the grid, and goes to the nearer day.
 await page.mouse.click(cell.x-.5,cell.y+cell.height/2);
 await expect(almanac.getByRole("status")).toHaveText(label!.replace(/^(.*): (.*)$/,"$2 · $1"));
 // Half a pixel right of the same weekday a week earlier goes to that day.
 const before=almanac.locator("[data-chart-point]").nth(await today.evaluate(node=>[...node.parentElement!.querySelectorAll("[data-chart-point]")].indexOf(node)-7));
 const previous=(await before.boundingBox())!;
 await page.mouse.click(previous.x+previous.width+.5,previous.y+previous.height/2);
 await expect(almanac.getByRole("status")).toHaveText((await before.getAttribute("aria-label"))!.replace(/^(.*): (.*)$/,"$2 · $1"));
 // A mouse picks as it moves; the cells keep one tab stop for keys.
 await page.mouse.move(cell.x+cell.width/2,cell.y+cell.height/2);
 await expect(almanac.getByRole("status")).toHaveText(label!.replace(/^(.*): (.*)$/,"$2 · $1"));
 expect(await almanac.locator('[data-chart-point][tabindex="0"]').count()).toBe(1);
});
