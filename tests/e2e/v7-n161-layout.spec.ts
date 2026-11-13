import {test,expect,type Page} from "@playwright/test";
// N161 (Owner phone screenshots, 13 Nov 2026): Today's Continue cards line up at the bottom; the Atlas concept
// sheet never shows half-hidden buttons; the Calendar ruler is part of the dock instead of lying over the day.
// Each check runs at 360 and 390 px and with large text; each fails on the code before N161.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata"});
const base="/lemma/?demo=1&flags=v7Shell,v6Shell";
const sizes=[[390,1],[360,1],[360,1.3],[390,1.6]] as const;
async function open(page:Page,hash:string,width:number,scale:number){
 await page.setViewportSize({width,height:844});
 await page.goto(base+hash);
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 if(scale!==1)await page.addStyleTag({content:"html{font-size:"+(scale*100)+"% !important}"});
}
// The floating dock (tab list and + button) is the outer .v7-dock.
const dockBox=async(page:Page)=>(await page.locator(".v7-dock").boundingBox())!;

for(const [width,scale] of sizes){
 test("Today's Continue cards share one bottom edge and one meter line at "+width+" px, text x"+scale,async({page})=>{
  await open(page,"",width,scale);
  const tiles=page.locator(".v7-today-tile");
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBeGreaterThan(1);
  const rows=await tiles.evaluateAll(nodes=>nodes.map(node=>{
   const tile=node.getBoundingClientRect(),meter=node.querySelector(".v7-today-tile-meter")!.getBoundingClientRect();
   return {bottom:Math.round(tile.bottom),meterBottom:Math.round(meter.bottom)};
  }));
  expect(new Set(rows.map(row=>row.bottom)).size,JSON.stringify(rows)).toBe(1);
  expect(new Set(rows.map(row=>row.meterBottom)).size,JSON.stringify(rows)).toBe(1);
 });

 test("the Atlas sheet peeks with whole rows only, and shows both buttons when pulled up, at "+width+" px, text x"+scale,async({page})=>{
  await open(page,"&theme=graph-night#/atlas",width,scale);
  await expect(page.locator(".v7-atlas-sky")).toHaveAttribute("data-stars","82");
  await page.getByRole("button",{name:"Search concepts"}).click();
  await page.getByPlaceholder("Find a concept").fill("comp");
  await page.getByRole("list",{name:"Matching concepts"}).getByRole("listitem").filter({hasText:/^Compactness\s*Analysis$/}).getByRole("button").click();
  const sheet=page.getByRole("region",{name:"Compactness"});
  await expect(sheet).toBeVisible();
  // Peek: no button is drawn, nothing inside is cut off, and the sheet rests on the tab bar.
  await expect(sheet.getByRole("link",{name:/open checkpoint/i})).toHaveCount(0);
  await expect(sheet.getByRole("link",{name:"Review cards"})).toHaveCount(0);
  const clipped=await sheet.evaluate(node=>node.scrollHeight>node.clientHeight+1);
  expect(clipped,"the peek cuts off its own content").toBe(false);
  let dock=await dockBox(page),box=(await sheet.boundingBox())!;
  // The sheet tucks under the dock's rounded top edge by its border (2 px), as before N161.
  expect(box.y+box.height).toBeLessThanOrEqual(dock.y+2);
  const controls=(await page.locator(".v7-atlas-controls").boundingBox())!;
  expect(controls.y+controls.height,"the map controls sit above the sheet").toBeLessThanOrEqual(box.y+1);
  // Pulled up: both buttons are inside the sheet, above the tab bar, and a tap at their centre reaches them.
  await sheet.getByRole("button",{name:"Show neighbours and actions"}).click();
  dock=await dockBox(page);box=(await sheet.boundingBox())!;
  for(const name of [/open checkpoint/i,/review cards/i]){
   const button=sheet.getByRole("link",{name}).first();
   await button.scrollIntoViewIfNeeded();
   const b=(await button.boundingBox())!;
   expect(b.y+b.height).toBeLessThanOrEqual(dock.y+1);
   const hit=await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest("a.v7-button"),{x:b.x+b.width/2,y:b.y+b.height/2});
   expect(hit,String(name)+" is covered").toBe(true);
  }
 });

 test("the Calendar ruler is part of the dock and leaves the day's last hour clear at "+width+" px, text x"+scale,async({page})=>{
  await page.clock.setFixedTime(new Date("2026-11-09T23:35:00+05:30"));
  await open(page,"#/calendar?view=day&date=2026-11-09",width,scale);
  const ruler=page.locator(".v7-cal-scrubber");
  await expect(ruler).toBeVisible();
  const dock=await dockBox(page),r=(await ruler.boundingBox())!;
  // Joined to the tab bar: it ends where the bar starts, and both are equally wide.
  expect(Math.abs(r.y+r.height-dock.y),"gap between ruler and tab bar").toBeLessThanOrEqual(1);
  expect(Math.abs(r.x-dock.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.width-dock.width)).toBeLessThanOrEqual(1);
  // Its time labels are whole, not cut off by the tab bar.
  const labels=await ruler.locator(".v7-ruler-label").evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().bottom));
  expect(labels.length).toBeGreaterThan(0);
  expect(Math.max(...labels)).toBeLessThanOrEqual(r.y+r.height+0.5);
  // Compact: at most 72 px tall at normal text, and the slider keeps a 44 px touch area.
  if(scale===1)expect(r.height).toBeLessThanOrEqual(72);
  expect((await page.getByRole("slider",{name:"Browse day"}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // It opens on now.
  await expect(page.getByRole("slider",{name:"Browse day"})).toHaveAttribute("aria-valuetext","23:35");
  // Scrolled to the end, the whole day grid is above the ruler.
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const grid=(await page.locator(".v7-cal-grid").boundingBox())!,after=(await ruler.boundingBox())!;
  expect(grid.y+grid.height).toBeLessThanOrEqual(after.y+1);
 });
}

