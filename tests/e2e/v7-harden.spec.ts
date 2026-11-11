import {test,expect} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// Part 12 checks that run in a browser: 200% text on the Part 8–10 screens, and rollback (flag off restores v6 on every
// route v7 owns). Device, hardware-keyboard and screen-reader checks stay with the Owner.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
const screens=["/projects","/p/real-analysis/cp/CP4","/s/real-analysis/7","/cards","/cards/1","/proposals","/proposals?tab=plan","/insights","/insights?tab=learning","/insights?tab=time","/log","/settings","/settings?section=appearance","/settings?section=subjects","/sign-in","/welcome"];

test("Q3: the Part 8–10 screens work at 200% text with no sideways scroll at 390 px",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 for(const hash of screens){
  await page.goto(at(hash));
  await expect(page.locator("html")).toHaveAttribute("data-v7","");
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({content:"html{font-size:200% !important}"});
  await page.waitForTimeout(150);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow,hash).toBeLessThanOrEqual(1);
  await expect(page.locator("h1").first(),hash).toBeAttached();
 }
});

test("rollback: with v7Shell off every route v7 owns renders the v6 shell",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 const routes=["/","/projects","/p/real-analysis","/p/real-analysis/cp/CP4","/s/real-analysis/7","/cards","/cards/1","/proposals","/review","/calendar","/tasks","/insights","/log","/settings","/practice","/atlas"];
 for(const hash of routes){
  await page.goto("/lemma/?demo=1&flags=v6Shell,-v7Shell#"+hash);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html"),hash).toHaveAttribute("data-v6","");
  await expect(page.locator("html"),hash).not.toHaveAttribute("data-v7","");
  expect(await page.locator(".v7-page,.v7-shell").count(),hash).toBe(0);
 }
});
