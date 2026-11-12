import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N130 · v7 UX audit r3, phase U0 (truth), on the audit seed with the clock frozen. The ids are the audit's
// (docs/v7/ux-audit-2026-11-12/01_AUDIT_RELEASED_V7.md).
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
// The audit's own clock (Thu 12 Nov 2026, 13:43 IST): on the seed, practice is due that day and one topic is overdue.
const AUDIT=new Date("2026-11-12T13:43:00+05:30");
async function open(page:Page,hash:string,width=390,now=NOW){
 await page.setViewportSize({width,height:844});
 await page.clock.setFixedTime(now);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}

for(const width of [360,390])test(`V02 · at ${width} px each hour label on the Today strip is centred on its hour`,async({page})=>{
 await open(page,"/",width);
 const strip=(await page.locator(".v7-today-strip").boundingBox())!;
 const labels=await page.locator(".v7-today-hours > span").evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();
  return {hour:Number(node.textContent),left:box.left,right:box.right,centre:box.left+box.width/2};}));
 expect(labels.length).toBeGreaterThanOrEqual(3);
 const first=labels[0].hour,last=labels[labels.length-1].hour;
 const x=(hour:number)=>strip.x+(hour-first)/(last-first)*strip.width;
 // The ends align to the strip's edges; every label between is centred within 2 px of its hour.
 expect(Math.abs(labels[0].left-strip.x)).toBeLessThanOrEqual(2);
 expect(Math.abs(labels[labels.length-1].right-(strip.x+strip.width))).toBeLessThanOrEqual(2);
 for(const label of labels.slice(1,-1))expect(Math.abs(label.centre-x(label.hour))).toBeLessThanOrEqual(2);
 // Labels never overlap.
 for(let i=1;i<labels.length;i++)expect(labels[i].left).toBeGreaterThanOrEqual(labels[i-1].right);
});

test("V03 · Practice reads the same on Today and on Close the day",async({page})=>{
 const practice=async()=>{const meter=page.getByRole("meter",{name:"Practice",exact:true}).first();
  await expect(meter).toBeVisible();
  return [await meter.getAttribute("aria-valuenow"),await meter.getAttribute("aria-valuemax")];};
 await open(page,"/",390,AUDIT);
 const today=await practice();
 await open(page,"/today/close",390,AUDIT);
 expect(await practice()).toEqual(today);
 // The overdue topic is still owed today, on both screens (Today used to leave it out: "0 of 1" against "0 of 2").
 expect(Number(today[1])).toBeGreaterThanOrEqual(2);
});

test("V03 · the review estimate reads the same on Today and on Review",async({page})=>{
 await open(page,"/");
 const row=page.getByRole("region",{name:"Needs you"}).locator(".v7-today-need",{hasText:/cards? due/});
 await expect(row.getByText(/^about \d+ min$/)).toBeVisible();
 const count=Number((await row.locator("strong").textContent())!.match(/\d+/)![0]);
 const minutes=Number((await row.getByText(/^about \d+ min$/).textContent())!.match(/\d+/)![0]);
 await open(page,"/review");
 await expect(page.getByRole("button",{name:new RegExp("^Start "+count+" cards?")})).toBeVisible();
 await expect(page.getByText("About "+minutes+" min at your pace",{exact:true})).toBeVisible();
});

test("V17 · a plan proposal puts Reject on the left and Approve on the right",async({page})=>{
 await open(page,"/proposals?tab=plan");
 await page.locator(".v7-inbox-plan").first().getByRole("link",{name:"Compare whole plan"}).click();
 const bar=page.getByRole("group",{name:"Plan decision"});
 const reject=(await bar.getByRole("button",{name:"Reject"}).boundingBox())!,approve=(await bar.getByRole("button",{name:"Approve"}).boundingBox())!;
 expect(reject.x+reject.width).toBeLessThanOrEqual(approve.x);
 // Approve stays the wide primary.
 expect(approve.width).toBeGreaterThan(reject.width);
});

test("V24 · Quick focus has no two options with the same name",async({page})=>{
 await open(page,"/");
 await page.getByRole("button",{name:"Quick focus",exact:true}).first().click();
 const group=page.getByRole("radiogroup",{name:"Session style"});
 await expect(group).toBeVisible();
 const heads=await group.locator("[role=radio] strong").allTextContents();
 expect(heads.length).toBeGreaterThan(1);
 expect(new Set(heads).size).toBe(heads.length);
 const names=await group.getByRole("radio").evaluateAll(nodes=>nodes.map(node=>(node.textContent??"").trim()));
 expect(new Set(names).size).toBe(names.length);
});
