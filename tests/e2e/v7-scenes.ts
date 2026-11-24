import {expect,type Page} from "@playwright/test";
import {openScratch} from './helpers/scratch.ts';
// The v7 scenes shared by the screen captures (v7-screens.spec.ts) and the rendered design lint (v7-design-lint.spec.ts).
// Audit seed, clock frozen at Mon 9 Nov 2026, 13:43 IST (en-IN, Asia/Kolkata), as in v7 PLAN §8.
export const NOW=new Date("2026-11-09T13:43:00+05:30");
export const DATE="2026-11-09";
// Keep the audit's original scenarios explicit after N159 releases U4; individual U4 cases opt back in last.
export const at=(hash:string)=>"/lemma/?demo=1&flags=-v7Ruler,-v7Qed,-v7Spread,-v7Scratch,-v7Paper,-v7DeskClock,-v7Week,v7Shell,v6Shell#"+hash;
export type Shot={name:string;hash:string;prepare?:(page:Page)=>Promise<void>;frames?:number;wide?:boolean;demo?:"first-use";flags?:string};
export const open=async(page:Page,name:string)=>{
 await page.getByRole("button",{name,exact:true}).first().click({timeout:5000});
 await page.waitForTimeout(200);
};
export const shots:Shot[]=[
 {name:"today",hash:"/",frames:3,wide:true},
 {name:"focus",hash:"/",prepare:async page=>{
   const start=page.getByRole("button",{name:/^(Start now|Start focus)$/}),back=page.getByRole("link",{name:"Return to focus"});
   if(await start.count()){await start.first().click();await page.waitForURL(/#\/focus/).catch(()=>{});}
   else if(await back.count())await back.click();
   else await page.goto(at("/focus"));
  }},
 {name:"today-quick-focus",hash:"/",prepare:async page=>{
   // PA3: Quick focus is offered in every hero state; Search's "Quick focus" action opens the same sheet (/?quick=1).
   await page.getByRole("button",{name:"Quick focus",exact:true}).first().click({timeout:5000});
  }},
 {name:"review-hub",hash:"/review",frames:3},
 {name:"review-round",hash:"/review",prepare:async page=>{await page.getByRole("button",{name:/^(Start review, \d+ cards?|Resume)/}).first().click({timeout:5000});await page.waitForURL(/#\/review\/run/).catch(()=>{});}},
 {name:"path-map",hash:"/p/real-analysis"},
 {name:"practice",hash:"/practice",frames:2},
 {name:"tasks",hash:"/tasks",frames:2},
 {name:"close-day-1-today",hash:"/today/close"},
 {name:"close-day-2-loose-ends",hash:"/today/close",prepare:async page=>{await open(page,"Next");}},
 {name:"close-day-3-tomorrow",hash:"/today/close",prepare:async page=>{await open(page,"Next");await open(page,"Next");}},
 {name:"calendar-day",hash:`/calendar?view=day&date=${DATE}`,wide:true},
 {name:"calendar-week",hash:`/calendar?view=week&date=${DATE}`},
 {name:"calendar-month",hash:`/calendar?view=month&date=${DATE}`,frames:2},
 {name:"calendar-agenda",hash:`/calendar?view=agenda&date=${DATE}`,frames:3},
 {name:"calendar-quick-add",hash:`/calendar?view=day&date=${DATE}&quick=1`},
 {name:"calendar-block-sheet",hash:`/calendar?view=day&date=${DATE}&new=block`},
 {name:"calendar-planner",hash:`/calendar?view=day&date=${DATE}&plan=1`},
 {name:"atlas",hash:"/atlas",prepare:async page=>{await page.locator(".v7-atlas-sky[data-layout]").waitFor({timeout:5000});await page.waitForTimeout(800);}},
 {name:"capture-sheet",hash:"/",prepare:async page=>{await page.getByRole("button",{name:"Capture",exact:true}).click();}},
 {name:"search-sheet",hash:"/",prepare:async page=>{await page.getByRole("button",{name:/Search/}).first().click();}},
 // Part 8: learning screens (PLAN §6.8, §6.9, §6.11).
 {name:"paths",hash:"/projects"},
 {name:"new-path",hash:"/projects/new"},
 {name:"checkpoint",hash:"/p/real-analysis/cp/CP4",frames:2},
 {name:"session",hash:"/s/real-analysis/7",frames:2},
 {name:"cards",hash:"/cards"},
 {name:"card",hash:"/cards/1",frames:2},
 {name:"card-editor",hash:"/cards?new=1"},
 // Part 9: Inbox and plan proposal (PLAN §6.10).
 {name:"inbox",hash:"/proposals"},
 {name:"inbox-list",hash:"/proposals?view=list"},
 {name:"inbox-plans",hash:"/proposals?tab=plan"},
 {name:"plan-proposal",hash:"/proposals?tab=plan",frames:2,prepare:async page=>{await page.getByRole("link",{name:"Compare whole plan"}).first().click();await page.waitForURL(/#\/proposals\/[^?]+$/).catch(()=>{});}},
 // Part 10: insight and edges (PLAN §6.13–6.15). Hosted v6 settings forms are excluded until rebuilt.
 {name:"progress",hash:"/insights",frames:3},
 {name:"progress-learning",hash:"/insights?tab=learning",frames:3},
 {name:"progress-time",hash:"/insights?tab=time",frames:2},
 {name:"time-log",hash:"/log"},
 {name:"settings",hash:"/settings"},
 {name:"settings-appearance",hash:"/settings?section=appearance"},
 {name:"settings-subjects",hash:"/settings?section=subjects"},
 // Release plan R1 · F03: the rebuilt grouped-list Settings pages.
 {name:"settings-study",hash:"/settings?section=study"},
 {name:"settings-planning",hash:"/settings?section=planning"},
 {name:"settings-reminders",hash:"/settings?section=reminders"},
 {name:"sign-in",hash:"/sign-in"},
 {name:"welcome",hash:"/welcome"},
];

/** Load a scene the way a person would: fixed clock, colour scheme, reduced motion, then its own preparation. */
export async function openScene(page:Page,shot:Shot,scheme:"light"|"dark",size:{width:number;height:number;text?:number}){
 await page.setViewportSize({width:size.width,height:size.height});
 // N157 (V11): a raised system text size, as the root font size (130% is the audit's "Android large text" profile).
 if(size.text&&size.text!==100)await page.addInitScript(scale=>{document.addEventListener("DOMContentLoaded",()=>{document.documentElement.style.fontSize=scale+"%";});},size.text);
 await page.clock.setFixedTime(NOW);
 await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});
 const address=at(shot.hash).replace("demo=1","demo="+(shot.demo??"1"));
 await page.goto(shot.flags?address.replace(/(?=#)/,','+shot.flags):address);
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await expect(page.locator("#main-content")).toBeVisible({timeout:12000});
 await expect(page.getByRole("heading",{name:"Loading screen…",exact:true})).toHaveCount(0);
 // Atlas deliberately cancels covered/replaced layout workers. A canceled
 // module-worker request can keep Chromium's network-idle bookkeeping pending;
 // wait for its loaded application surface, then the scene's rendered state.
 if(shot.hash.startsWith('/atlas'))await page.locator('.v7-atlas').waitFor();
 else await page.waitForLoadState("networkidle");
 await shot.prepare?.(page);
 await page.waitForTimeout(700);
 await page.evaluate(()=>document.fonts.ready);
}

export const redesignShots: Shot[] = [
 {name:"today-next-step",hash:"/",flags:"todayNextStep,v7Ruler"},
 {name:"atlas-map",hash:"/atlas",prepare:async page=>{await page.locator(".v7-atlas-sky[data-drawn-extent]").waitFor();}},
 {name:"atlas-list",hash:"/atlas?view=list"},
 {name:"atlas-peek",hash:"/atlas",prepare:async page=>{
  await page.locator(".v7-atlas-sky[data-drawn-extent]").waitFor();
  await page.getByRole("button",{name:"Search concepts"}).click();
  const field=page.getByRole("searchbox",{name:"Find a concept"});
  await field.fill("compact");
  await page.getByRole("list",{name:"Matching concepts"}).getByRole("button",{name:/^Compactness\s+Analysis$/}).click();
  await page.getByRole("region",{name:"Compactness",exact:true}).waitFor();
  // Search opens the idea's actions; this scenario deliberately captures its peek.
  await page.getByRole("button",{name:"Show less",exact:true}).click();
 }},
 {name:"path",hash:"/p/real-analysis"},
 {name:"path-tutor",hash:"/p/real-analysis/tutor"},
 {name:"tutor-start",hash:"/p/real-analysis/cp/CP4/tutor"},
 {name:"tutor-reading",hash:"/p/real-analysis/cp/CP4/tutor",prepare:async page=>{
  await page.getByRole("button",{name:/^Begin/}).click();
 }},
 {name:"tutor-scratch",hash:"/p/real-analysis/cp/CP4/tutor",flags:"tutorScratch",prepare:async page=>{
  await page.getByRole("button",{name:"Write a question"}).click();
  await openScratch(page);
 }},
 {name:"settings-tutor",hash:"/settings?section=tutor"},
 {name:"review-done",hash:"/review/done"},
 {name:"review-empty",hash:"/review",demo:"first-use"},
 {name:"review-nothing-due",hash:"/review",demo:"first-use",prepare:async page=>{
  const first=page.getByRole("region",{name:"First card"});
  await first.getByRole("button",{name:"Create a path and card"}).click();
  await first.getByLabel("Path name").fill("Topology");
  await first.getByLabel("Front",{exact:true}).fill("What is a clopen set?");
  await first.getByLabel("Back",{exact:true}).fill("A set that is both open and closed.");
  await first.getByRole("button",{name:"Save card"}).click();
  await page.getByRole("button",{name:"Review now"}).click();
  await page.getByRole("button",{name:"Show answer"}).click();
  await page.getByRole("group",{name:"Grade answer"}).getByRole("button",{name:/^Easy\b/}).click();
  await page.waitForURL(/#\/review\/done/);
  await page.goto(at("/review").replace("demo=1","demo=first-use"));
  await expect(page.getByText("Nothing due",{exact:true})).toBeVisible();
 }},
 {name:"progress-empty",hash:"/insights",demo:"first-use"},
 {name:"today-first-run",hash:"/",demo:"first-use",flags:"todayNextStep"},
 {name:"offline",hash:"/",prepare:async page=>{
  await page.evaluate(()=>{
   Object.defineProperty(navigator,"onLine",{configurable:true,value:false});
   dispatchEvent(new Event("offline"));
  });
 }},
];
