'use strict';
// Synthetic browser fixture: screenshot hidden StudyView without enabling it for users.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');

async function nativeStudyZoom(mock,view) {
  // Real Chromium tab zoom; keep the test extension in a temporary directory.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lemma-study-zoom-'));
  const ext=path.join(dir,'extension');
  fs.mkdirSync(ext);
  fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({
    manifest_version:3,name:'Lemma Study native zoom CI',version:'1.0',
    permissions:['tabs'],host_permissions:['https://lemma.test/*'],
    background:{service_worker:'background.js'}
  }));
  fs.writeFileSync(path.join(ext,'background.js'),
    'chrome.runtime.onInstalled.addListener(() => {});\n');
  let context;
  try {
    context=await chromium.launchPersistentContext(path.join(dir,'profile'),{
      channel:'chromium',headless:true,
      args:['--disable-extensions-except='+ext,'--load-extension='+ext],
      viewport:{width:1280,height:900},colorScheme:'light',serviceWorkers:'allow',
      reducedMotion:'reduce'
    });
    await context.route('https://lemma.test/**',route=>route.fulfill({
      status:200,contentType:'text/html',
      body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
    }));
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://lemma.test/');
    await page.addStyleTag({content:fs.readFileSync('src/app.css','utf8')+'\n'+
      fs.readFileSync('src/styles/study.css','utf8')});
    await page.addScriptTag({content:mock+'\n'+view+'\nwindow._StudyView=StudyView;'});
    await page.evaluate(()=>document.querySelector('#app').append(window._StudyView.render({
      planId:'00000000-0000-4000-8000-000000000002',checkpointId:'proof-1'
    })));
    await page.getByRole('heading',{name:'Compactness checkpoint'}).waitFor();
    const baseline=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
    const worker=context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker',{timeout:15000});
    const zoom=await worker.evaluate(async()=>{
      const tabs=await chrome.tabs.query({});
      const tab=tabs.find(t=>t.url?.startsWith('https://lemma.test/'));
      if(!tab)throw new Error('Study test tab missing from extension');
      const before=await chrome.tabs.getZoom(tab.id);
      await chrome.tabs.setZoom(tab.id,2.0);
      const after=await chrome.tabs.getZoom(tab.id);
      return {before,after};
    });
    assert.ok(Math.abs(zoom.before-1)<0.01 && Math.abs(zoom.after-2)<0.01,
      'actual Chromium tab zoom must transition from 100% to 200%');
    const enlarged=await page.evaluate(()=>({
      width:innerWidth,dpr:devicePixelRatio,cssZoom:document.body.style.zoom,
      visualWidth:visualViewport?.width,clientWidth:document.documentElement.clientWidth
    }));
    assert.equal(enlarged.cssZoom,'','do not substitute CSS zoom');
    assert.ok(enlarged.width<baseline.width*0.75 ||
      enlarged.dpr>baseline.dpr*1.6,'native zoom must change browser scale');
    async function screen(label) {
      const bounds=await page.evaluate(()=>({
        viewport:innerWidth,doc:document.documentElement.scrollWidth,
        ready:window._StudyView.ready,visible:!!document.querySelector('.study-page')
      }));
      assert.equal(bounds.ready,false,'native zoom cannot enable the Study tab');
      assert.ok(bounds.visible && bounds.doc<=bounds.viewport+1,
        label+' overflows at genuine 200% tab zoom: '+JSON.stringify(bounds));
      // Playwright full-page captures crop under native zoom; deep-scroll
      // screenshots in headless Chromium can be blank even when DOM assertions
      // pass. For visual evidence, temporarily place the existing review panel
      // first in the synthetic fixture (no DOM clone or app code mutation),
      // then photograph the actual viewport. Normal-layout overflow is checked
      // above before this test-only presentation step.
      if(label!=='checkpoint')await page.locator('.study-amendment').evaluate(panel=>{
        panel.parentElement.prepend(panel);
        window.scrollTo(0,0);
      });
      const file='test-output/ui/study-p5c-native-zoom200-'+label+'.png';
      const screenshot=await page.screenshot({path:file});
      assert.ok(screenshot.length>20000,label+' screenshot was blank or incomplete');
    }
    console.log('PLAN-01 P5c zoom geometry '+JSON.stringify({baseline,enlarged,zoom}));
    await screen('checkpoint');
    await page.getByRole('button',{name:'Continue saved proof'}).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('textbox',{name:'Your unfinished proof'})
      .evaluate(node=>document.activeElement===node),true,
      'keyboard-only native zoom must restore and focus the unfinished proof');
    assert.equal(await page.evaluate(()=>window.__writes.length),0);
    await page.getByRole('button',{name:'Review pending amendment'}).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Approve these displayed changes'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__amendmentActions.length),0);
    await screen('amendment');
    await page.evaluate(()=>{
      window.__draftStatus='needs_review';
      document.querySelector('#app').replaceChildren(window._StudyView.render({
        planId:'00000000-0000-4000-8000-000000000002',checkpointId:'proof-1'
      }));
    });
    await page.getByRole('button',{name:'Inspect rejected amendment'}).click();
    await page.getByRole('button',{name:'Restart as unapproved draft'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__amendmentActions.length),0,
      'conflict inspection at native zoom cannot restart a draft');
    await screen('conflict');
    assert.deepEqual(errors,[],'Study native zoom has no browser exceptions');
    await page.close();
    console.log('PASS PLAN-01 P5c genuine Chromium 200% native zoom: checkpoint, amendment, conflict, keyboard, no writes');
  } finally {
    if(context)await context.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

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
  // Genuine computed-style contrast, not screenshot/color-name assumptions.
  // A D-owned readiness gate: both themes must keep deliberate proof and
  // amendment actions legible (disabled controls are tested separately).
  async function assertPrimaryContrast(label) {
    const result=await page.getByRole('button',{name:'Save proof attempt'}).evaluate(node=>{
      const style=getComputedStyle(node);
      const parse=value=>{
        const parts=value.match(/[\\d.]+/g)?.slice(0,3).map(Number);
        if(!parts||parts.length!==3)throw Error('Unparseable color: '+value);
        return parts.map(channel=>{
          const normalized=channel/255;
          return normalized<=0.04045?normalized/12.92:((normalized+0.055)/1.055)**2.4;
        });
      };
      const luma=value=>{
        const [r,g,b]=parse(value);return r*0.2126+g*0.7152+b*0.0722;
      };
      const [a,b]=[luma(style.color),luma(style.backgroundColor)].sort((x,y)=>y-x);
      return {ratio:(a+0.05)/(b+0.05),weight:Number(style.fontWeight),
        ink:style.color,background:style.backgroundColor};
    });
    assert.ok(result.ratio>=4.5,
      label+' Study primary action fails normal-text contrast: '+JSON.stringify(result));
    assert.ok(result.weight>=600,
      label+' deliberate proof action must be visually emphasized');
  }
  await assertPrimaryContrast('light');
  await page.getByRole('button',{name:'Continue saved proof'}).click();
  const resumedText=await page.getByRole('textbox',{name:'Your unfinished proof'}).inputValue();
  assert.equal(resumedText,'Choose an open cover, then reduce to finitely many sets.');
  assert.equal(await page.getByRole('textbox',{name:'Your unfinished proof'})
    .evaluate(node=>document.activeElement===node),true,
    'explicit proof continuation should focus the restored editor');
  assert.equal(await page.evaluate(()=>window.__writes.length),0,
    'resuming an unfinished proof cannot append evidence');
  await page.getByRole('textbox',{name:'Your unfinished proof'}).fill('');
  assert.equal(await page.evaluate(()=>window._StudyView.ready),false);
  assert.equal(await page.evaluate(()=>window.__writes.length),0);
  fs.mkdirSync('test-output/ui',{recursive:true});
  await page.screenshot({path:'test-output/ui/study-p3-desktop.png',fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});
  await assertPrimaryContrast('dark');
  await page.screenshot({path:'test-output/ui/study-p5b-desktop-dark.png',fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
  // This is CSS zoom stress only, not proof of real browser 200% zoom.
  await page.evaluate(()=>{document.body.style.zoom='1.5';});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth+1),true,'CSS zoom must not overflow desktop');
  await page.screenshot({path:'test-output/ui/study-p5b-css-zoom150.png',fullPage:true});
  await page.evaluate(()=>{document.body.style.zoom='';});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth+1),true,
    'the 390px checkpoint view must not scroll horizontally');
  await page.screenshot({path:'test-output/ui/study-p3-mobile.png',fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:'test-output/ui/study-p5b-mobile-dark.png',fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
  // Long unbroken mathematical symbols and source IDs must wrap in narrow view.
  const oldSource=await page.locator('.study-sources').textContent();
  await page.locator('.study-sources').evaluate(node=>{
    node.textContent='Source: '+('\\\\alpha_{1234567890}'.repeat(40));
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth+1),true,'long mathematical source text overflows mobile');
  await page.screenshot({path:'test-output/ui/study-p5b-long-math-mobile.png',fullPage:true});
  await page.locator('.study-sources').evaluate((node,text)=>{node.textContent=text;},oldSource);
  await page.getByRole('textbox',{name:'Your unfinished proof'}).fill('Prove finite subcover for all x');
  const saveProof=page.getByRole('button',{name:'Save proof attempt'});
  await saveProof.focus();
  assert.equal(await saveProof.evaluate(node=>document.activeElement===node),true,
    'save action must be keyboard-focusable');
  await saveProof.press('Enter');
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
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:'test-output/ui/study-p5b-amendment-mobile-dark.png',fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
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
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:'test-output/ui/study-p5b-conflict-mobile-dark.png',fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
  await page.getByRole('button',{name:'Restart as unapproved draft'}).click();
  await page.getByRole('button',{name:'Review pending amendment'}).waitFor();
  const actions=await page.evaluate(()=>window.__amendmentActions);
  assert.equal(actions.length,priorActions+1);
  assert.equal(actions[actions.length-1].type,'restart');
  assert.equal(actions[actions.length-1].confirmed,true);
  assert.equal(await page.getByRole('button',{name:'Submit previously approved amendment'}).count(),0,
    'restarted draft is not an approved publication intent');
  await nativeStudyZoom(mock,view);
  console.log('PASS PLAN-01 P5b synthetic Chromium: proof-resume focus, keyboard save, responsive long math, CSS zoom stress, dark/light checkpoint/amendment/conflict screenshots (not human visual acceptance or production)');
  await page.close();
 } finally {await browser.close()}
})().catch(err=>{console.error(err.stack);process.exitCode=1});
