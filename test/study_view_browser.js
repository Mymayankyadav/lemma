'use strict';
// Synthetic browser fixture: screenshot hidden StudyView without enabling it for users.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  // UUID generation is secure-context only; about:blank is not a representative
  // GitHub Pages origin. Serve the fixture on HTTPS without external requests.
  await page.route('https://lemma.test/**', route => route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
  }));
  await page.goto('https://lemma.test/');
  await page.addStyleTag({content:fs.readFileSync('src/app.css','utf8')+'\n'+fs.readFileSync('src/styles/study.css','utf8')});
  const mock=`
  function h(tag,attrs,...kids) {
    const node=document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})) {
      if(v==null||v===false)continue;
      if(k==='class')node.className=v;
      else if(k==='text')node.textContent=v;
      else if(k==='html')node.innerHTML=v;
      else if(k.startsWith('on') && typeof v==='function')node.addEventListener(k.slice(2).toLowerCase(),v);
      else node.setAttribute(k,v);
    }
    for(const kid of kids){if(kid)node.append(kid);}
    return node;
  }
  function fill(el,...kids){el.replaceChildren(...kids.filter(Boolean));return el;}
  window.LemmaAccount={user:{id:'00000000-0000-4000-8000-000000000001'}};
  window.App={workspaceRevision:1,workspaceBlocked:false,go(){}};
  window.__writes=[];
  window.StudyPlan={
    async activeContext(){return {
      planId:'00000000-0000-4000-8000-000000000002',planRevision:3,
      checkpoint:{id:'proof-1',title:'Compactness checkpoint',
        objective:'Construct a finite subcover from an arbitrary open cover',
        status:'in_progress'},hintLevel:1,
      lastAttempt:{payload:{text:'Choose an open cover, then reduce to finitely many sets.'}},
      lastFeedback:{text:'Justify why the finite choice covers all points.'},
      lastEvidence:null,nextAction:{text:'Finish the finite-cover argument tomorrow'},
      sourceRefs:['Topology notes, §3.2']
    }},
    async recordEvent(event){window.__writes.push(event);return {eventId:event.eventId}}
  };
  `;
  const view=fs.readFileSync('src/app/view_study.js','utf8');
  await page.addScriptTag({content:mock+'\n'+view+'\nwindow._StudyView=StudyView;'});
  await page.evaluate(()=>document.querySelector('#app').append(
    window._StudyView.render({planId:'00000000-0000-4000-8000-000000000002',checkpointId:'proof-1'})
  ));
  await page.getByRole('heading',{name:'Compactness checkpoint'}).waitFor();
  assert.equal(await page.evaluate(()=>window._StudyView.ready),false);
  assert.equal(await page.evaluate(()=>window.__writes.length),0);
  fs.mkdirSync('test-output/ui',{recursive:true});
  await page.screenshot({path:'test-output/ui/study-p3-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth+1),true,
    'the 390px checkpoint view must not scroll horizontally');
  await page.screenshot({path:'test-output/ui/study-p3-mobile.png',fullPage:true});
  await page.getByRole('textbox',{name:'Your unfinished proof'}).fill('Prove finite subcover for all x');
  await page.getByRole('button',{name:'Save proof attempt'}).click();
  await page.waitForFunction(() => {
    const status=document.querySelector('.study-form .study-write-status');
    return status?.textContent.includes('Saved as append-only') ||
      status?.textContent.includes('Not confirmed');
  });
  const savedStatus=await page.locator('.study-form .study-write-status').first().textContent();
  assert.match(savedStatus,/Saved as append-only study evidence/,
    'the synthetic HTTPS test must produce a verified append-only receipt');
  const events=await page.evaluate(()=>window.__writes);
  assert.equal(events.length,1);
  assert.equal(events[0].type,'attempt');
  assert.equal(events[0].expectedPlanRevision,3);
  console.log('PASS PLAN-01 P3 synthetic Chromium screen: approved checkpoint, mobile/desktop screenshots, explicit-only write, no horizontal overflow');
  await page.close();
 } finally {await browser.close()}
})().catch(err=>{console.error(err.stack);process.exitCode=1});
