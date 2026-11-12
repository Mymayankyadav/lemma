import {test} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {openScene,shots} from "./v7-scenes";
// P1 gate (v7 PLAN §7.4, Night critique v2 Step 5): the six golden screens in Night and Day at 390 × 844, plus Today and
// Calendar at 1280 × 800, on the audit seed with the clock frozen. Candidates only: they move to docs/v7/golden/ when the
// Owner approves them. Run with V7_GOLDEN=1; scripts/v7/compose-golden.py puts Night and Day side by side.
// Golden candidates are captured on request, so the tests are only defined when V7_GOLDEN is set.
const enabled=!!process.env.V7_GOLDEN;
test.use({deviceScaleFactor:2,locale:"en-IN",timezoneId:"Asia/Kolkata"});
const out="docs/v7/golden-candidates";
const golden=[["today","today",true],["focus","focus",false],["calendar-day","calendar-day",true],["atlas","atlas",false],["review-round","review-round",false],["path-map","path-map",false]] as const;
for(const [name,scene,wide] of enabled?golden:[]){
 const shot=shots.find(item=>item.name===scene)!;
 for(const scheme of ["light","dark"] as const){
  for(const size of [{label:"390x844",width:390,height:844},...(wide?[{label:"1280x800",width:1280,height:800}]:[])]){
   test(`golden ${name} ${size.label} ${scheme==="light"?"day":"night"}`,async({page})=>{
    mkdirSync(out,{recursive:true});
    await openScene(page,shot,scheme,size);
    await page.screenshot({path:`${out}/${name}-${size.label}-${scheme==="light"?"day":"night"}.png`,animations:"disabled"});
   });
  }
 }
}
