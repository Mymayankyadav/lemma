import {expect,test} from "@playwright/test";

// FIX #707: all four fold choices must actually fit on a narrow Atlas,
// not merely exist in a horizontally clipped nested scroller.
for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const width of [360,390] as const){
 test(`FIX #707 visible Atlas fold toolbar ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:740});
  await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({body:""}));
  await page.route("https://fonts.gstatic.com/**",route=>route.fulfill({body:""}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
  const toolbar=page.getByRole("toolbar",{name:"Atlas view"});
  const group=toolbar.getByRole("group",{name:"Fold to depth"});
  await expect(group).toBeVisible({timeout:90_000});
  const parent=await toolbar.boundingBox();
  expect(parent).not.toBeNull();
  let previousRight=0;
  for(const name of ["Fields","Areas","Topics","All"]){
   const control=group.getByRole("button",{name,exact:true});
   await expect(control).toBeVisible();
   const box=await control.boundingBox();
   expect(box).not.toBeNull();
   expect(box!.width).toBeGreaterThanOrEqual(44);
   expect(box!.height).toBeGreaterThanOrEqual(44);
   expect(box!.x).toBeGreaterThanOrEqual(parent!.x-1);
   expect(box!.x+box!.width).toBeLessThanOrEqual(parent!.x+parent!.width+1);
   expect(box!.x).toBeGreaterThanOrEqual(previousRight-1);
   previousRight=box!.x+box!.width;
  }
  for(const name of ["Related"]){
   const control=toolbar.getByRole("button",{name,exact:true});
   await expect(control).toBeVisible();
   const box=await control.boundingBox();
   expect(box!.width).toBeGreaterThanOrEqual(44);
   expect(box!.height).toBeGreaterThanOrEqual(44);
   expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
  }
  const recheck=toolbar.getByRole("button",{name:/^Re-check \d+$/});
  await expect(recheck).toBeVisible();
  const box=await recheck.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
  const lineTops=await recheck.evaluate(element=>{
   const nodes=[...element.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim());
   return nodes.flatMap(node=>{
    const range=document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].map(rect=>Math.round(rect.top));
   });
  });
  expect(lineTops.length).toBeGreaterThan(0);
  expect(new Set(lineTops).size,"Re-check label and count must stay on one line").toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/fix-707-${profile}-${theme}-${width}.png`});
 });
}
