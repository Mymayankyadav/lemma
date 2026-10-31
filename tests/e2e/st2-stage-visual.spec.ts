import {test,expect} from "@playwright/test";
import {spawn,type ChildProcess} from "node:child_process";
import {writeFileSync,unlinkSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";

// This harness imports the actual React PlanMap and IdeaGraph from Vite source.
// It does not alter the app, its demo fixture, or runtime contracts. The two
// temporary files exist only during this browser test and are always removed.
const source=resolve("src/st2-visual-preview.tsx");
const html=resolve("public/st2-visual-preview.html");
let server:ChildProcess|undefined;
const preview = `
import React,{useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {PlanMap} from "./features/plan-proposal/Page";
import {planIdeasGraph} from "./features/plan-proposal/ideas";
import {buildAtlasTree} from "./features/atlas/tree";
import {IdeaGraph} from "./features/atlas/IdeaGraph";
import {makeStressStore} from "./data/demo/stress";
import type {DemoStore} from "./data/demo/model";
import type {ReviewNode} from "./features/plan-proposal/nodes";
import fixture from "./data/demo/fixture.json?raw";
import "./styles/app.css";

const profile=new URLSearchParams(location.search).get("profile")==="extreme"?"extreme":"stress";
const stress=makeStressStore(JSON.parse(fixture) as DemoStore,profile);
const own=stress.checkpoints.filter(cp=>cp.projectId===stress.projects[3].id)
  .sort((a,b)=>Number(a.code.slice(2))-Number(b.code.slice(2)));
const nodes:ReviewNode[]=own.map((cp,i)=>({
  code:cp.code,title:cp.title,criterion:cp.criterion,steps:cp.steps,
  stage:profile==="stress"?"Stage "+(Math.floor(i/6)+1):cp.stage,
  prereqs:cp.prereqs,concepts:i<40?["Idea "+(2*i+1),"Idea "+(2*i+2)]:[],
}));
const proposed={
  checkpoints:nodes.map(n=>({code:n.code,title:n.title,criterion:n.criterion,
    objective:"",steps:[],prereqs:n.prereqs,stage:n.stage,concepts:n.concepts})),
  concepts:Array.from({length:80},(_,i)=>({
    name:"Idea "+(i+1),prereqs:i?["Idea "+i]:[],
  })),
};
const graph=planIdeasGraph(proposed,null,nodes,"stress-project",{name:"Mathematics",glyph:"∑"});
const tree=graph?buildAtlasTree(graph):null;
function Preview(){
  const [selected,setSelected]=useState("");
  return <main style={{padding:"12px 14px",maxWidth:420,margin:"auto"}}>
    <h1 className="mb-3 text-title-s text-ink">Plan review · ST-2 {profile}</h1>
    <PlanMap nodes={nodes} selected={selected} onSelect={setSelected}/>
    <p data-picked className="my-3 text-label text-ink-2">Selected: {selected||"none"}</p>
    {tree&&<section aria-label="Ideas in this plan">
      <h2 className="mb-2 text-title-s text-ink">Ideas in this plan · 80</h2>
      <IdeaGraph tree={tree} label="Ideas in this plan"/>
    </section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
`;
test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{
  mkdirSync(resolve("public"),{recursive:true});
  writeFileSync(source,preview);
  writeFileSync(html,`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'graph';document.documentElement.dataset.density='compact';document.documentElement.dataset.effects='calm';</script></head><body><div id="root"></div><script type="module" src="/lemma/src/st2-visual-preview.tsx"></script></body></html>`);
  server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","4174","--strictPort"],{stdio:"ignore"});
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){
    if(server.exitCode!==null)break;
    try{const r=await fetch("http://127.0.0.1:4174/lemma/st2-visual-preview.html");
      if(r.ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw Error("ST-2 visual harness did not start");
});
test.afterAll(()=>{
  server?.kill("SIGTERM");
  for(const file of [source,html])try{unlinkSync(file)}catch{}
});
for(const profile of ["stress","extreme"] as const)
for(const theme of ["graph","graph-night"] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
  test("ST-2 "+profile+" "+theme+" "+width+"px stage and idea preview",async({page})=>{
    await page.setViewportSize({width,height});
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:4174/lemma/st2-visual-preview.html?profile="+profile+"&theme="+theme);
    const map=page.getByRole("region",{name:"Checkpoint prerequisites"});
    await expect(map).toBeVisible();
    const svg=map.getByRole("group",{name:"Stage dependency graph"});
    await expect(svg).toBeVisible();
    const count=profile==="stress"?7:15;
    await expect(svg.locator(':scope > g[role="button"]')).toHaveCount(count);
    const size=await map.boundingBox();
    expect(size).not.toBeNull();
    expect(size!.width).toBeLessThanOrEqual(width);
    // The 40 checkpoint, seven-stage overview must fit in 1.5 phone heights.
    if(profile==="stress")expect(size!.height).toBeLessThan(height*1.5);
    const ideas=page.getByRole("region",{name:"Ideas in this plan"});
    await expect(ideas.getByRole("tree",{name:"Ideas in this plan"})).toBeVisible();
    const rows=await ideas.getByRole("treeitem").count();
    expect(rows).toBeLessThanOrEqual(41);
    expect(rows).toBeGreaterThan(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    mkdirSync("test-results/screens/st2",{recursive:true});
    const name=profile+"-"+theme+"-"+width;
    await map.screenshot({path:"test-results/screens/st2/"+name+"-collapsed.png"});
    await svg.locator(':scope > g[role="button"]').first().click();
    await expect(map.locator("foreignObject")).toHaveCount(1);
    await expect(svg.locator(':scope > g[role="button"]')).toHaveCount(count);
    await map.screenshot({path:"test-results/screens/st2/"+name+"-expanded.png"});
    await map.getByRole("button",{name:"Expand all"}).click();
    await expect(map.getByRole("group",{name:"Map of proposed checkpoints and prerequisites"})).toBeVisible();
    await map.getByRole("button",{name:"Show stages"}).click();
    await expect(svg).toBeVisible();
    await ideas.scrollIntoViewIfNeeded();
    await page.screenshot({path:"test-results/screens/st2/"+name+"-ideas.png"});
    expect(errors).toEqual([]);
  });
}
