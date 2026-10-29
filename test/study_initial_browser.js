'use strict';
// Actual D modules + browser IndexedDB. Synthetic transport, never production.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const C='00000000-0000-4000-8000-000000000004';
const css=fs.readFileSync('src/app.css','utf8')+'\n'+fs.readFileSync('src/styles/study.css','utf8');
const source=['util','study_plan','view_study'].map(name=>fs.readFileSync('src/app/'+name+'.js','utf8')).join('\n');
const fixture=`
window.__owner='${A}';window.__revision=2;window.__writes=[];window.__lost=false;
const App={workspaceRevision:1,workspaceBlocked:false,go(route){window.__route=route}};
const client={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},setHeader(){
 const plan=JSON.parse(localStorage.getItem('published-'+window.__owner)||'null');
 const rows=!plan?[]:table==='study_plans'?[{id:plan.p_plan_id,revision:1}]:
  table==='study_plan_versions'?[{context_id:plan.p_context_id,context_revision:2,snapshot:plan.p_snapshot}]:[];
 return Promise.resolve({data:rows})}};return q},
 rpc(name,args){window.__writes.push({name,args});return {setHeader(){
  localStorage.setItem('published-'+window.__owner,JSON.stringify(args));
  const log=JSON.parse(localStorage.getItem('requests')||'[]');log.push(args);localStorage.setItem('requests',JSON.stringify(log));
  return window.__lost?Promise.reject(Error('response lost')):Promise.resolve({data:1})}}}};
const LemmaAccount={client,get user(){return window.__owner?{id:window.__owner}:null},onIdentityChange(){}};
const LemmaCloud={async accountToken(){return 'synthetic-local-token'}};
const LemmaCloudBridge={async readAcceptedContext(id){return {context_id:id,revision:window.__revision}}};
`;
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><main id="app"></main><script>'+fixture+source+
 '\nwindow.__study=StudyPlan;window.__mount=()=>document.querySelector("#app").replaceChildren(StudyView.render());window.__mount();</script></body></html>';
const snapshot={checkpoints:Array.from({length:12},(_,i)=>({checkpoint_id:'proof-'+(i+1),
 title:'Proof checkpoint '+(i+1),objective:'Prove lemma '+(i+1),
 prerequisite_checkpoint_ids:i?['proof-'+i]:[],source_refs:['notes:3.2'],
 learning_tasks:['Reconstruct the proof'],mastery_criterion:'Justify each implication',
 assessment_prompt:'Give a proof without notes',status:'not_started'}))};
