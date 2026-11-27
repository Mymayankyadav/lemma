import {test} from "@playwright/test";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {openScene,shots} from "./v7-scenes";
// Review captures of the v7 screens, Day and Night. These assert only that a screen rendered; the PNGs land in
// test-results/screens/v7 (uploaded as the "screens" artifact) for a human to judge. The scenes are in v7-scenes.ts.
//  C1 audit seed with the clock frozen; C2 viewport-sized frames while scrolling (never one full-page image, so the fixed
//  tab bar and Capture button are drawn where the user sees them); C3 review round, Path map, Day theme and 1280 × 800;
//  C4 the Quick focus sheet.
test.use({deviceScaleFactor:1,locale:"en-IN",timezoneId:"Asia/Kolkata"});
const sizes=[{label:"",width:390,height:844},{label:"-1280",width:1280,height:800}];
for(const scheme of ["light","dark"] as const){
 for(const shot of shots){
  for(const size of sizes){
   if(size.label&&!shot.wide)continue;
   test(`screen ${shot.name}${size.label} ${scheme==="light"?"day":"night"}`,async({page},info)=>{
    await openScene(page,shot,scheme,size);
    const base=shot.name+size.label+"-"+(scheme==="light"?"day":"night");
    for(let frame=0;frame<(shot.frames??1);frame++){
     if(frame){
      const moved=await page.evaluate(()=>{const el=document.scrollingElement!;const before=el.scrollTop;el.scrollBy(0,Math.round(innerHeight*.8));return el.scrollTop!==before;});
      if(!moved)break;
      await page.waitForTimeout(250);
     }
     const label=base+(frame?`-${frame+1}`:"");
     const filename=label+'.png',path=join('test-results/screens/v7',filename);
     const png=await page.screenshot({path,animations:"disabled"});
     await info.attach(label,{path,contentType:'image/png'});
     // Keep the original image alongside JUnit even when the runner times out before writing XML.
     if(process.env.CI_JUNIT_DIR){
      const folder=join(process.env.CI_JUNIT_DIR,'screens','v7');
      await mkdir(folder,{recursive:true});
      await writeFile(join(folder,filename),png);
     }
    }
   });
  }
 }
}
