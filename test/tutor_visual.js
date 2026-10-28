'use strict';
// TUTOR-01 T2: screenshot acceptance with a synthetic approved plan; never a live account.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const out=path.join(ROOT,'test-output','ui');
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(ROOT,'dist','test.html'),'utf8');
const anchor='/* ===== main.js ===== */';
if(!original.includes(anchor))throw Error('Missing application entry marker');
const planId='00000000-0000-4000-8000-000000000001';
const packetContext={
 planId,planRevision:3,contextId:null,contextRevision:null,
 checkpoint:{id:'compactness-open-cover-proof',title:'Compactness',objective:'Prove a compact subset of a Hausdorff space is closed',status:'in_progress'},
 hintLevel:2,sourceRefs:['topology-notes:section-3.2'],
 lastAttempt:{eventId:'00000000-0000-4000-8000-000000000002',
   text:'I separated an exterior point from a single point of K, but how do I handle all points?'},
 citedExcerpts:[{ref:'topology-notes:section-3.2',text:'Every open cover of a compact set has a finite subcover.'}]
};
const hook='const __tutorMockContext='+JSON.stringify(packetContext)+';\n'+
  'if(typeof StudyPlan !== "undefined") StudyPlan.activeContext=async()=>__tutorMockContext;\n'+
  'else window.StudyPlan={activeContext:async()=>__tutorMockContext};\n'+
  'window.__tutorVisual={open:()=>TutorHandoff.open({planId:__tutorMockContext.planId,checkpointId:__tutorMockContext.checkpoint.id})};\n';
const HTML=original.replace(anchor,hook+anchor);
const errors=[];
const reply={schema:'lemma.tutor_reply.v1',contract_version:1,plan_id:planId,
 checkpoint_id:'compactness-open-cover-proof',expected_plan_revision:3,
 events:[{event_id:'00000000-0000-4000-8000-000000000003',type:'feedback',
    payload:{text:'Separate x from every y in K, then choose a finite subcover.'}}],
 card_proposals:[{proposal_id:'00000000-0000-4000-8000-000000000004',
    type:'basic',title:'Compact in Hausdorff',front:'How to show K is closed?',
    back:'Separate every exterior point from K using finitely many Hausdorff neighbourhoods.',
    tags:['topology'],requires:[],source_refs:['topology-notes:section-3.2']}],
 amendment_proposal:null
};
(async()=>{
 const browser=await chromium.launch();
 try{
  for(const size of ['mobile','desktop'])for(const scheme of ['light','dark']){
   const ctx=await browser.newContext({serviceWorkers:'block',
    viewport:size==='mobile'?{width:390,height:844}:{width:1280,height:800},
    colorScheme:scheme,reducedMotion:'reduce'});
   try{
    await ctx.route('**/*',route=>
      route.request().url().startsWith('https://lemma.test/')?
        route.fulfill({status:200,contentType:'text/html',body:HTML}):route.abort());
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(size+'/'+scheme+': '+e.message));
    await page.goto('https://lemma.test/');
    await page.waitForSelector('#sheets',{state:'attached',timeout:12000});
    // Boot initializes the workspace asynchronously and may replace open sheets.
    // Never open the synthetic tutor handoff until that initialization is done.
    await page.waitForFunction(() => typeof App !== 'undefined' && App.loading === false &&
      !!document.querySelector('.today'), null, {timeout:15000});
    await page.evaluate(()=>window.__tutorVisual.open());
    await page.waitForSelector('.tutor-handoff');
    const helpColor=await page.locator('.tutor-handoff-help').first().evaluate(
      el=>getComputedStyle(el).color);
    assert.ok((scheme==='dark'?/173,\s*181,\s*196/:/74,\s*82,\s*99/).test(helpColor),
      'Handoff help uses theme-adjusted readable secondary ink: '+helpColor);
    await page.locator('.tutor-handoff-reply').fill(JSON.stringify(reply));
    await page.getByRole('button',{name:'Review pasted reply'}).click();
    await page.locator('.tutor-handoff-item').first().waitFor();
    assert.equal(await page.locator('.tutor-handoff-item').count(),2);
    assert.match(await page.locator('.tutor-handoff-status').innerText(),/None recorded/);
    const save=page.getByRole('button',{name:'Save selected study events'});
    assert.equal(await save.isDisabled(),true,'requires deliberate event selection');
    await page.locator('.tutor-handoff-item').first().locator('summary').click();
    await page.getByRole('checkbox',{name:'Select Event 1 · feedback'}).check();
    assert.equal(await save.isEnabled(),true,'explicit selection enables Save');
    // A collapsed <details> hides its checkbox from the accessibility tree.
    // Expand only for inspection; opening a proposal must not select it.
    await page.locator('.tutor-handoff-item').nth(1).locator('summary').click();
    assert.equal(await page.getByRole('checkbox',{name:'Select Card proposal 1'}).isChecked(),false,'card proposal never implicitly selected');
    const width=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.ok(width.doc<=width.viewport+2,'Handoff causes horizontal overflow: '+JSON.stringify(width));
    const boxes=await page.locator('.tutor-handoff > button').evaluateAll(nodes=>
      nodes.map(n=>n.getBoundingClientRect().height));
    assert.ok(boxes.every(h=>h>=44),'Handoff button target smaller than 44px');
    await page.screenshot({path:path.join(out,'tutor-sheet-'+size+'-'+scheme+'.png')});
    await page.close();
   }finally{await ctx.close();}
  }
  assert.deepEqual(errors,[],'no runtime errors during tutor handoff');
  console.log('PASS TUTOR-01 T2 visuals: mobile/desktop light/dark hidden sheet with reply review');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
