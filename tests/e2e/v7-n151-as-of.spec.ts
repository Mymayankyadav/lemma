import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N151 · AN3 "Offline made visible": when Today's or the Review hub's numbers come from the saved copy rather than the
// server, "as of HH:MM" sits beside them; with fresh numbers nothing is shown.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata"});

const go=(page:Page,hash:string)=>page.evaluate(next=>{location.hash=next;},hash);
const noSideScroll=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);

for(const width of [360,390])test(`N151 offline, Today and Review say "as of"; back online they do not (${width} px)`,async({page,context})=>{
 await page.setViewportSize({width,height:800});
 await page.clock.setFixedTime(NOW);
 await page.goto(at("/review"));
 await expect(page.getByLabel("Cards in this round")).toBeVisible();
 await go(page,"#/");
 await expect(page.locator(".v7-today-hero")).toBeVisible();
 await expect(page.locator(".v7-as-of")).toHaveCount(0);

 await context.setOffline(true);
 const today=page.locator(".v7-today-briefing .v7-as-of");
 await expect(today).toHaveText("Working from your notebook · as of 13:43");
 await expect(today).toBeVisible();
 expect(await noSideScroll(page)).toBe(true);

 await go(page,"#/review");
 const review=page.locator(".v7-rv-hero .v7-as-of");
 await expect(review).toHaveText("Working from your notebook · as of 13:43");
 await expect(page.getByLabel("Cards in this round")).toBeVisible();
 await expect(page.getByRole("alert")).toHaveCount(0);
 expect(await noSideScroll(page)).toBe(true);

 await context.setOffline(false);
 await expect(review).toHaveCount(0);
 await go(page,"#/");
 await expect(page.locator(".v7-today-hero")).toBeVisible();
 await expect(page.locator(".v7-as-of")).toHaveCount(0);
});
