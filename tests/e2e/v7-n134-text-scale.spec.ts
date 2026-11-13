import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N134 · v7 UX audit r3, U2 (V11): the web layer holds when people raise their system text size. The page's root font
// is set to 130% and 200% at 360 px (the audit's "Android large text" profile); 390 px at 100% guards the default look.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"light"});
async function open(page:Page,hash:string,{width=360,scale=100}={}){
 await page.setViewportSize({width,height:800});
 await page.addInitScript(size=>{document.addEventListener("DOMContentLoaded",()=>{document.documentElement.style.fontSize=size+"%";});},scale);
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(200);
}
type Box={left:number;right:number;top:number;bottom:number;text:string};
const textBoxes=(page:Page,selector:string)=>page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{
 const range=document.createRange();range.selectNodeContents(node);const box=range.getBoundingClientRect(),style=getComputedStyle(node);
 const hidden=style.visibility==="hidden"||style.clipPath==="inset(50%)"||box.width<2;
 return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,text:(node.textContent??"").trim(),hidden};
}).filter(box=>!box.hidden) as Box[]);
const overlaps=(boxes:Box[])=>boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1).map(b=>a.text+" × "+b.text));

for(const scale of [130,200]){
 test(`V11 · ${scale}% text: dock names never run together, and every tab keeps its name for assistive technology`,async({page})=>{
  await open(page,"/",{scale});
  const visible=await textBoxes(page,".v7-tabbar .v7-tab-label");
  expect(overlaps(visible)).toEqual([]);
  const tabs=await page.locator(".v7-tabbar .v7-tab").evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect()));
  for(const label of visible)expect(label.right,label.text).toBeLessThanOrEqual(Math.max(...tabs.map(tab=>tab.right))+1);
  for(const name of ["Today","Paths","Review","Calendar","Progress"])await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:new RegExp(name)})).toHaveCount(1);
 });
 test(`V11 · ${scale}% text: the calendar's hours keep every digit`,async({page})=>{
  await open(page,"/calendar?view=day&date=2026-11-09",{scale});
  const gutter=(await page.locator(".v7-cal-gutter").first().boundingBox())!;
  const times=await textBoxes(page,".v7-cal-gutter time");
  expect(times.length).toBeGreaterThan(3);
  for(const time of times)expect(time.left,time.text).toBeGreaterThanOrEqual(gutter.x-0.5);
 });
 test(`V11 · ${scale}% text: Capture's type choice never overlaps (segments that fit, or a menu)`,async({page})=>{
  await open(page,"/",{scale});
  await page.getByRole("button",{name:"Capture"}).click();
  const sheet=page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const kinds=sheet.locator(".v7-capture-kinds");
  if(await kinds.locator(".v7-segmented-menu").count()){
   await expect(kinds.locator(".v7-segmented-measure")).toHaveAttribute("aria-hidden","true");
   await expect(kinds.getByRole("radiogroup")).toHaveCount(0);
  }else{
   const labels=await kinds.locator(".v7-segmented button").evaluateAll(nodes=>nodes.map(node=>{const range=document.createRange();range.selectNodeContents(node);return range.getBoundingClientRect().width-node.clientWidth;}));
   for(const overflow of labels)expect(overflow).toBeLessThanOrEqual(0);
  }
 });
 test(`V11 · ${scale}% text: Focus keeps Drifted on the screen`,async({page})=>{
  await open(page,"/",{scale});
  const start=page.getByRole("button",{name:/^(Start now|Start focus)$/});
  if(await start.count()){await start.first().click();await page.waitForURL(/#\/focus/);}
  else await page.goto(at("/focus"));
  const drifted=page.getByRole("button",{name:"Drifted: log a distraction"});
  await expect(drifted).toBeVisible();
  const box=(await drifted.boundingBox())!;
  expect(box.x+box.width).toBeLessThanOrEqual(360);
  // Nothing on Focus is wider than the screen (the header, the clock and the controls row were, at 200%); the faint
  // emblem behind the clock is decorative and clipped on purpose.
  const wide=await page.locator("main > *, main .v7-focus-centre > *, main .v7-focus-thought").evaluateAll(nodes=>nodes
   .filter(node=>!node.classList.contains("v7-focus-emblem")).map(node=>Math.round(node.getBoundingClientRect().right)).filter(right=>right>360));
  expect(wide).toEqual([]);
  const field=(await page.getByRole("textbox",{name:"Park a thought"}).boundingBox())!;
  expect(field.x+field.width).toBeLessThanOrEqual(360);
 });
 test(`V11 · ${scale}% text: stat tiles stay on the screen`,async({page})=>{
  for(const hash of ["/review","/insights","/cards/1"]){
   await open(page,hash,{scale});
   const tiles=await page.locator(".v7-rv-tiles > *, .v7-progress-stats > *, .v7-card-stats > *").evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().right));
   for(const right of tiles)expect(right,hash).toBeLessThanOrEqual(360+0.5);
  }
 });
}

test("V11 · 390 px at 100%: the default look keeps every dock name and Capture's segments",async({page})=>{
 await open(page,"/",{width:390});
 await expect(page.locator(".v7-tabbar")).toHaveAttribute("data-labels","all");
 expect((await textBoxes(page,".v7-tabbar .v7-tab-label")).length).toBe(5);
 await page.getByRole("button",{name:"Capture"}).click();
 await expect(page.getByRole("dialog").getByRole("radiogroup",{name:"Type"})).toBeVisible();
 await page.keyboard.press("Escape");
 await open(page,"/review",{width:390});
 await expect(page.locator(".v7-rv-tiles > *").first()).toBeVisible();
 // Three stat tiles across, as before.
 const tops=await page.locator(".v7-rv-tiles > *").evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().top)));
 expect(new Set(tops).size).toBe(1);
});
