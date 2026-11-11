import {test,expect,type Page} from "@playwright/test";
// Review captures of the v7 screens at phone size, Day and Night. These assert only that a screen
// rendered; the PNGs land in test-results/screens/v7 (uploaded as the "screens" artifact) for a human to judge.
const at=(hash:string)=>"/lemma/?demo=1&flags=v7Shell,v6Shell#"+hash;
test.use({viewport:{width:390,height:844},deviceScaleFactor:1});

type Shot={name:string;hash:string;prepare?:(page:Page)=>Promise<void>;full?:boolean};
const open=async(page:Page,name:string)=>{
 const button=page.getByRole("button",{name,exact:true});
 if(await button.count())await button.first().click();
};
const shots:Shot[]=[
 {name:"today",hash:"/",full:true},
 {name:"focus",hash:"/",prepare:async page=>{
   const start=page.getByRole("button",{name:/^(Start now|Start focus)$/}),back=page.getByRole("link",{name:"Return to focus"});
   if(await start.count()){await start.first().click();await page.waitForURL(/#\/focus/).catch(()=>{});}
   else if(await back.count())await back.click();
   else await page.goto(at("/focus"));
  }},
 {name:"today-quick-focus",hash:"/",prepare:async page=>{const quick=page.getByRole("button",{name:"Quick focus"});if(await quick.count())await quick.click();}},
 {name:"review-hub",hash:"/review",full:true},
 {name:"practice",hash:"/practice",full:true},
 {name:"tasks",hash:"/tasks",full:true},
 {name:"close-day-1-today",hash:"/today/close"},
 {name:"close-day-2-loose-ends",hash:"/today/close",prepare:async page=>{await open(page,"Next");}},
 {name:"close-day-3-tomorrow",hash:"/today/close",prepare:async page=>{await open(page,"Next");await open(page,"Next");}},
 {name:"calendar-day",hash:"/calendar?view=day&date=2026-11-11"},
 {name:"calendar-week",hash:"/calendar?view=week&date=2026-11-11"},
 {name:"calendar-month",hash:"/calendar?view=month&date=2026-11-11",full:true},
 {name:"calendar-agenda",hash:"/calendar?view=agenda&date=2026-11-11",full:true},
 {name:"calendar-quick-add",hash:"/calendar?view=day&date=2026-11-11&quick=1"},
 {name:"calendar-block-sheet",hash:"/calendar?view=day&date=2026-11-11&new=block"},
 {name:"calendar-planner",hash:"/calendar?view=day&plan=1"},
 {name:"atlas",hash:"/atlas"},
 {name:"capture-sheet",hash:"/",prepare:async page=>{await page.getByRole("button",{name:"Capture",exact:true}).click();}},
 {name:"search-sheet",hash:"/",prepare:async page=>{await page.getByRole("button",{name:/Search/}).first().click();}},
];
for(const scheme of ["light","dark"] as const){
 for(const shot of shots){
  test(`screen ${shot.name} ${scheme==="light"?"day":"night"}`,async({page})=>{
   await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});
   await page.goto(at(shot.hash));
   await expect(page.locator("html")).toHaveAttribute("data-v7","");
   await page.waitForLoadState("networkidle");
   try{await shot.prepare?.(page);}catch{/* an unavailable optional control must not hide the screen */}
   await page.waitForTimeout(700);
   await page.evaluate(()=>document.fonts.ready);
   const label=shot.name+"-"+(scheme==="light"?"day":"night");
   const png=await page.screenshot({path:`test-results/screens/v7/${label}.png`,fullPage:!!shot.full,animations:"disabled"});
   // The PR gate only keeps the JUnit XML, so the PNG also travels in the test's stdout for review.
   process.stdout.write("V7SHOT "+label+" "+png.toString("base64")+"\n");
  });
 }
}
