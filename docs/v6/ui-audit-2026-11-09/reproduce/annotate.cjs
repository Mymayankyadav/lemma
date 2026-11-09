// For key defects: replay a capture step, measure target boxes, screenshot at 2x, write boxes JSON for PIL.
const {chromium}=require('playwright');const fs=require('fs');
const {newCtx,settle,BASE}=require('./lib.cjs');const steps=require('./steps.cjs');
const byId=Object.fromEntries(steps.map(s=>[s[0],s]));
const box=async(loc)=>{try{const b=await loc.first().boundingBox();return b}catch{return null}};
const cases=[
 ['A01-calendar-block-modal-off-centre','calendar-block-new',async p=>({dialog:await box(p.locator('dialog[open]'))})],
 ['A02-task-modal-off-centre','task-sheet-new',async p=>({dialog:await box(p.locator('dialog[open]'))})],
 ['A03-new-card-create-under-nav','cards-new',async p=>({target:await box(p.getByRole('button',{name:'Create card'})),nav:await box(p.locator('nav[aria-label="Main navigation"]')),sheet:await box(p.locator('[role=dialog]'))})],
 ['A04-delete-card-buttons-under-nav','card-delete',async p=>({t1:await box(p.locator('[role=dialog]').getByRole('button',{name:'Delete card'})),t2:await box(p.locator('[role=dialog]').getByRole('button',{name:'Cancel'})),nav:await box(p.locator('nav[aria-label="Main navigation"]')),sheet:await box(p.locator('[role=dialog]'))})],
 ['A05-edit-card-sheet-under-header','card-edit',async p=>({header:await box(p.locator('[data-v6-header]')),sheet:await box(p.locator('[role=dialog]')),save:await box(p.locator('[role=dialog]').getByRole('button',{name:/Save/})),nav:await box(p.locator('nav[aria-label="Main navigation"]'))})],
 ['A06-new-project-sheet-no-padding','new-path',async p=>({sheet:await box(p.locator('[role=dialog]')),heading:await box(p.locator('[role=dialog] h2').first()),input:await box(p.locator('[role=dialog] input').first())})],
 ['A07-planner-iso-utc-fields','calendar-planner',async p=>({f1:await box(p.locator('dialog[open] input[type=text], dialog[open] input:not([type])').first()),f2:await box(p.locator('dialog[open] input[type=text], dialog[open] input:not([type])').nth(1)),note:await box(p.locator('dialog[open]').getByText(/ISO instants/))})],
 ['A08-inbox-raw-latex-cloze','inbox-browse',async p=>({t1:await box(p.getByText('Why must $U_y$',{exact:false})),t2:await box(p.getByText('{{c1::',{exact:false}))})],
];
(async()=>{const b=await chromium.launch();const out={};
 for(const [name,id,measure] of cases){
  const ctx=await newCtx(b,{theme:'night',scale:2});const p=await ctx.newPage();
  const [,route,,act]=byId[id];
  await p.goto(BASE+'?demo=1&mode=night#'+route);await settle(p,700);
  if(act)try{await act(p)}catch(e){console.log('act failed',name,e.message.split('\n')[0])}
  await settle(p,700);await p.evaluate(()=>scrollTo(0,0));
  const boxes=await measure(p);
  await p.screenshot({path:'ann/'+name+'.png',animations:'disabled'});
  out[name]=boxes;await ctx.close();process.stdout.write(name+' ');
 }
 fs.writeFileSync('ann/boxes.json',JSON.stringify(out,null,1));await b.close();console.log('done')})();
