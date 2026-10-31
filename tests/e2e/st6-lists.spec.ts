import { test, expect, type Page } from "@playwright/test";
import {mkdirSync} from "node:fs";

const destinations=[
 {hash:"/p/real-analysis?tab=sessions",slug:"sessions",heading:"Project"},
 {hash:"/s/real-analysis/7",slug:"session-detail",heading:"Session record"},
 {hash:"/proposals",slug:"proposals",heading:"Approve"},
 {hash:"/p/real-analysis?tab=sources",slug:"sources",heading:"Project"},
] as const;
for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test(`ST-6 lists ${profile} ${theme} ${width}px`,async({page}: {page:Page})=>{
  test.setTimeout(240_000);
  await page.setViewportSize({width,height});
  await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:""}));
  await page.route("https://fonts.gstatic.com/**",r=>r.fulfill({body:""}));
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#${destinations[0].hash}`,{waitUntil:"domcontentloaded"});
  for(const screen of destinations){
   await page.evaluate((hash)=>{location.hash=hash},screen.hash);
   await expect(page.getByRole("heading",{name:screen.heading,level:1,exact:true})).toBeVisible({timeout:90_000});
   await page.waitForTimeout(150);
   if(screen.slug==="sessions"){
    const sessions=page.getByRole("region",{name:"Sessions"});
    await expect(sessions).toContainText(profile==="extreme"?"1–20 of 1000":"1–20 of 300");
    await expect(sessions.getByRole("button",{name:/More sessions/})).toBeVisible();
   }
   if(screen.slug==="session-detail"){
    const reasoning=page.getByRole("region",{name:"Reasoning"});
    await expect(reasoning.getByRole("button",{name:/9 hints/}).first()).toBeVisible();
    await expect(reasoning.getByText(/Attempt/).first()).toBeVisible();
    expect(await reasoning.locator("li").count()).toBeLessThan(100);
   }
   if(screen.slug==="sources"){
    await expect(page.getByRole("region",{name:"Sources"})).toContainText(profile==="extreme"?"100 sources":"30 sources");
   }
   const metrics=await page.evaluate(()=>({
    nodes:document.querySelectorAll("*").length,
    overflow:document.documentElement.scrollWidth-innerWidth,
   }));
   expect.soft(metrics.overflow,`${screen.slug} overflow`).toBeLessThanOrEqual(1);
   expect.soft(metrics.nodes,`${screen.slug} nodes`).toBeLessThan(1500);
   mkdirSync("test-results/screens/st6",{recursive:true});
   await page.screenshot({path:`test-results/screens/st6/${profile}-${theme}-${width}-${screen.slug}.png`,fullPage:false});
  }
  await page.evaluate(()=>{location.hash="/proposals"});
  await expect(page.getByRole("region",{name:"Proposal groups"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Proposal groups"}).getByRole("button",{name:/Approve all from/}).first()).toBeVisible();
  await page.getByRole("region",{name:"Proposal groups"}).getByRole("button",{name:/Approve all from/}).first().click();
  await expect(page.getByRole("dialog",{name:/Approve .* from/})).toBeVisible();
  await page.getByRole("dialog").getByRole("button",{name:"Queue approvals"}).click();
  await expect(page.getByRole("button",{name:"Undo"})).toBeVisible();
  await page.getByRole("button",{name:"Undo"}).click();
  await expect(page.getByRole("button",{name:"Undo"})).toHaveCount(0);
 });
}
