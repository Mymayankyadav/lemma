const {chromium}=require('playwright');const {newCtx,go,settle}=require('./lib.cjs');
const summ=(p,t)=>p.locator(`summary[aria-label="${t}"], summary:has-text("${t}")`).first();
const cases=[
 ['New task (+ → Task)','/',async p=>{await summ(p,'Add').click();await p.getByRole('button',{name:'Task',exact:true}).click()}],
 ['New project','/projects/new',null],
 ['New card','/cards?new=1',null],
 ['Edit card','/cards/7',async p=>p.getByRole('button',{name:'Edit card'}).click()],
 ['Delete card confirm','/cards/7',async p=>p.getByRole('button',{name:'Delete card'}).click()],
 ['Inbox edit card','/proposals',async p=>p.locator('button').filter({hasText:/^\s*Edit\s*$/}).first().click()],
 ['Filter cards','/cards',async p=>p.getByRole('button',{name:'Filters'}).click()],
 ['New calendar block','/calendar',async p=>{await summ(p,'Planning tools').click();await p.getByRole('button',{name:'Plan block in sheet'}).click()}],
 ['Plan study tasks','/calendar',async p=>{await summ(p,'Planning tools').click();await p.getByRole('button',{name:'Plan study tasks'}).click();await p.waitForTimeout(800)}],
 ['Edit task','/tasks',async p=>p.getByRole('button',{name:/^Edit Write up/}).click()],
 ['Time log: add approximate','/log',async p=>p.getByRole('button',{name:'Add approximate time'}).click()],
 ['Paths manage','/projects',async p=>p.getByRole('button',{name:'Manage Real Analysis'}).click()],
];
(async()=>{const b=await chromium.launch();
 for(const [w,h] of [[390,844],[375,667]]){
  const ctx=await newCtx(b,{scale:1,w,h});const p=await ctx.newPage();
  for(const [name,route,act] of cases){
   await p.goto('about:blank');await go(p,route);if(act)try{await act(p)}catch(e){console.log(w+'x'+h,name,'ACT FAILED');continue}
   await settle(p,400);
   const r=await p.evaluate(()=>{const d=[...document.querySelectorAll('dialog[open],[role=dialog]')].pop()||document.querySelector('#main-content');const out=[];
    for(const b of d.querySelectorAll('button,a[href],input,select,textarea')){const q=b.getBoundingClientRect();if(q.width===0||q.height===0)continue;
     const label=(b.innerText||b.getAttribute('aria-label')||b.placeholder||b.tagName).trim().replace(/\s+/g,' ').slice(0,28);
     if(q.top>=innerHeight){out.push(label+': below viewport');continue}
     const y=Math.min(q.top+q.height/2,innerHeight-2);const el=document.elementFromPoint(q.left+q.width/2,y);
     if(el&&!b.contains(el)&&!el.contains(b))out.push(label+': covered by '+(el.closest('nav')?'bottom nav':el.tagName.toLowerCase()))}
    const sc=[d,...d.querySelectorAll('*')].some(e=>e.scrollHeight>e.clientHeight+5&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));
    return {issues:out,scrollable:sc}});
   console.log(w+'x'+h,'|',name,'|',r.issues.length?r.issues.join('; '):'all controls reachable','| sheet scrolls:',r.scrollable);
  }
  await ctx.close();}
 await b.close()})();
