'use strict';
// KNOWLEDGE-01 K3c: synthetic owner-scoped accepted revision and pinned excerpt UI.
// No live Supabase, student approval or physical Android work is claimed.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const seed = require('./seed.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-output', 'ui');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(ROOT, 'dist', 'test.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_claude.js'), 'utf8');
const MARKER = '/* ===== main.js ===== */';
assert(HTML.includes(MARKER), 'test app inline marker');
const FIXTURE = HTML.replace(MARKER,
  'window.__readerBridge = { get App(){return App}, get Store(){return Store}, get Account(){return LemmaAccount}, get Sync(){return LemmaSync}, get Cloud(){return LemmaCloudBridge} };\n' + MARKER);
const LIBS = {
  'katex.min.js':'katex/dist/katex.min.js',
  'marked.umd.js':'marked/lib/marked.umd.js',
  'purify.min.js':'dompurify/dist/purify.min.js',
};
const docs = Object.fromEntries(seed.map(n => ['data/users/u_test/profile/notes/' + n.id, n]));
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const C='11111111-2222-4333-8444-555555555555';
const SRC='22222222-3333-4444-8555-666666666666';
const problems=[];
async function open(browser, size, scheme) {
  const ctx = await browser.newContext({serviceWorkers:'block',colorScheme:scheme,
    viewport:size==='mobile'?{width:390,height:844}:{width:1280,height:800},
    reducedMotion:'reduce'});
  await ctx.route('**/*', async route=>{
    const url=route.request().url();
    if(url.startsWith('https://lemma.test/'))
      return route.fulfill({status:200,contentType:'text/html',body:FIXTURE});
    for(const [name,pkg] of Object.entries(LIBS))
      if(url.endsWith(name)) return route.fulfill({status:200,contentType:'application/javascript',
        body:fs.readFileSync(path.join(ROOT,'node_modules',pkg),'utf8')});
    if(url.includes('fonts.googleapis.com'))
      return route.fulfill({status:200,contentType:'text/css',body:''});
    if(url.startsWith('data:')||url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page=await ctx.newPage();
  page.on('pageerror', e=>problems.push(e.message));
  page.on('console', m=>{if(m.type()==='error') problems.push(m.text())});
  await page.addInitScript(({d,mock})=>{window.__SEED__=d;(0,eval)(mock)}, {d:docs,mock:MOCK});
  await page.goto('https://lemma.test/');
  await page.waitForSelector('.today');
  await page.locator('[data-go="settings"]:visible').first().click();
  await page.evaluate(({A,B,C,SRC})=>{
    const {App,Store,Account,Sync,Cloud}=window.__readerBridge;
    const handle={userId:A},client={};
    const context={context_id:C,revision:4,format:'structured_v1',
      title:'Topology accepted notes',
      context_markdown:'Compactness proof: a closed subspace of a compact space is compact.',
      accepted_json:{schema_version:1,source_refs:[{source_id:SRC,revision:2,title:'Stein reference notes'}]}};
    const state={A,B,C,SRC,userId:A,contextCalls:[],sourceCalls:[],draftCalls:[],writes:0,
      mode:'success',pending:[],sourceMode:'valid'};
    Object.defineProperty(Store,'mode',{configurable:true,get:()=> 'account'});
    Object.defineProperty(Account,'user',{configurable:true,get:()=>({id:state.userId})});
    Object.defineProperty(Account,'client',{configurable:true,get:()=>client});
    Sync.accountHandle=()=>handle;
    Cloud.readKnowledgeDraft=async id=>{
      state.draftCalls.push(id);
      if(id!==C) return null;
      return {contextId:C,status:'draft',localRevision:2,expectedRevision:4,
        title:'Topology unapproved notes',markdown:'My unsent proof',
        authorKind:'student',payload:{schema_version:1,summary:'Draft only',goals:[]}};
    };
    Cloud.readAcceptedContext=async (id,revision)=>{
      state.contextCalls.push([id,revision]);
      if(state.mode==='hold') return new Promise(resolve=>state.pending.push(resolve));
      if(state.mode==='missing') throw new Error('knowledge_context_not_found');
      if(state.mode==='offline') throw new Error('Knowledge is offline');
      if(state.mode==='not-deployed') throw new Error('Knowledge request failed; retry when connected');
      return structuredClone(context);
    };
    Cloud.readPinnedAcceptedCitation=async (contextId,sourceId,revision,cursor,limit)=>{
      state.sourceCalls.push([contextId,sourceId,revision,cursor,limit]);
      const start=cursor===null?1:7;
      const count=cursor===null?6:2;
      const excerpts=Array.from({length:count},(_,k)=>{
        const n=start+k;
        return {section_id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),
          locator:'§ '+n,title:'Proof step '+n,text:'Verification of compactness property '+n,
          sha256:'a'.repeat(64)};
      });
      return {context:structuredClone(context),source:{
        context_id:contextId,context_revision:4,source_id:sourceId,
        source_revision:state.sourceMode==='wrong-revision'?3:2,
        excerpts,has_more:cursor===null}};
    };
    for(const name of ['commitAcceptedContext','approveKnowledgeDraft','submitApprovedKnowledgeDraft']){
      Cloud[name]=()=>{state.writes++;throw Error('No write allowed in citation test');};
    }
    window.__readerTest=state;
    App.render();
  }, {A,B,C,SRC});
  await page.waitForSelector('#set-accepted-reader');
  return {page,ctx};
}
async function readAccepted(page) {
  await page.locator('#s-accepted-id').fill(C);
  await page.locator('#s-accepted-revision').fill('4');
  await page.locator('#s-accepted-read').click();
  await page.waitForFunction(()=>
    document.querySelector('#s-accepted-status')?.textContent.includes('loaded read-only'));
}
(async()=>{
  const browser=await chromium.launch();
  try {
    for(const size of ['mobile','desktop']) for(const scheme of ['light','dark']){
      const {page,ctx}=await open(browser,size,scheme);
      try {
        assert.equal(await page.locator('#s-accepted-result').isVisible(),false,
          'no automatic accepted content projection');
        assert.deepEqual(await page.evaluate(()=>window.__readerTest.contextCalls),[],
          'mount must not fetch accepted context');
        await page.getByRole('button',{name:'New draft'}).click();
        assert.equal(await page.locator('#s-knowledge-inspect').isVisible(),false,
          'unsaved drafts cannot lead to a presumed accepted revision');
        await page.locator('#s-knowledge-id').fill(C);
        await page.getByRole('button',{name:'Open saved draft'}).click();
        await page.locator('#s-knowledge-inspect').waitFor({state:'visible'});
        assert.equal(await page.locator('#s-knowledge-review-draft').isVisible(),true);
        assert.equal(await page.locator('#s-knowledge-submit').isVisible(),false,
          'an unapproved saved draft must not expose publication');
        await page.getByRole('button',{name:'Review saved draft'}).click();
        await page.locator('#s-knowledge-approval').waitFor({state:'visible'});
        assert.match(await page.locator('#s-knowledge-approval').textContent(),
          /Topology unapproved notes/,'review must show the persisted title');
        assert.equal(await page.locator('#s-knowledge-approve').isVisible(),true);
        assert.equal(await page.evaluate(()=>window.__readerTest.writes),0,
          'review must never approve or publish by itself');
        await page.locator('#set-knowledge-drafts').screenshot({
          path:path.join(OUT,'knowledge-context-review-'+size+'-'+scheme+'.png'),
          animations:'disabled',
          style:'.topbar,.tabbar { visibility:hidden !important; }'});
        await page.locator('#set-knowledge-drafts').screenshot({
          path:path.join(OUT,'knowledge-reader-link-'+size+'-'+scheme+'.png'),
          animations:'disabled',
          style:'.topbar,.tabbar { visibility:hidden !important; }'});
        await page.getByRole('button',{name:'Open accepted revision reader'}).click();
        assert.equal(await page.locator('#s-accepted-id').inputValue(),C,
          'link must prefill exact saved draft UUID');
        assert.equal(await page.locator('#s-accepted-revision').inputValue(),'',
          'navigate to latest accepted, never assume draft expected revision');
        assert.equal(await page.locator('#s-accepted-result').isVisible(),false);
        assert.deepEqual(await page.evaluate(()=>window.__readerTest.contextCalls),[],
          'navigation alone must never fetch accepted knowledge');
        assert.equal(await page.locator('#s-accepted-id').evaluate(el=>document.activeElement===el),
          true,'reader field is keyboard focused');
        await readAccepted(page);
        assert.equal(await page.locator('#s-accepted-result').isVisible(),true);
        assert.match(await page.locator('#set-accepted-reader').textContent(),/Topology accepted notes/);
        assert.equal(await page.locator('.accepted-reader-excerpt').count(),0,
          'source never auto-fetched');
        assert.deepEqual(await page.evaluate(()=>window.__readerTest.contextCalls),[[C,4]]);
        await page.getByRole('button',{name:'Read first 6 excerpts'}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.accepted-reader-excerpt').length===6);
        assert.deepEqual(await page.evaluate(()=>window.__readerTest.sourceCalls[0]),
          [C,SRC,4,null,6], 'first six excerpts pin accepted context revision');
        assert.equal(await page.locator('#set-accepted-reader').evaluate(el=>el.scrollWidth<=el.clientWidth+1),
          true, 'citation reader must not overflow horizontally');
        const btnHeights=await page.locator('#set-accepted-reader button').evaluateAll(
          buttons=>buttons.filter(b=>!b.hidden).map(b=>b.getBoundingClientRect().height));
        assert(btnHeights.every(x=>x>=44),'touch targets >=44px');
        // Playwright stitches a tall element screenshot; hide the fixed shell
        // during capture so its sticky desktop tabs do not appear mid-article.
        await page.locator('#set-accepted-reader').screenshot({
          path:path.join(OUT,'knowledge-accepted-'+size+'-'+scheme+'.png'),
          animations:'disabled',
          style:'.topbar,.tabbar { visibility:hidden !important; }'});
        await page.getByRole('button',{name:'Read next 6 excerpts'}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.accepted-reader-excerpt').length===8);
        assert.deepEqual(await page.evaluate(()=>window.__readerTest.sourceCalls[1]),
          [C,SRC,4,'00000000-0000-4000-8000-000000000006',6],
          'next request uses last accepted section cursor');
        assert.equal(await page.locator('.accepted-reader-next').count(),1);
        assert.equal(await page.locator('.accepted-reader-next').isVisible(),false,
          'end-of-source hides paging action');
        assert.equal(await page.evaluate(()=>window.__readerTest.writes),0,'read-only');
        // Deliberately revisiting the reader invalidates old accepted content.
        const callsBeforeLink=await page.evaluate(()=>window.__readerTest.contextCalls.length);
        await page.getByRole('button',{name:'Open accepted revision reader'}).click();
        assert.equal(await page.locator('#s-accepted-result').isVisible(),false,
          'prefill must clear previously rendered owner-scoped content');
        assert.equal(await page.evaluate(()=>window.__readerTest.contextCalls.length),
          callsBeforeLink, 'revisiting cannot initiate a background read');
        // A malformed source revision fails closed without showing uncited text.
        await page.evaluate(()=>{window.__readerTest.sourceMode='wrong-revision'});
        await page.locator('#s-accepted-read').click();
        await page.waitForFunction(()=>document.querySelector('#s-accepted-status')?.textContent.includes('loaded read-only'));
        await page.getByRole('button',{name:'Read first 6 excerpts'}).click();
        await page.waitForFunction(()=>document.querySelector('.accepted-reader-source [role=status]')?.textContent.includes('could not be read'));
        assert.equal(await page.locator('.accepted-reader-excerpt').count(),0,
          'reject wrong-revision source packet');
        // Unavailable production RPC should never surface raw schema errors.
        await page.evaluate(()=>{window.__readerTest.mode='not-deployed'});
        await page.locator('#s-accepted-read').click();
        await page.waitForFunction(()=>document.querySelector('#s-accepted-status')?.textContent.includes('not yet be deployed'));
        assert.equal(await page.locator('#s-accepted-result').isVisible(),false);
        await page.evaluate(()=>{window.__readerTest.mode='offline'});
        await page.locator('#s-accepted-read').click();
        await page.waitForFunction(()=>document.querySelector('#s-accepted-status')?.textContent.includes('Offline'));
        // A delayed response from A cannot be shown after account changes to B.
        await page.evaluate(()=>{window.__readerTest.mode='hold'});
        await page.locator('#s-accepted-read').click();
        await page.waitForFunction(()=>window.__readerTest.pending.length>0);
        await page.evaluate(()=>{
          const state=window.__readerTest;
          state.userId=state.B;
          for(const resolve of state.pending.splice(0))resolve({context_id:state.C,
            revision:4,format:'structured_v1',title:'Private A data',
            accepted_json:{source_refs:[]}});
        });
        await page.waitForTimeout(50);
        assert.equal(await page.locator('#s-accepted-result').isVisible(),false,
          'account change must not reveal owner A packet');
        await page.locator('#s-accepted-id').fill('');
        await page.getByRole('button',{name:'Open accepted revision reader'}).click();
        assert.equal(await page.locator('#s-accepted-id').inputValue(),'',
          'stale draft action cannot leak previous owner UUID to new owner');
        assert.match(await page.locator('#s-knowledge-status').textContent(),
          /Account or draft changed/);
        assert.equal(await page.evaluate(()=>window.__readerTest.writes),0);
      } finally {await ctx.close()}
    }
    assert.deepEqual(problems,[],'no browser errors');
    console.log('UI-02: saved-draft reader link, pinned six-excerpt cursors, owner/offline/schema gates and eight screenshots passed');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
