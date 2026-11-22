import {test,expect,type Page} from "@playwright/test";
// N161 (Owner phone screenshots, 13 Nov 2026): Today's Continue cards line up at the bottom and the Atlas
// concept sheet keeps actions within reach. The Calendar ruler now opens in Browse day (N209 and N214).
// Each check runs at 360 and 390 px and with large text.
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

 test("the Atlas sheet keeps the peek and expanded actions reachable at "+width+" px, text x"+scale,async({page})=>{
  await open(page,"&theme=graph-night#/atlas",width,scale);
  await expect(page.locator(".v7-atlas-sky")).toHaveAttribute("data-stars","82");
  await page.getByRole("button",{name:"Search concepts"}).click();
  await page.getByPlaceholder("Find a concept").fill("comp");
  await page.getByRole("list",{name:"Matching concepts"}).getByRole("listitem").filter({hasText:/^Compactness\s*Analysis$/}).getByRole("button").click();
  const sheet=page.getByRole("region",{name:"Compactness"});
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name:"Show less"}).click();
  // The peek offers the two main actions and keeps the extra checkpoint link for the expanded sheet.
  const checkpoint=sheet.getByRole("link",{name:"Open Checkpoint 4",exact:true});
  const review=sheet.getByRole("link",{name:"Review 9",exact:true});
  const tutor=sheet.getByRole("link",{name:"Continue with tutor",exact:true});
  await expect(checkpoint).toHaveCount(0);
  const clipped=await sheet.evaluate(node=>node.scrollHeight>node.clientHeight+1);
  expect(clipped,"the peek cuts off its own content").toBe(false);
  await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeHidden();
  const box=(await sheet.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(150);
  expect(box.y+box.height).toBeLessThanOrEqual(845);
  const controls=(await page.locator(".v7-atlas-controls").boundingBox())!;
  expect(controls.y+controls.height,"the map controls sit above the sheet").toBeLessThanOrEqual(box.y+1);
  const reachable=async(button:typeof review)=>{
   await expect(button).toBeVisible();
   const b=(await button.boundingBox())!;
   expect(b.y+b.height).toBeLessThanOrEqual(845);
   const hit=await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest("a.v7-button"),{x:b.x+b.width/2,y:b.y+b.height/2});
   expect(hit,(await button.textContent())+" is covered").toBe(true);
  };
  for(const button of [tutor,review])await reachable(button);
  await sheet.getByRole("button",{name:"Show neighbours and actions"}).click();
  await expect(review).toHaveAttribute("href","#/review/run?target=concept&id=concept-compactness");
  for(const button of [checkpoint,review]){
   await button.scrollIntoViewIfNeeded();
   await reachable(button);
  }
  await sheet.getByRole("button",{name:"Close details"}).click();
  await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeVisible();
 });

 test("the Calendar ruler opens on demand and leaves the day's last hour clear at "+width+" px, text x"+scale,async({page})=>{
  await page.clock.setFixedTime(new Date("2026-11-09T23:35:00+05:30"));
  await open(page,"#/calendar?view=day&date=2026-11-09",width,scale);
  const browse=page.getByRole("button",{name:"Browse day",exact:true});
  const sheet=page.getByRole("dialog",{name:"Browse day",exact:true}),slider=sheet.getByRole("slider",{name:"Time"});
  await expect(slider).toHaveCount(0);
  await expect(browse).toBeVisible();
  expect((await browse.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await browse.click();
  await expect(slider).toHaveAttribute("aria-valuetext","23:35");
  expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const bounds=(await sheet.boundingBox())!;
  const labels=await sheet.locator(".v7-ruler-label").evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().bottom));
  expect(labels.length).toBeGreaterThan(0);
  expect(Math.max(...labels)).toBeLessThanOrEqual(bounds.y+bounds.height+0.5);
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext","23:55");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(browse).toBeFocused();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const grid=page.getByRole("region",{name:"Day time grid"}),last=grid.locator(".v7-cal-gutter time").last();
  await expect(last).toHaveText("23:00");
  await expect(last).toBeInViewport();
  const hour=(await last.boundingBox())!,dock=await dockBox(page);
  expect(hour.y+hour.height).toBeLessThanOrEqual(dock.y+1);
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
 // N220 (Owner report): the hub header matches every other hub (title and page actions only); the view menu leads the
 // Calendar toolbar under the tabs, beside the period arrows.
 test("Calendar's view choice is a compact menu in the Calendar toolbar on a phone, which frees the row the segments took, at "+width+" px, text x"+scale,async({page})=>{
  await open(page,"#/calendar?view=day&date=2026-11-09",width,scale);
  const button=page.getByRole("button",{name:"Calendar view: Day"});
  await expect(button).toBeVisible();
  // The week strip carries the dates; date picking is available as the fourth action rather than a duplicate pill.
  const title=page.getByRole("heading",{name:"Calendar",exact:true});
  await expect(title).toBeVisible();
  await expect(page.getByRole("button",{name:/^Calendar date:/})).toHaveCount(0);
  const toolbar=page.getByRole("group",{name:"Calendar navigation"});
  await expect(toolbar.getByRole("button",{name:"Calendar view: Day"})).toBeVisible();
  await expect(page.locator(".v7-hub-bar").getByRole("button",{name:/^Calendar view:/})).toHaveCount(0);
  const titleBox=(await title.boundingBox())!,b=(await button.boundingBox())!,tabs=(await page.getByRole("navigation",{name:"Calendar sections"}).boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(titleBox.y+titleBox.height);
  expect(b.y).toBeGreaterThanOrEqual(tabs.y+tabs.height-1);
  expect(b.x+b.width).toBeLessThanOrEqual(width);
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
