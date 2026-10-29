'use strict';
// Real built bundle and readiness flags; synthetic signed-in transport only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const seed=require('./seed.js');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/test.html'),'utf8');
const mock=fs.readFileSync(path.join(root,'test/mock_claude.js'),'utf8');
const docs=Object.fromEntries(seed.map(n=>['data/users/u_test/profile/notes/'+n.id,n]));
const libs={'katex.min.js':'katex/dist/katex.min.js','marked.umd.js':'marked/lib/marked.umd.js','purify.min.js':'dompurify/dist/purify.min.js'};
(async()=>{
 const browser=await chromium.launch();
 fs.mkdirSync('test-output/ui',{recursive:true});
 try {
  for(const size of ['mobile','desktop']) for(const scheme of ['light','dark']) {
   const context=await browser.newContext({viewport:size==='mobile'?{width:390,height:844}:{width:1280,height:800},colorScheme:scheme,serviceWorkers:'block',reducedMotion:'reduce'});
   const errors=[];
   try {
    await context.route('**/*',async route=>{
     const url=route.request().url();
     if(url.startsWith('https://lemma.test/'))return route.fulfill({status:200,contentType:'text/html',body:html});
     for(const [file,pkg] of Object.entries(libs))if(url.endsWith(file))return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(root,'node_modules',pkg),'utf8')});
     if(url.includes('fonts.googleapis.com'))return route.fulfill({status:200,contentType:'text/css',body:''});
     if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
     return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({docs,mock})=>{window.__SEED__=docs;(0,eval)(mock);},{docs,mock});
    await page.goto('https://lemma.test/#study');
    await page.getByText('Sign in to open an approved study checkpoint.').waitFor();
    assert.equal(await page.getByRole('button',{name:'Save proof attempt'}).count(),0);
    assert.equal(await page.locator('[data-go="study"]').count(),2);
    await page.screenshot({path:`test-output/ui/study-activation-signed-out-${size}-${scheme}.png`});
    // Replace only auth/transport after boot; actual StudyPlan and StudyView,
    // their readiness flags, navigation and first-plan UI remain unmodified.
    await page.evaluate(()=>{
     window.__activationWrites=[];
     const client={from(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},setHeader(){return Promise.resolve({data:[]})}};return q;},rpc(name,args){window.__activationWrites.push({name,args});throw Error('unexpected write');}};
     Object.defineProperty(LemmaAccount,'user',{configurable:true,get(){return {id:'00000000-0000-4000-8000-000000000001'};}});
     Object.defineProperty(LemmaAccount,'client',{configurable:true,get(){return client;}});
     LemmaCloud.accountToken=async()=> 'synthetic-token';
     App.go('study');
    });
    await page.getByRole('heading',{name:'Create your first study plan'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Approve this reviewed plan'}).count(),0);
    assert.equal(await page.evaluate(()=>window.__activationWrites.length),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:`test-output/ui/study-activation-intake-${size}-${scheme}.png`,fullPage:true});
    assert.deepEqual(errors,[]);
   } finally {await context.close();}
  }
 } finally {await browser.close();}
 console.log('PASS PLAN-01 P5n: actual bundle readiness, signed-out route and signed-in synthetic intake');
})().catch(e=>{console.error(e);process.exitCode=1;});
