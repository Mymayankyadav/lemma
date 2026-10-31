import {test,expect} from "@playwright/test";
import {spawn,type ChildProcess} from "node:child_process";
import {writeFileSync,unlinkSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";

const source=resolve("src/st1-stage-math-preview.tsx");
const html=resolve("st1-stage-math-preview.html");
const preview="import React from \"react\";\nimport {createRoot} from \"react-dom/client\";\nimport {MemoryRouter} from \"react-router\";\nimport {ProjectTimeline} from \"./ui/timeline/ProjectTimeline\";\nimport \"./styles/app.css\";\nconst slash=String.fromCharCode(92);\nconst stages=[\"$L^p$\",\"$\"+slash+\"mathbb{R}^n$\",\"$\"+slash+\"sum_{k=1}^{20} x_k$\"];\nconst checkpoints=Array.from({length:45},(_,i)=>({\n id:\"cp-\"+(i+1),code:\"CP\"+(i+1),title:\"Checkpoint \"+(i+1),\n position:i,ui:i===4?\"now\":i<4?\"done\":\"next\",currentStep:0,stepsTotal:1,\n recheckDue:null,dueCards:0,dueOn:null,demonstratedAt:null,\n stage:stages[Math.floor(i/15)],\n}));\ncreateRoot(document.getElementById(\"root\")!).render(\n <MemoryRouter><main style={{padding:\"12px 14px\",maxWidth:420,margin:\"auto\"}}>\n  <h1>Stage maths preview</h1>\n  <ProjectTimeline project={{title:\"Math\",slug:\"math\",done:4,total:45}} checkpoints={checkpoints}/>\n </main></MemoryRouter>\n);";
let server:ChildProcess|undefined;
test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{
 writeFileSync(source,preview);
 writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>document.documentElement.dataset.theme=new URLSearchParams(location.search).get("theme")||"graph";</script></head><body><div id="root"></div><script type="module" src="/src/st1-stage-math-preview.tsx"></script></body></html>');
 server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","4175","--strictPort"],{stdio:"ignore"});
 let ready=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)break;
  try{const r=await fetch("http://127.0.0.1:4175/lemma/st1-stage-math-preview.html");if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!ready)throw Error("ST-1 maths preview did not start");
});
test.afterAll(()=>{
 server?.kill("SIGTERM");
 for(const file of [source,html])try{unlinkSync(file)}catch{}
});
for(const theme of ["graph","graph-night"] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test("ST-1 stage maths "+theme+" "+width+"px",async({page})=>{
  await page.setViewportSize({width,height});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:4175/lemma/st1-stage-math-preview.html?theme="+theme);
  const rail=page.locator("[data-stage-rail]");
  await expect(rail).toBeVisible();
  const labels=rail.locator("[data-stage-name]");
  await expect(labels).toHaveCount(3);
  for(let i=0;i<3;i++)await expect(labels.nth(i).locator(".katex")).toBeVisible();
  expect(await labels.evaluateAll(nodes=>nodes.every(node=>{
   const math=node.querySelector(".katex");
   return !!math&&parseFloat(getComputedStyle(math).fontSize)>=16;
  }))).toBe(true);
  await expect(labels.first()).not.toContainText("$");
  const buttons=rail.locator("[data-stage-button]");
  expect(await buttons.evaluateAll(nodes=>nodes.every(node=>{
   const r=node.getBoundingClientRect();return r.width>=44&&r.height>=44;
  }))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync("test-results/screens/st-1",{recursive:true});
  await page.screenshot({path:"test-results/screens/st-1/math-"+theme+"-"+width+".png",fullPage:false});
  expect(errors).toEqual([]);
 });
}
