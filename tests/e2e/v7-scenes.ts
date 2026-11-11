import {expect,type Page} from "@playwright/test";
// The v7 scenes shared by the screen captures (v7-screens.spec.ts) and the rendered design lint (v7-design-lint.spec.ts).
// Audit seed, clock frozen at Mon 9 Nov 2026, 13:43 IST (en-IN, Asia/Kolkata), as in v7 PLAN §8.
export const NOW=new Date("2026-11-09T13:43:00+05:30");
export const DATE="2026-11-09";
export const at=(hash:string)=>"/lemma/?demo=1&flags=v7Shell,v6Shell#"+hash;
export type Shot={name:string;hash:string;prepare?:(page:Page)=>Promise<void>;frames?:number;wide?:boolean};
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
 {name:"review-round",hash:"/review",prepare:async page=>{await page.getByRole("button",{name:/^(Start \d+ cards?|Resume)/}).first().click({timeout:5000});await page.waitForURL(/#\/review\/run/).catch(()=>{});}},
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
];

/** Load a scene the way a person would: fixed clock, colour scheme, reduced motion, then its own preparation. */
export async function openScene(page:Page,shot:Shot,scheme:"light"|"dark",size:{width:number;height:number}){
 await page.setViewportSize(size);
 await page.clock.setFixedTime(NOW);
 await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});
 await page.goto(at(shot.hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
 await shot.prepare?.(page);
 await page.waitForTimeout(700);
 await page.evaluate(()=>document.fonts.ready);
}
