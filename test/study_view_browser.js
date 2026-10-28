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
  window.__amendmentActions=[];
  window.__draftStatus='draft';
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
    async recordEvent(event){window.__writes.push(event);return {eventId:event.eventId}},
    async readPlanDraft(){return {status:window.__draftStatus}},
    async reviewPendingAmendment(){
      return {status:'review',expectedRevision:3,expectedLocalRevision:1,
        draftId:'00000000-0000-4000-8000-000000000010',
        changeSummary:'Insert prerequisite before proof checkpoint',
        diff:{added:['proof-extra'],removed:[],unchanged:['proof-1'],
          planFieldsChanged:[],reordered:false,requiresReassessment:[],
          modified:[{checkpointId:'proof-1',fields:['objective'],
            addedPrerequisites:['proof-extra'],removedPrerequisites:[]}]}}
    },
    async reviewConflictedAmendment(){
      return {status:'review_conflict',
        originalRequestId:'00000000-0000-4000-8000-000000000015',
        originalRevision:2,currentRevision:3,
        changeSummary:'Repair a missing compactness prerequisite',
        proposedChanges:{added:['proof-extra'],removed:[],
          modified:[{checkpointId:'proof-1'}]},
        serverChanges:{added:[],removed:[],
          modified:[{checkpointId:'proof-1'}]},
        latestComparison:{added:['proof-extra'],removed:[],
          modified:[{checkpointId:'proof-1'}],
          requiresReassessment:['proof-1']},
        overlapIds:['proof-1']}
    },
    async restartConflictedAmendment(id,review,confirmed){
      window.__amendmentActions.push({type:'restart',id,confirmed});
      window.__draftStatus='draft';return {status:'draft'}
    },
    async approvePlanDraft(id,revision,consent){
      window.__amendmentActions.push({type:'approve',id,revision,consent});
      return {status:'approved_pending'}
    },
    async submitApprovedPlanDraft(id){
      window.__amendmentActions.push({type:'submit',id});
      return {status:'confirmed',revision:4}
    }
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
  await page.getByRole('button',{name:'Review pending amendment'}).click();
  await page.getByRole('button',{name:'Approve these displayed changes'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__amendmentActions.length),0,
    'reviewing a diff cannot approve or publish');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'test-output/ui/study-p4b2-amendment-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),true,
    'the amendment review must fit a narrow phone');
  await page.screenshot({path:'test-output/ui/study-p4b2-amendment-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Approve these displayed changes'}).click();
  await page.getByRole('button',{name:'Submit previously approved amendment'}).waitFor();
  assert.deepEqual((await page.evaluate(()=>window.__amendmentActions)).map(x=>x.type),['approve'],
    'student approval must not automatically submit');
  await page.getByRole('button',{name:'Submit previously approved amendment'}).click();
  assert.deepEqual((await page.evaluate(()=>window.__amendmentActions)).map(x=>x.type),['approve','submit']);
  // A new render with a stale approved intent only shows inspection.
  await page.evaluate(() => {
    window.__draftStatus='needs_review';
    document.querySelector('#app').replaceChildren(
      window._StudyView.render({
        planId:'00000000-0000-4000-8000-000000000002',checkpointId:'proof-1'
      })
    );
  });
  await page.getByRole('button',{name:'Inspect rejected amendment'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Restart as unapproved draft'}).count(),0);
  const priorActions=await page.evaluate(()=>window.__amendmentActions.length);
  await page.getByRole('button',{name:'Inspect rejected amendment'}).click();
  await page.getByRole('button',{name:'Restart as unapproved draft'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__amendmentActions.length),priorActions,
    'merely reading a rejected amendment never restarts or publishes');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'test-output/ui/study-p4c2-conflict-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),true);
  await page.screenshot({path:'test-output/ui/study-p4c2-conflict-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Restart as unapproved draft'}).click();
  await page.getByRole('button',{name:'Review pending amendment'}).waitFor();
  const actions=await page.evaluate(()=>window.__amendmentActions);
  assert.equal(actions.length,priorActions+1);
  assert.equal(actions[actions.length-1].type,'restart');
  assert.equal(actions[actions.length-1].confirmed,true);
  assert.equal(await page.getByRole('button',{name:'Submit previously approved amendment'}).count(),0,
    'restarted draft is not an approved publication intent');
  console.log('PASS PLAN-01 P3/P4b2 synthetic Chromium: approved checkpoint, student-reviewed diff, separate consent/submit, mobile/desktop screenshots');
  await page.close();
 } finally {await browser.close()}
})().catch(err=>{console.error(err.stack);process.exitCode=1});
