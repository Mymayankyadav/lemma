import {test,expect,type Page} from "@playwright/test";
// PLAN §6.12 "Done when", on the seed, with v7 on.
const atlas=(query="",theme="graph")=>"/lemma/?demo=1&flags=v7Shell,v6Shell&theme="+theme+"#/atlas"+query;
const sky=(page:Page)=>page.locator(".v7-atlas-sky");
async function search(page:Page,term:string){
 await page.getByRole("button",{name:"Search concepts"}).click();
 await page.getByPlaceholder("Find a concept").fill(term);
}

for(const theme of ["graph","graph-night"] as const){
 test("the seed shows 82 stars in three constellations, 9 demonstrated, laid out off the main thread in "+theme,async({page})=>{
  await page.goto(atlas("",theme));
  await expect(page.locator("html")).toHaveAttribute("data-v7","");
  await expect(page.getByRole("heading",{name:"Atlas",exact:true})).toBeVisible();
  await expect(sky(page)).toHaveAttribute("data-stars","82");
  await expect(sky(page)).toHaveAttribute("data-clusters","3");
  await expect(sky(page)).toHaveAttribute("data-demonstrated","9");
  await expect(sky(page)).toHaveAttribute("data-layout",/^(worker|cache)$/);
  await expect(page.getByTestId("atlas-summary")).toHaveText("82 concepts, 26 connections, 9 demonstrated");
  // The canvas is hidden from assistive technology and actually drawn.
  const canvas=sky(page).locator("canvas");
  await expect(canvas).toHaveAttribute("aria-hidden","true");
  const painted=await canvas.evaluate((element:HTMLCanvasElement)=>{
   const ctx=element.getContext("2d")!,data=ctx.getImageData(0,0,element.width,element.height).data,first=data.slice(0,4).join();
   let differing=0;for(let i=0;i<data.length;i+=4*97)if(data.slice(i,i+4).join()!==first)differing++;
   return {width:element.width,differing};
  });
  expect(painted.width).toBeGreaterThan(0);
  expect(painted.differing).toBeGreaterThan(20);
 });
}

test("searching comp lists 7 concepts; Compactness opens its sheet and Open checkpoint goes to Checkpoint 4",async({page})=>{
 await page.goto(atlas());
 await expect(sky(page)).toHaveAttribute("data-stars","82");
 await search(page,"comp");
 await expect(page.getByRole("status").filter({hasText:"matching"})).toHaveText("7 matching concepts");
 const matches=page.getByRole("list",{name:"Matching concepts"}).getByRole("listitem");
 await expect(matches).toHaveCount(7);
 await matches.filter({hasText:/^Compactness\s*Analysis$/}).getByRole("button").click();
 const sheet=page.getByRole("region",{name:"Compactness"});
 await expect(sheet).toBeVisible();
 await expect(sheet.getByTestId("atlas-counts")).toHaveText("Checkpoint 4 · 9 cards due · 6 neighbours");
 await expect(sheet.getByText("In progress",{exact:true})).toBeVisible();
 await expect(sky(page)).toHaveAttribute("data-selected","concept-compactness");
 // The camera flies to the chosen star and stays within the zoom range.
 await expect(sky(page)).toHaveAttribute("data-zoom",/^(1\.[4-9]\d|[2-4]\.\d\d)$/);
 const box=await sheet.boundingBox(),viewport=page.viewportSize()!;
 expect(box!.y+box!.height).toBeGreaterThanOrEqual(viewport.height-1);
 expect(viewport.height-box!.y).toBeLessThanOrEqual(200);
 await sheet.getByRole("button",{name:"Show neighbours and actions"}).click();
 await expect(sheet.getByRole("heading",{name:"Needs · 4"})).toBeVisible();
 await expect(sheet.getByRole("heading",{name:"Opens up · 2"})).toBeVisible();
 await sheet.getByRole("link",{name:"Open Checkpoint 4"}).click();
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4$/);
});

test("switching between Map and List keeps the selection",async({page})=>{
 await page.goto(atlas("?id=concept-compactness"));
 await expect(page.getByRole("region",{name:"Compactness"})).toBeVisible();
 await page.getByRole("radio",{name:"List",exact:true}).click();
 const row=page.getByRole("region",{name:"Concept list"}).getByRole("button",{name:/^Compactness In progress/});
 await expect(row).toHaveAttribute("aria-current","true");
 await expect(page.getByRole("region",{name:"Compactness"})).toBeVisible();
 await page.getByRole("radio",{name:"Map",exact:true}).click();
 await expect(sky(page)).toHaveAttribute("data-selected","concept-compactness");
 await expect(page.getByRole("region",{name:"Compactness"})).toBeVisible();
});

test("drag pans, the wheel and double tap zoom, Recentre frames the sky, and a tap on empty sky clears the selection",async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await page.goto(atlas("?id=concept-compactness"));
 const canvas=sky(page).locator("canvas");
 await expect(sky(page)).toHaveAttribute("data-zoom","1.40");
 const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width-60,box.y+120);
 await page.mouse.wheel(0,-400);
 await expect(sky(page)).not.toHaveAttribute("data-zoom","1.40");
 await page.getByRole("button",{name:"Recentre map"}).click();
 await expect(sky(page)).toHaveAttribute("data-zoom",/^(0\.\d\d|1\.[0-3]\d)$/);
 const before=Number(await sky(page).getAttribute("data-zoom"));
 await page.getByRole("button",{name:"Zoom in"}).click();
 await expect.poll(async()=>Number(await sky(page).getAttribute("data-zoom"))).toBeGreaterThan(before);
 // A tap on empty sky (top-right corner under the bar) clears the selection.
 await page.mouse.click(box.x+box.width-12,box.y+96);
 await expect(sky(page)).toHaveAttribute("data-selected","");
 await expect(page.getByRole("region",{name:"Compactness"})).toHaveCount(0);
 const zoomed=Number(await sky(page).getAttribute("data-zoom"));
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
 await expect.poll(async()=>Number(await sky(page).getAttribute("data-zoom"))).toBeGreaterThan(zoomed*1.5);
});

test("reduced motion jumps instead of flying, and the legend explains every mark",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto(atlas());
 await expect(sky(page)).toHaveAttribute("data-motion","reduced");
 await search(page,"Heine");
 await page.getByRole("list",{name:"Matching concepts"}).getByRole("button").first().click();
 await expect(sky(page)).toHaveAttribute("data-zoom","1.40");
 await page.getByRole("button",{name:"Legend"}).click();
 const legend=page.getByRole("list",{name:"Star states"});
 for(const label of ["Demonstrated","In progress","Up next","Needs a recheck","Not started","Needs (prerequisite)","Related"])
  await expect(legend.getByText(label,{exact:true})).toBeVisible();
});
