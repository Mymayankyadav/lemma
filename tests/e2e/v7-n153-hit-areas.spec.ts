import {test,expect,type Locator,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N153 · V36 leftovers: the Inbox list's checkboxes and the card's recall-chart review dots answer a tap anywhere within
// 44 px: the element at 21 px from the control's centre, up, down, left and right, is the control (or its label).
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata"});

type Probe={dx:number;dy:number;hit:boolean;at:string};
/** For each control, what is under the four points 21 px from its centre. */
async function probe(controls:Locator):Promise<Probe[][]>{
 return controls.evaluateAll(nodes=>nodes.map(node=>{
  const element=node as HTMLElement;
  element.scrollIntoView({block:"center",inline:"nearest"});
  const box=element.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
  const owner=element.closest("label")??element;
  return [[21,0],[-21,0],[0,21],[0,-21]].map(([dx,dy])=>{
   const under=document.elementFromPoint(x+dx,y+dy);
   return {dx,dy,hit:!!under&&(under===element||owner.contains(under)),at:under?under.tagName.toLowerCase()+"."+(under.getAttribute("class")??""):"nothing"};
  });
 }));
}
const misses=(probes:Probe[][])=>probes.flatMap((points,index)=>points.filter(point=>!point.hit).map(point=>({control:index,...point})));
async function load(page:Page,width:number,hash:string){
 await page.setViewportSize({width,height:800});
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
}

for(const width of [360,390]){
 test(`N153 the Inbox list's checkboxes take a tap within 44 px (${width} px)`,async({page})=>{
  await load(page,width,"/proposals?view=list");
  const boxes=page.locator(".v7-inbox-group input[type=checkbox]");
  await expect(boxes.first()).toBeVisible();
  expect(await boxes.count()).toBeGreaterThan(1);
  expect(misses(await probe(boxes))).toEqual([]);
  // A tap at the left edge of the hit area still ticks the box.
  const first=boxes.first(),box=(await first.boundingBox())!;
  await page.mouse.click(box.x+box.width/2-21,box.y+box.height/2);
  await expect(first).toBeChecked();
 });

 test(`N153 the card's recall-chart review dots take a tap within 44 px (${width} px)`,async({page})=>{
  await load(page,width,"/cards/1");
  const dots=page.locator(".v7-recall-hits button");
  await expect(dots.first()).toBeAttached();
  expect(await dots.count()).toBeGreaterThan(1);
  expect(misses(await probe(dots))).toEqual([]);
 });
}
