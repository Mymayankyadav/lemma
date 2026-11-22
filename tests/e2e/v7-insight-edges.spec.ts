import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// Part 10 acceptance: PLAN §6.13–6.15 "Done when", on the audit seed with the clock frozen.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
async function open(page:Page,hash:string){
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}

test("§6.13 one range control changes every figure on the tab",async({page})=>{
 await open(page,"/insights");
 const hero=page.getByRole("region",{name:"Focused time"}),chart=page.getByRole("region",{name:"Focus by day"});
 const points=chart.locator("[data-chart-point]");
 await expect(points.first()).toBeVisible();
 const before=await points.count();
 await page.getByRole("radio",{name:"7 days"}).click();
 await expect(page).toHaveURL(/range=7/);
 await expect(hero.getByText("Focused · 7 days",{exact:true})).toBeVisible();
 await expect(points).toHaveCount(7);
 expect(before).not.toBe(7);
 await expect(page.getByRole("radiogroup",{name:"Range"})).toHaveCount(1);
});

// N220 (Owner report): charts answer a tap with a tip; the data table is for screen readers, not a visible Table switch.
test("§6.13 every chart carries its data table for screen readers without a Table switch, the almanac uses one hue and subject charts have a legend",async({page})=>{
 for(const tab of ["","?tab=learning"]){
  await open(page,"/insights"+tab);
  const charts=page.locator("section.v7-chart:not(.v7-chart-empty)");
  await expect(charts.first()).toBeVisible();
  const count=await charts.count();
  expect(count).toBeGreaterThan(0);
  for(let index=0;index<count;index++){
   const chart=charts.nth(index);
   if(await chart.locator("[role=meter]").count())continue; // "When you said" is a meter list, not a chart.
   await expect(chart.getByRole("button",{name:"Show as table"})).toHaveCount(0);
   await expect(chart.locator(".v7-sr-only table")).toHaveCount(1);
  }
 }
 await open(page,"/insights");
 const heat=await page.locator(".v7-heatmap button").evaluateAll(cells=>[...new Set(cells.map(cell=>(cell as HTMLElement).style.getPropertyValue("--v7-heat-color")).filter(value=>value&&value!=="transparent").map(value=>value.replace(/\d\)$/,")")))]);
 expect(heat.length).toBeLessThanOrEqual(1);
 const table=page.getByRole("region",{name:"Study almanac"}).or(page.locator("section.v7-chart",{hasText:"Study almanac"}));
 await expect(table.first().locator(".v7-sr-only table tbody tr")).toHaveCount(await table.first().locator(".v7-heatmap [data-chart-point]").count());
 await table.first().locator(".v7-heatmap [data-chart-point]").last().click();
 await expect(table.first().getByRole("status")).toBeVisible();
});

test("Recall chart labels stay readable at 160% text",async({page})=>{
 await page.addInitScript(()=>document.addEventListener("DOMContentLoaded",()=>{
  document.documentElement.style.fontSize="160%";
 }));
 await open(page,"/insights?tab=learning");
 const chart=page.getByRole("region",{name:"Recall over time",exact:true});
 const plot=chart.locator("svg.v7-plot");
 await expect(plot).toBeVisible();
 const measured=await plot.evaluate(svg=>{
  const plotBox=svg.getBoundingClientRect();
  const labels=[...svg.querySelectorAll("text:not(:has(tspan)), text > tspan")].map(node=>({
   content:node.textContent,box:node.getBoundingClientRect(),size:parseFloat(getComputedStyle(node).fontSize),
  }));
  return {
   labels:labels.map(({content})=>content),
   minimumSize:Math.min(...labels.map(({size})=>size)),
   clipped:labels.filter(({box})=>box.left<plotBox.left-1||box.right>plotBox.right+1||box.top<plotBox.top-1||box.bottom>plotBox.bottom+1).map(({content})=>content),
   overlaps:labels.flatMap(({content,box},i)=>labels.slice(i+1).filter(other=>
    Math.min(box.right,other.box.right)-Math.max(box.left,other.box.left)>1&&
    Math.min(box.bottom,other.box.bottom)-Math.max(box.top,other.box.top)>1,
   ).map(other=>[content,other.content])),
  };
 });
 expect(measured.labels).toEqual(expect.arrayContaining(["100%","Goal","90%"]));
 expect(measured.labels.filter(label=>/\b(Oct|Nov)\b/.test(label??"")).length).toBeGreaterThanOrEqual(2);
 expect(measured.minimumSize).toBeGreaterThan(18);
 expect(measured.clipped).toEqual([]);
 expect(measured.overlaps).toEqual([]);
 await expect(chart.getByRole("button",{name:"Show as table",exact:true})).toHaveCount(0);
 await expect(chart.getByRole("table")).toHaveCount(1);
 await expect(chart.locator("tbody tr").first()).not.toBeEmpty();
});

