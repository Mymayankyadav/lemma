import {test,expect} from "@playwright/test";
import {spawn,type ChildProcess} from "node:child_process";
import {writeFileSync,unlinkSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";

const source=resolve("src/audit-445-preview.tsx");
const html=resolve("audit-445-preview.html");
const port=4175;
let server:ChildProcess|undefined;
const preview="\nimport React,{useState} from \"react\";\nimport {createRoot} from \"react-dom/client\";\nimport {PlanMap,CheckpointDrawer} from \"./features/plan-proposal/Page\";\nimport {makeStressStore} from \"./data/demo/stress\";\nimport type {DemoStore} from \"./data/demo/model\";\nimport type {ReviewNode} from \"./features/plan-proposal/nodes\";\nimport fixture from \"./data/demo/fixture.json?raw\";\nimport \"./styles/app.css\";\nconst stress=makeStressStore(JSON.parse(fixture) as DemoStore,\"stress\");\nconst own=stress.checkpoints.filter(cp=>cp.projectId===stress.projects[0].id)\n  .sort((a,b)=>Number(a.code.slice(2))-Number(b.code.slice(2)));\nconst nodes:ReviewNode[]=own.map(cp=>({\n code:cp.code,title:cp.title,objective:cp.objective,criterion:cp.criterion,\n steps:cp.steps,stage:undefined,prereqs:cp.prereqs,concepts:[],\n}));\nfunction Preview(){\n const [selected,setSelected]=useState(\"\");\n return <main style={{padding:\"12px 14px\",maxWidth:420,margin:\"auto\"}}>\n  <h1 className=\"mb-3 text-title-s text-ink\">Unstaged 36-checkpoint plan</h1>\n  <PlanMap nodes={nodes} selected={selected} onSelect={setSelected}/>\n  {selected&&<CheckpointDrawer nodes={nodes} code={selected} projectSlug=\"real-analysis\"\n    isChange={false} onOpen={setSelected} onClose={()=>setSelected(\"\")}/>}\n </main>;\n}\ncreateRoot(document.getElementById(\"root\")!).render(<Preview/>);\n";
const htmlText="<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><script>document.documentElement.dataset.theme=new URLSearchParams(location.search).get(\"theme\")||\"graph\";document.documentElement.dataset.density=\"compact\";document.documentElement.dataset.effects=\"calm\";</script></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/audit-445-preview.tsx\"></script></body></html>";

test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{
 writeFileSync(source,preview);
 writeFileSync(html,htmlText);
 server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",String(port),"--strictPort"],{stdio:"ignore"});
 let ready=false;
 for(let n=0;n<80;n++){
  if(server.exitCode!==null)break;
  try{
   const res=await fetch("http://127.0.0.1:"+port+"/lemma/audit-445-preview.html");
   if(res.ok){ready=true;break}
  }catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 if(!ready)throw Error("Unstaged PlanMap harness did not start");
});
test.afterAll(()=>{
 server?.kill("SIGTERM");
 for(const file of [source,html])try{unlinkSync(file)}catch{}
});
for(const theme of ["graph","graph-night"] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test("ST-2 audit: 36 unstaged checkpoints "+theme+" "+width+"px",async({page})=>{
  await page.setViewportSize({width,height});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:"+port+"/lemma/audit-445-preview.html?theme="+theme);
  const map=page.getByRole("region",{name:"Checkpoint prerequisites"});
  const graph=map.getByRole("group",{name:"Stage dependency graph"});
  await expect(graph).toBeVisible();
  const stages=graph.locator(':scope > g[role="button"]');
  await expect(stages).toHaveCount(5);
  const names=await stages.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("aria-label")));
  expect(names).toEqual([
   "CP1–CP8, 8 checkpoints. Expand stage",
   "CP9–CP16, 8 checkpoints. Expand stage",
   "CP17–CP24, 8 checkpoints. Expand stage",
   "CP25–CP32, 8 checkpoints. Expand stage",
   "CP33–CP36, 4 checkpoints. Expand stage",
  ]);
  expect(await graph.locator('line[stroke-dasharray="3 4"]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync("test-results/screens/audit-445",{recursive:true});
  const prefix="test-results/screens/audit-445/"+theme+"-"+width;
  await map.screenshot({path:prefix+"-collapsed.png"});
  await stages.first().click();
  await expect(stages.first()).toHaveAttribute("aria-expanded","true");
  await expect(map.locator("foreignObject")).toHaveCount(1);
  await map.screenshot({path:prefix+"-expanded.png"});
  await map.getByRole("button",{name:"Expand all"}).click();
  const expanded=map.getByRole("group",{name:"Map of proposed checkpoints and prerequisites"});
  await expect(expanded.getByRole("button")).toHaveCount(36);
  await expanded.getByRole("button",{name:/Select CP1 /}).click();
  const drawer=page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-checkpoint-drawer="CP1"]')).toBeVisible();
  await page.screenshot({path:prefix+"-drawer.png",fullPage:true});
  expect(errors).toEqual([]);
 });
}