const pending=page=>page.getByRole('button',{name:'Submit approved plan',exact:true});
async function fillPlan(page){
 await page.getByRole('textbox',{name:'Plan title',exact:true}).fill('Topology <script> is plain text');
 await page.getByRole('textbox',{name:'Plan objective',exact:true}).fill('Construct complete proofs');
 await page.getByRole('textbox',{name:'Accepted context ID',exact:true}).fill(C);
 await page.getByRole('textbox',{name:'Accepted context revision',exact:true}).fill('2');
 await page.getByRole('textbox',{name:'Plan snapshot JSON',exact:true}).fill(JSON.stringify(snapshot));
}
(async()=>{
 const browser=await chromium.launch(),errors=[];
 fs.mkdirSync('test-output/ui',{recursive:true});
 try {
  for(const scheme of ['light','dark']) {
   const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:scheme,serviceWorkers:'block'});
   await context.route('https://lemma.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.goto('https://lemma.test/');
   await page.getByRole('heading',{name:'Create your first study plan'}).waitFor();
   assert.equal((await page.evaluate(()=>window.__writes)).length,0);
   await fillPlan(page);
   await page.getByRole('button',{name:'Save unapproved plan draft'}).click();
   await page.getByRole('button',{name:'Review saved plan',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Approve this reviewed plan'}).count(),0);
   await page.reload();
   await page.getByRole('button',{name:/^Resume draft:/}).click();
   assert.equal(await page.getByRole('textbox',{name:'Plan title',exact:true}).inputValue(),'Topology <script> is plain text');
   await page.getByRole('button',{name:'Review saved plan',exact:true}).click();
   const approve=page.getByRole('button',{name:'Approve this reviewed plan',exact:true});
   await approve.waitFor();
   assert.match(await page.locator('.study-initial-preview').textContent(),/12 checkpoints/);
   assert.match(await page.locator('.study-initial-preview .study-plan-json').textContent(),/assessment_prompt/);
   await page.screenshot({path:'test-output/ui/study-initial-review-mobile-'+scheme+'.png',fullPage:true});
   // Editing the form invalidates a preview; the old approval action disappears.
   await page.getByRole('textbox',{name:'Plan title',exact:true}).fill('Changed after review');
   assert.equal(await approve.count(),0);
   await page.getByRole('button',{name:/^Resume draft:/}).click();
   await page.getByRole('button',{name:'Review saved plan',exact:true}).click();await approve.waitFor();
   // A newly accepted context revision cannot reuse the displayed approval.
   await page.evaluate(()=>window.__revision=3);await approve.click();
   await page.waitForFunction(()=>document.querySelector('.study-initial-status').textContent.includes('Accepted context changed'));
   assert.equal((await page.evaluate(()=>window.__writes)).length,0);
   await page.evaluate(()=>window.__revision=2);
   await page.getByRole('button',{name:/^Resume draft:/}).click();
   await page.getByRole('button',{name:'Review saved plan',exact:true}).click();await approve.click();
   await pending(page).waitFor();assert.equal((await page.evaluate(()=>window.__writes)).length,0);
   const approved=await page.evaluate(async()=>{const list=await window.__study.listInitialPlanDrafts();return window.__study.readPlanDraft(list[0].planId)});
   // Offline Submit/reload retains the exact already-approved request key.
   await context.setOffline(true);await pending(page).click();
   await page.waitForFunction(()=>document.querySelector('.study-initial-status').textContent.includes('Offline:'));
   await context.setOffline(false);await page.reload();
   await page.getByRole('button',{name:/^Resume draft:/}).click();await pending(page).waitFor();
   const key=await page.evaluate(async()=>{const [draft]=await window.__study.listInitialPlanDrafts();return (await window.__study.readPlanDraft(draft.planId)).requestId});
   assert.equal(key,approved.requestId);
   await page.evaluate(()=>window.__lost=true);await pending(page).click();
   await page.waitForFunction(()=>document.querySelector('.study-initial-status').textContent.includes('Not confirmed:'));
   // The server committed despite losing its response. On reload the actual
   // approved checkpoint is visible; its pending local receipt stays reachable.
   await page.reload();
   await page.getByRole('heading',{name:'Proof checkpoint 1',exact:true}).waitFor();
   await page.getByText('Resume local plan drafts or unconfirmed submissions',{exact:true}).click();
   await page.getByRole('button',{name:/^Resume draft:/}).click();await pending(page).click();
   await page.getByRole('button',{name:'Open published checkpoint'}).waitFor();
   const writes=await page.evaluate(()=>JSON.parse(localStorage.getItem('requests')));
   assert.equal(writes.length,2);assert.equal(writes[0].p_request_id,writes[1].p_request_id);
   assert.equal(writes[0].p_context_id,C);assert.equal(writes[0].p_expected_revision,0);
   await page.getByRole('button',{name:'Open published checkpoint'}).click();
   assert.equal(await page.evaluate(()=>window.__route),'study');
   // Same browser storage cannot reveal another owner's local drafts.
   await page.evaluate(owner=>{window.__owner=owner;window.__mount()},B);
   await page.getByRole('heading',{name:'Create your first study plan'}).waitFor();
   assert.equal(await page.getByRole('button',{name:/^Resume draft:/}).count(),0);
   await page.setViewportSize({width:1280,height:800});
   await page.screenshot({path:'test-output/ui/study-initial-empty-desktop-'+scheme+'.png',fullPage:true});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.evaluate(()=>{window.__owner=null;window.__mount()});
   assert.equal(await page.locator('.study-initial').count(),0);
   assert.match(await page.locator('.study-message').textContent(),/Sign in/);
   await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS first-plan browser: saved/reloaded review, explicit approval/submit, context/edit invalidation, offline/retry, owner isolation and screenshots');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
