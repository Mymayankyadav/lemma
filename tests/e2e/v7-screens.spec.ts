import {test,expect,type Page} from "@playwright/test";
// Review captures of the v7 screens, Day and Night. These assert only that a screen rendered; the PNGs land in
// test-results/screens/v7 (uploaded as the "screens" artifact) for a human to judge.
// Night critique v2, Step 0:
//  C1 the audit seed with the clock frozen at Mon 9 Nov 2026, 13:43 IST (en-IN, Asia/Kolkata), as in v7 PLAN §8;
//  C2 long screens are captured as viewport-sized frames while scrolling, never as one full-page image, so the fixed
//     tab bar and Capture button are drawn where the user sees them;
//  C3 the review round and the Path map are captured, in Day and Night, and Today and Calendar also at 1280 × 800;
//  C4 the Quick focus sheet is captured; it is offered from every hero state and from Search (PA3).
const NOW=new Date("2026-11-09T13:43:00+05:30");
const DATE="2026-11-09";
const at=(hash:string)=>"/lemma/?demo=1&flags=v7Shell,v6Shell#"+hash;
test.use({deviceScaleFactor:1,locale:"en-IN",timezoneId:"Asia/Kolkata"});

type Shot={name:string;hash:string;prepare?:(page:Page)=>Promise<void>;frames?:number;wide?:boolean};
const open=async(page:Page,name:string)=>{
 await page.getByRole("button",{name,exact:true}).first().click({timeout:5000});
 await page.waitForTimeout(200);
};
const shots:Shot[]=[
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
const sizes=[{label:"",width:390,height:844},{label:"-1280",width:1280,height:800}];
for(const scheme of ["light","dark"] as const){
 for(const shot of shots){
  for(const size of sizes){
   if(size.label&&!shot.wide)continue;
   test(`screen ${shot.name}${size.label} ${scheme==="light"?"day":"night"}`,async({page})=>{
    await page.setViewportSize({width:size.width,height:size.height});
    await page.clock.setFixedTime(NOW);
    await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});
    await page.goto(at(shot.hash));
    await expect(page.locator("html")).toHaveAttribute("data-v7","");
    await page.waitForLoadState("networkidle");
    try{await shot.prepare?.(page);}catch{/* an unavailable optional control must not hide the screen */}
    await page.waitForTimeout(700);
    await page.evaluate(()=>document.fonts.ready);
    const base=shot.name+size.label+"-"+(scheme==="light"?"day":"night");
    for(let frame=0;frame<(shot.frames??1);frame++){
     if(frame){
      const moved=await page.evaluate(()=>{const el=document.scrollingElement!;const before=el.scrollTop;el.scrollBy(0,Math.round(innerHeight*.8));return el.scrollTop!==before;});
      if(!moved)break;
      await page.waitForTimeout(250);
     }
     const label=base+(frame?`-${frame+1}`:"");
     const png=await page.screenshot({path:`test-results/screens/v7/${label}.png`,animations:"disabled"});
     // The PR gate only keeps the JUnit XML, so the PNG also travels in the test's stdout for review.
     process.stdout.write("V7SHOT "+label+" "+png.toString("base64")+"\n");
    }
   });
  }
 }
}
