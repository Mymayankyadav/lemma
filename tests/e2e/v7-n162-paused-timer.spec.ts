import {test,expect,type Page} from "@playwright/test";
// N162 (Owner phone report, 14 Nov 2026): "I started the timer then paused and when the app was cleared from the memory
// the timer kept going when I restarted the app." The server keeps one phase end; a paused timed phase must stay put.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata"});
const KEY="lemma.v6.demo.study.v1";
const NOW=new Date("2026-11-14T11:30:00Z"); // the page's clock
const at=(minutes:number)=>new Date(NOW.getTime()+minutes*60_000).toISOString();
const entry=(over:object)=>({id:"11111111-1111-4111-8111-111111111111",intent:"Algebra 1 CP2: subgroups of cyclic groups",source:"app",status:"paused",reflection:null,rating:null,
 version:4,createdAt:at(-30),updatedAt:at(-5),savedAt:null,mode:"pomodoro",presetId:null,config:{focus_minutes:25,break_minutes:5,cycles:4},phase:"focus",cycle:1,
 phaseEndsAt:at(20),energy:null,leaseDevice:null,leaseVersion:0,leaseExpiresAt:null,excludedIntervals:[],...over});
async function open(page:Page,row:object){
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 await page.addInitScript(([key,value])=>{try{if(!sessionStorage.getItem(key))sessionStorage.setItem(key,value);}catch{/* demo storage unavailable */}},
  [KEY,JSON.stringify({schema:1,entries:[row],blocks:[]})]);
 await page.goto("/lemma/?demo=1&flags=v7Shell,v6Shell#/focus");
 await expect(page.getByTestId("focus-clock")).toBeVisible();
}

test("a paused pomodoro shows what was left when it was paused, not what the clock has run down to since",async({page})=>{
 // Started 30 min ago, paused 5 min ago with 20 min left; the stored end (in 20 min) is still in the future.
 await open(page,entry({intervals:[{id:"a1",kind:"focus",start:at(-30),end:at(-5)}],phaseEndsAt:at(-5+20)}));
 await expect(page.getByTestId("focus-clock")).toHaveText("20:00");
 await expect(page.getByRole("region",{name:"Timer"}).getByText(/^paused$/i)).toBeVisible();
 // No end time is promised while it is paused.
 await expect(page.getByText(/^ends \d/)).toHaveCount(0);
 // Reopened much later (the app was cleared from memory): the same time is left.
 await page.clock.setFixedTime(new Date(NOW.getTime()+3*60*60_000));
 await page.reload();
 await expect(page.getByTestId("focus-clock")).toHaveText("20:00");
});

test("a resumed pomodoro counts the time it was paused, so it does not lose it",async({page})=>{
 // 25 min phase: focused 10 min, paused 40 min, running again for 5 min: 10 min left.
 await open(page,entry({status:"running",version:6,intervals:[{id:"a1",kind:"focus",start:at(-55),end:at(-45)},{id:"a2",kind:"focus",start:at(-5),end:null}],phaseEndsAt:at(-55+25)}));
 await expect(page.getByTestId("focus-clock")).toHaveText("10:00");
 await expect(page.getByText(/^ends \d/)).toBeVisible();
});
