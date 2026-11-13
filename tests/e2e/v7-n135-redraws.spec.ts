import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
// N135 · v7 UX audit r3, P2: every drawing measured in its own 240 × 180 units (as the audit did): the object's centre
// against the disc's (120, 90). Badges sit at the bottom right on purpose, so drawings with one get a little more room.
const source=readFileSync("src/ui/v7/Illustration.tsx","utf8");
const art=Object.fromEntries([...source.matchAll(/^ {2}(\w+): `([\s\S]*?)`,$/gm)].map(match=>[match[1],match[2]]));

test("P2 · Day closed, Cards and Progress sit on the disc's centre; no drawing is more than 5 units off",async({page})=>{
 expect(Object.keys(art)).toHaveLength(9);
 const offsets:Record<string,{cx:number;cy:number}>={};
 for(const [name,markup] of Object.entries(art)){
  await page.setContent(`<svg id="s" viewBox="0 0 240 180" width="240" height="180">${markup}</svg>`);
  offsets[name]=await page.evaluate(()=>{let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
   for(const node of document.querySelectorAll<SVGGraphicsElement>("#s *:not(.bg):not(g)")){
    const box=node.getBBox(),matrix=node.getCTM()!;
    for(const [x,y] of [[box.x,box.y],[box.x+box.width,box.y+box.height]]){const at=new DOMPoint(x,y).matrixTransform(matrix);x1=Math.min(x1,at.x);y1=Math.min(y1,at.y);x2=Math.max(x2,at.x);y2=Math.max(y2,at.y);}
   }
   return {cx:(x1+x2)/2-120,cy:(y1+y2)/2-90};});
 }
 // Day closed was 8 units low and 4 left.
 expect(Math.abs(offsets.closed.cx)).toBeLessThanOrEqual(1);
 expect(Math.abs(offsets.closed.cy)).toBeLessThanOrEqual(1);
 for(const name of ["cards","progress"])for(const axis of ["cx","cy"] as const)expect(Math.abs(offsets[name][axis]),name+" "+axis).toBeLessThanOrEqual(3);
 for(const [name,offset] of Object.entries(offsets))for(const axis of ["cx","cy"] as const)expect(Math.abs(offset[axis]),name+" "+axis).toBeLessThanOrEqual(5);
});