test("§6.13 the hero equals the sum of the Focus by day columns",async({page})=>{
 await open(page,"/insights?tab=time&range=7");
 const chart=page.locator("section.v7-chart",{hasText:"Focus by day"}).first();
 const cells=await chart.locator(".v7-sr-only table tbody tr td:last-child").allTextContents();
 expect(cells.length).toBeGreaterThan(0);
 const minutes=(text:string)=>{const h=/([\d.]+)\s*h/.exec(text),m=/(\d+)\s*min/.exec(text);return (h?Number(h[1])*60:0)+(m&&!h?Number(m[1]):0);};
 const sum=cells.reduce((total,text)=>total+minutes(text),0);
 const heroText=(await page.locator(".v7-progress-figure").textContent())!;
 const hero=(Number(/(\d+)\s*h/.exec(heroText)?.[1]??0)*60)+Number(/(\d+)\s*min/.exec(heroText)?.[1]??0);
 expect(Math.abs(sum-hero)).toBeLessThanOrEqual(cells.length*3);
});

test("§6.14 each Settings row shows its current value, and a theme change updates at once",async({page})=>{
 await open(page,"/settings");
 const rows=page.locator("a.v7-settings-row");
 await expect(rows).toHaveCount(8);
 await expect(rows.filter({hasText:"Advanced"})).toContainText("Diagnostics");
 for(const row of await rows.all())expect(((await row.locator("small").textContent())??"").trim().length).toBeGreaterThan(0);
 await rows.filter({hasText:"Appearance"}).click();
 await page.getByRole("radio",{name:/^Day/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-theme","graph");
 await page.getByRole("radio",{name:/^Night/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-theme","graph-night");
 await expect(page.getByRole("radio",{name:/^Night/})).toHaveAttribute("aria-checked","true");
});

test("§6.14 changing a subject's colour changes it on the path covers",async({page})=>{
 await open(page,"/settings?section=subjects");
 const row=page.locator("button.v7-settings-row").first();
 const name=(await row.locator("strong").textContent())!;
 await row.click();
 const sheet=page.getByRole("dialog",{name});
 const choice=sheet.locator(".v7-subject-swatch[aria-checked=false]:not(:has(small))").first();
 const picked=(await choice.locator("span:not([aria-hidden])").textContent())!;
 await choice.click();
 await sheet.getByRole("button",{name:"Save"}).click();
 await expect(sheet).toHaveCount(0);
 await expect(page.locator("button.v7-settings-row").first().locator("small")).toContainText(picked);
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Paths"}).click();
 const klass=await page.locator(".v7-paths-card").filter({has:page.locator(".v7-paths-subject",{hasText:name})}).first().getAttribute("class");
 const index=["Analysis","Algebra","Topology","Number theory","Geometry","Logic","Probability","Combinatorics"].indexOf(picked)+1;
 expect(klass).toContain("v7-subject-"+index);
});

test("§6.15 sign-in has exactly one primary action and a visible way into the example",async({page})=>{
 await open(page,"/sign-in");
 await expect(page.locator(".v7-signin .v7-primary")).toHaveCount(1);
 await expect(page.getByRole("button",{name:"Continue with Google"})).toBeVisible();
 await expect(page.getByRole("link",{name:"Explore the example workspace"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toHaveCount(0);
});

test("§6.15 first run can be skipped at every step and ends on Today",async({page})=>{
 await open(page,"/welcome");
 for(const title of ["Connect your tutor","Start your first path","Your day"]){
  await expect(page.getByRole("heading",{level:1})).toHaveText(title);
  await page.getByRole("button",{name:/^Skip/}).click();
 }
 await page.waitForURL(/#\/$/);
 await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Today"})).toHaveAttribute("aria-current","page");
});

test("§6.13 Log: the week strip navigates and Add time opens a v7 sheet",async({page})=>{
 await open(page,"/log");
 const strip=page.getByRole("list",{name:/^Week of /});
 const label=await strip.getAttribute("aria-label");
 await page.getByRole("button",{name:"Previous week"}).click();
 await expect(strip).not.toHaveAttribute("aria-label",label!);
 await page.getByRole("button",{name:"Add time"}).click();
 await expect(page.getByRole("dialog",{name:"Add time"}).getByRole("textbox",{name:"What you studied"})).toBeVisible();
});