for(const [width,scale] of sizes){
 test("Today's ruler labels never overlap and stay inside the card at "+width+" px, text x"+scale,async({page})=>{
  await open(page,"",width,scale);
  const card=page.getByRole("region",{name:"Today",exact:true});
  await expect(card.locator(".v7-ruler")).toBeVisible();
  const box=(await card.boundingBox())!;
  const labels=await card.locator(".v7-ruler-label").evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,text:node.textContent}}));
  expect(labels.length).toBeGreaterThanOrEqual(3);
  labels.sort((a,b)=>a.left-b.left);
  for(let i=1;i<labels.length;i++)expect(labels[i].left,labels[i-1].text+" runs into "+labels[i].text).toBeGreaterThanOrEqual(labels[i-1].right+4);
  expect(labels[0].left).toBeGreaterThanOrEqual(box.x);
  expect(labels[labels.length-1].right).toBeLessThanOrEqual(box.x+box.width);
 });
}

for(const [width,scale] of sizes){
 test("Calendar's view choice is a header menu on a phone, which frees the row the segments took, at "+width+" px, text x"+scale,async({page})=>{
  await open(page,"#/calendar?view=day&date=2026-11-09",width,scale);
  const button=page.getByRole("button",{name:"Calendar view: Day"});
  await expect(button).toBeVisible();
  // It sits in the title row, beside the title, and the segmented control is gone from the page.
  const title=(await page.getByRole("heading",{name:"Calendar",level:1}).boundingBox())!,b=(await button.boundingBox())!;
  expect(Math.abs((b.y+b.height/2)-(title.y+title.height/2))).toBeLessThanOrEqual(12);
  expect(b.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("radiogroup",{name:"Calendar view"})).toHaveCount(0);
  // The menu lists the four views, with the current one checked, and switching works by tap and by keyboard.
  await button.click();
  const menu=page.getByRole("menu",{name:"Calendar view"});
  await expect(menu.getByRole("menuitemradio")).toHaveText(["Day","Week","Month","Agenda"]);
  await expect(menu.getByRole("menuitemradio",{name:"Day"})).toHaveAttribute("aria-checked","true");
  await expect(menu.getByRole("menuitemradio",{name:"Day"})).toBeFocused();
  const item=(await menu.getByRole("menuitemradio",{name:"Agenda"}).boundingBox())!;
  expect(item.x+item.width).toBeLessThanOrEqual(width);
  await menu.getByRole("menuitemradio",{name:"Week"}).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("button",{name:"Calendar view: Week"})).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio",{name:"Month"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu",{name:"Calendar view"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Calendar view: Week"})).toBeFocused();
 });
}
test("wide screens keep the segmented view control and no header menu",async({page})=>{
 await open(page,"#/calendar?view=week&date=2026-11-09",1024,1);
 await expect(page.getByRole("radio",{name:"Week",exact:true})).toHaveAttribute("aria-checked","true");
 await expect(page.getByRole("button",{name:/^Calendar view:/})).toHaveCount(0);
});
