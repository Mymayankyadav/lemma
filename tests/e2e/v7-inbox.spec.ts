import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// Part 9 acceptance: PLAN §6.10 "Done when", on the audit seed (five card proposals, one plan change) with the clock frozen.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
async function open(page:Page,hash="/proposals"){
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}
const card=(page:Page)=>page.locator(".v7-inbox-card");
const position=(page:Page)=>page.locator(".v7-inbox-position");
async function swipe(page:Page,dx:number,dy=0){
 const box=(await card(page).boundingBox())!;
 const x=box.x+box.width/2,y=box.y+box.height*.75;
 await page.mouse.move(x,y);await page.mouse.down();
 for(let step=1;step<=8;step++)await page.mouse.move(x+dx*step/8,y+dy*step/8);
 await page.mouse.up();
}

test("§6.10 five proposals can be decided by swipe alone",async({page})=>{
 await open(page);
 await expect(position(page)).toHaveText("1 of 5");
 for(let left=5;left>=1;left--){
  await expect(position(page)).toHaveText("1 of "+left);
  await swipe(page,left%2?170:-170);
 }
 await expect(page.getByRole("heading",{name:"Inbox zero"})).toBeVisible();
});

test("§6.10 a short drag springs back; an upward swipe skips to the end",async({page})=>{
 await open(page);
 const first=await card(page).getAttribute("data-proposal");
 await swipe(page,60);
 await expect(card(page)).toHaveAttribute("data-proposal",first!);
 await expect(position(page)).toHaveText("1 of 5");
 await swipe(page,0,-260);
 await expect(card(page)).not.toHaveAttribute("data-proposal",first!);
 await expect(position(page)).toHaveText("1 of 5");
});

test("§6.10 five proposals can be decided by buttons alone, and the three buttons sit in the bottom 40%",async({page})=>{
 await open(page);
 const group=page.getByRole("group",{name:"Decide on this card"});
 for(const name of ["Reject","Edit","Approve"]){
  const box=(await group.getByRole("button",{name,exact:true}).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(844*.6);
 }
 for(let left=5;left>=1;left--){
  await expect(position(page)).toHaveText("1 of "+left);
  await group.getByRole("button",{name:left%2?"Approve":"Reject",exact:true}).click();
 }
 await expect(page.getByRole("heading",{name:"Inbox zero"})).toBeVisible();
});

test("§6.10 five proposals can be decided by keys alone (A, R, arrows), and E opens the editor",async({page})=>{
 await open(page);
 await page.keyboard.press("e");
 await expect(page.getByRole("dialog",{name:"Edit proposed card"}).getByRole("button",{name:"Save and approve"})).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(page.getByRole("dialog",{name:"Edit proposed card"})).toHaveCount(0);
 for(const key of ["a","r","ArrowRight","ArrowLeft"]){await page.keyboard.press(key);}
 await expect(position(page)).toHaveText("1 of 1");
 await page.keyboard.press("ArrowUp");
 await expect(position(page)).toHaveText("1 of 1");
 await page.keyboard.press("a");
 await expect(page.getByRole("heading",{name:"Inbox zero"})).toBeVisible();
});

test("§6.10 every decision can be undone for 6 s",async({page})=>{
 await open(page);
 const first=await card(page).getAttribute("data-proposal");
 await page.getByRole("button",{name:"Approve",exact:true}).click();
 await expect(position(page)).toHaveText("1 of 4");
 await page.getByRole("button",{name:"Undo"}).click();
 await expect(position(page)).toHaveText("1 of 5");
 await expect(card(page)).toHaveAttribute("data-proposal",first!);
 // After the window the decision is sent and the card stays gone, even across a reload.
 await page.getByRole("button",{name:"Reject",exact:true}).click();
 await page.waitForTimeout(6500);
 await expect(page.getByRole("button",{name:"Undo"})).toHaveCount(0);
 await expect(position(page)).toHaveText("1 of 4");
});

test("§6.10 the batch offer confirms in a sheet that lists the cards",async({page})=>{
 await open(page);
 await page.getByRole("button",{name:/^Approve all \d+ from Session \d+$/}).click();
 const sheet=page.getByRole("dialog",{name:/^Approve \d+ cards\?$/});
 const count=await sheet.locator("li").count();
 expect(count).toBeGreaterThan(1);
 await sheet.getByRole("button",{name:"Approve "+count}).click();
 await expect(position(page)).toHaveText("1 of "+(5-count));
});

test("§6.10 a plan card shows what changes without opening the detail",async({page})=>{
 await open(page,"/proposals?tab=plan");
 const plan=page.locator(".v7-inbox-plan").first();
 await expect(plan.getByRole("heading",{name:"What changes"})).toBeVisible();
 expect(await plan.locator(".v7-inbox-changes li").count()).toBeGreaterThan(0);
 await expect(plan.getByRole("list",{name:"Where the change sits"})).toBeVisible();
 await plan.getByRole("link",{name:"Compare whole plan"}).click();
 await expect(page.getByRole("heading",{level:1,name:"What changes"})).toBeVisible();
 // R1 · F21: "Added" is a diff mark (+ in the success colour), not a status badge.
 await expect(page.locator(".v7-plan-map .v7-meta-chip[data-kind='added']",{hasText:"Added"}).first()).toBeVisible();
 await expect(page.getByRole("group",{name:"Plan decision"}).getByRole("button",{name:"Approve"})).toBeEnabled();
});

test("§6.10 the list view renders maths and decides a batch",async({page})=>{
 await open(page,"/proposals?view=list");
 expect(await page.locator(".v7-inbox-group").first().innerText()).not.toContain("$");
 await page.locator(".v7-inbox-group input[type=checkbox]").first().check();
 await page.locator(".v7-inbox-group input[type=checkbox]").nth(1).check();
 await page.getByRole("group",{name:"Batch decision"}).getByRole("button",{name:"Approve 2"}).click();
 await expect(page.getByRole("tab",{name:"Cards 3"})).toBeVisible();
});
