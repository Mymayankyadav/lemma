import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N152 · V20: a bottom sheet drags down to dismiss (dismissSheet), and the Review hub's count counts to its new value
// when the round changes (interpolateNumber), except with reduced motion.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata"});

async function openCustomise(page:Page){
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 await page.goto(at("/review"));
 await page.getByRole("button",{name:"Customise this round"}).click();
 const sheet=page.getByRole("dialog",{name:"Customise this round"});
 await expect(sheet).toBeVisible();
 await expect.poll(()=>sheet.evaluate(node=>getComputedStyle(node).opacity)).toBe("1");
 return sheet;
}
async function pull(page:Page,from:{x:number;y:number},distance:number,steps:number){
 await page.mouse.move(from.x,from.y);
 await page.mouse.down();
 await page.mouse.move(from.x,from.y+distance,{steps});
 await page.mouse.up();
}

test("N152 dragging the sheet's header down past 30% closes it",async({page})=>{
 const sheet=await openCustomise(page);
 const box=(await sheet.locator(".v7-sheet-header h2").boundingBox())!;
 const height=(await sheet.boundingBox())!.height;
 await pull(page,{x:box.x+box.width/2,y:box.y+box.height/2},Math.ceil(height*.45),12);
 await expect(sheet).toBeHidden();
 await expect(page.getByRole("button",{name:"Customise this round"})).toBeFocused();
});

test("N152 a short slow pull settles back and the sheet stays",async({page})=>{
 const sheet=await openCustomise(page);
 const box=(await sheet.locator(".v7-grabber").boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 for(let step=1;step<=6;step++){await page.mouse.move(box.x+box.width/2,box.y+box.height/2+step*8);await page.waitForTimeout(40);}
 expect(await sheet.evaluate(node=>node.style.transform)).toBe("translateY(48px)");
 await page.waitForTimeout(150);
 await page.mouse.up();
 await expect(sheet).toBeVisible();
 await expect.poll(()=>sheet.evaluate(node=>node.getBoundingClientRect().bottom)).toBeCloseTo(844,0);
});

async function countsSeen(page:Page){
 await page.goto(at("/review"));
 const figure=page.getByLabel("Cards in this round");
 await expect(figure).toHaveText("23");
 await figure.evaluate(node=>{
  const seen:string[]=[];(window as unknown as {seen:string[]}).seen=seen;
  new MutationObserver(()=>seen.push(node.textContent??"")).observe(node,{childList:true,characterData:true,subtree:true});
 });
 const subject=page.getByRole("group",{name:"Subjects in this round"}).getByRole("button").first();
 const target=Number(await subject.locator("strong").textContent());
 await subject.click();
 await expect(figure).toHaveText(String(target));
 return {target,seen:(await page.evaluate(()=>(window as unknown as {seen:string[]}).seen)).map(Number)};
}
test.describe("with motion allowed",()=>{
 test.use({reducedMotion:"no-preference"});
 test("N152 the Review count counts to the new round",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const {target,seen}=await countsSeen(page);
  expect(seen.at(-1)).toBe(target);
  expect(seen.some(value=>value>target&&value<23)).toBe(true);
 });
});
// The suite's default is reduced motion (playwright.config.ts), as every other spec runs.
test("N152 with reduced motion the Review count changes at once",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {target,seen}=await countsSeen(page);
 expect(seen).toEqual([target]);
});
