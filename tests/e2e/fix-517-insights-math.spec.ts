import {expect,test} from '@playwright/test';

// Audit #517: exercise the actual live Insights screen with mathematical names.
// Intercept the API: no requests reach the owner's Supabase instance.
const owner='11111111-1111-1111-1111-111111111111';
const user={id:owner,email:'math-fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const settings={desired_retention:0.9,new_per_day:20,reviews_per_day:200,learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,max_interval_days:36500,fuzz:true,load_balance:true,learn_ahead_minutes:20,fsrs_weights:null,fsrs_tuned_at:null,macros:'',default_style:'socratic',tutor_rules:null,mix_decks:true,preferred_chat:'claude',connector_secret:'',connector_last_seen_at:null,connector_last_client:null,time_zone:'UTC'};
const home={resume:null,due:0,pendingProposals:0,projects:[]};
const insights={
 days:30,reviews:100,right:90,sessions:10,minutes:1000,typicalSession:30,
 reviewDays:[],calibration:[],
 subjectMinutes:[{subject:{id:'subject-math',name:'Algebra $\\mathbb{F}_p$',glyph:'A',hue:'amber',position:0},minutes:1000}],
 checkpointDays:[],
 mostRevisited:{label:'Uniform convergence',times:20,conceptName:'Uniform $\\ell^p$ convergence'},
};
const token=[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({sub:owner,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
 'fixture-signature',
].join('.');

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #517 Insights mathematical labels '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.emulateMedia({colorScheme:theme==='graph-night'?'dark':'light'});
  await page.addInitScript(({token,user,expiresAt})=>{
   localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({
    access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:expiresAt,user,
   }));
  },{token,user,expiresAt:Math.floor(Date.now()/1000)+3600});
  const unexpected:string[]=[];
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
  const subjectMinutes=[...insights.subjectMinutes,...Array.from({length:profile==='stress'?14:39},(_,i)=>({
   subject:{id:'extra-'+i,name:'Subject '+i,glyph:'S',hue:'amber',position:i+1},minutes:500-i,
  }))];
  await page.route('**/rest/v1/**',r=>{
   const path=new URL(r.request().url()).pathname.replace(/^\/rest\/v1/,'');
   const value:unknown=path==='/rpc/bootstrap'||path==='/settings'?settings:path==='/rpc/insights'?{...insights,subjectMinutes}:path==='/rpc/home_summary'?home:undefined;
   if(value===undefined){unexpected.push(path);return r.fulfill({status:404,body:'{}'});}
   return r.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(value)});
  });
  await page.goto('/lemma/?demo=0&theme='+theme+'#/insights');
  await expect(page.getByRole('heading',{name:'Insights'})).toBeVisible();
  const subjects=page.getByRole('group',{name:'Time by subject'});
  const subject=subjects.getByRole('button',{name:'Algebra 𝔽ₚ'});
  await expect(subject).toBeVisible();
  await expect(subjects.locator('button')).toHaveCount(7); // six visible subjects plus Other
  await expect(subject.locator('.katex')).toHaveCount(1);
  await subject.click();
  await expect(subject.locator('.katex')).toHaveCount(1);
  const revisited=page.locator('a[aria-label^="Most revisited:"]');
  await expect(revisited.locator('.katex')).toHaveCount(1);
  await expect(revisited).toHaveAttribute('href',/name=Uniform/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(unexpected).toEqual([]);
  await revisited.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/screens/fix-517-insights-'+profile+'-'+theme+'-'+width+'.png',fullPage:true});
 });
}

test('FIX #517 Atlas opens a named idea even when its incoming slug is lossy',async({page})=>{
 await page.goto('/lemma/?demo=1#/atlas?focus=lossy-math-slug&name=Uniform%20continuity');
 await expect(page.getByRole('heading',{name:'Atlas'})).toBeVisible();
 const dialog=page.getByRole('dialog',{name:'Uniform continuity'});
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('[data-atlas-details="true"]')).toBeVisible();
});

test('FIX #517 Atlas manual deselection clears stale named deep-link metadata',async({page})=>{
 await page.goto('/lemma/?demo=1#/atlas?focus=lossy-math-slug&name=Uniform%20continuity');
 const dialog=page.getByRole('dialog',{name:'Uniform continuity'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('[data-atlas-peek]')).toBeVisible();
 await page.getByRole('button',{name:'Clear selection'}).click();
 await expect(page).not.toHaveURL(/(?:[?&](?:name|focus|id)=)/);
 await expect(page.locator('[data-atlas-peek]')).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Uniform continuity'})).toHaveCount(0);
 await page.screenshot({path:'test-results/screens/fix-517-atlas-deselection.png',fullPage:true});
});

test('FIX #517 duplicate mathematical idea names ask for a subject instead of opening the wrong idea',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.addInitScript(({token,user,expiresAt})=>{
  localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({
   access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:expiresAt,user,
  }));
 },{token,user,expiresAt:Math.floor(Date.now()/1000)+3600});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
 await page.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
 const name=String.raw`Uniform $\ell^p$ convergence`;
 const subjects=[
  {id:'subject-analysis',name:'Analysis',glyph:'A',hue:'amber',position:0},
  {id:'subject-topology',name:'Topology',glyph:'T',hue:'slate',position:1},
 ];
 const concepts=subjects.map((subject,i)=>({
  id:'concept-'+i,slug:'uniform-continuity',name,subject_id:subject.id,
  level:'planet',parent_id:null,topic:null,blurb:null,is_star:false,pin_x:null,pin_y:null,
 }));
 const unexpected:string[]=[];
 await page.route('**/rest/v1/**',r=>{
  const path=new URL(r.request().url()).pathname.replace(/^\/rest\/v1/,'');
  const data:unknown=path==='/rpc/bootstrap'||path==='/settings'?settings:
   path==='/subjects'?subjects:path==='/concepts'?concepts:
   path==='/rpc/review_items'?[]:
   ['/concept_links','/checkpoint_concepts','/checkpoints','/projects','/checkpoint_prereqs',
    '/misconceptions','/notes','/cards','/reviews'].includes(path)?[]:undefined;
  if(data===undefined){unexpected.push(path);return r.fulfill({status:404,body:'{}'});}
  return r.fulfill({status:200,contentType:'application/json',
   headers:{'content-range':'0-0/1'},body:JSON.stringify(data)});
 });
 await page.goto('/lemma/?demo=0#/atlas?focus=uniform-l-p-convergence&name='+encodeURIComponent(name));
 const chooser=page.getByRole('dialog',{name:'Choose an idea'});
 await expect(chooser).toBeVisible();
 await expect(chooser.getByRole('button',{name:/in Analysis/})).toBeVisible();
 await expect(chooser.getByRole('button',{name:/in Topology/})).toBeVisible();
 await expect(page.locator('[data-atlas-details]')).toHaveCount(0);
 await chooser.getByRole('button',{name:/in Topology/}).click();
 await expect(page).toHaveURL(/id=concept-1/);
 await expect(page.locator('[data-atlas-details]')).toBeVisible();
 expect(unexpected).toEqual([]);
 await page.screenshot({path:'test-results/screens/fix-517-duplicate-idea-chooser.png',fullPage:true});
});
