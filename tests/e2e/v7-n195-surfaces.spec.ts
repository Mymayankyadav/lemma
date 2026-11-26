import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {at,NOW} from './v7-scenes';

const repair=(route:string)=>at(route).replace('flags=','flags=uiRepairV1,atlasV3,');
test.use({timezoneId:'Asia/Kolkata',reducedMotion:'reduce'});

async function largePhone(page:Page,width:number){
 await page.setViewportSize({width,height:844});
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize='130%';}));
 await page.clock.setFixedTime(NOW);
}
async function captureEvidence(page:Page,info:TestInfo,name:string){
 const path=info.outputPath(name+'.png');
 await page.screenshot({path});await info.attach(name,{path,contentType:'image/png'});
}

for(const width of [360,390])test(`Capture saves Busy and Study with the chosen scope at ${width}px / 130% text`,async({page},info)=>{
 await largePhone(page,width);
 await page.addInitScript(()=>{if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[]}));});
 await page.goto(repair('/'));
 for(const kind of ['Busy','Study']){
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Capture',exact:true});
  await sheet.getByRole('textbox',{name:'What do you want to add?'}).fill(`${kind} acceptance tomorrow 4pm 25m #real`);
  const choice=sheet.getByRole('radio',{name:kind,exact:true});
  await choice.click();await expect(choice).toHaveAttribute('aria-checked','true');
  const path=sheet.getByRole('button',{name:'Remove Real Analysis',exact:true});
  if(kind==='Busy'){
   await expect(path).toHaveCount(0);
   await sheet.getByRole('radio',{name:'Study',exact:true}).click();await expect(path).toBeVisible();
   await expect(sheet.getByRole('textbox',{name:'What do you want to add?'})).toHaveValue(`${kind} acceptance tomorrow 4pm 25m #real`);
   await choice.click();await expect(path).toHaveCount(0);
  }else await expect(path).toBeVisible();
  const box=await choice.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  if(kind==='Busy')await captureEvidence(page,info,'busy-capture-'+width+'-large-text');
  await sheet.getByRole('button',{name:'Add block',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  const saved=await page.evaluate(title=>JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')!).blocks.find((row:{title:string})=>row.title===title),kind+' acceptance');
  expect(saved).toMatchObject({kind:kind.toLowerCase(),startsAt:'2026-11-10T10:30:00.000Z',endsAt:'2026-11-10T10:55:00.000Z',projectId:kind==='Busy'?null:'project-analysis',subjectId:kind==='Busy'?null:'subject-analysis'});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')!).blocks.length)).toBe(0);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toHaveCount(0);
 }
});

test('Capture More options carries Busy and clears the parsed study path',async({page})=>{
 await page.clock.setFixedTime(NOW);await page.goto(repair('/'));
 await page.getByRole('button',{name:'Capture',exact:true}).click();
 const capture=page.getByRole('dialog',{name:'Capture',exact:true});
 await capture.getByRole('textbox',{name:'What do you want to add?'}).fill('Appointment tomorrow 4pm 25m #real');
 await capture.getByRole('radio',{name:'Busy',exact:true}).click();
 await capture.getByRole('button',{name:'More options'}).click();
 const full=page.getByRole('dialog',{name:'New time block'});
 await expect(full.getByRole('radio',{name:'Busy',exact:true})).toHaveAttribute('aria-checked','true');
 await expect(full.getByRole('textbox',{name:'Calendar block title'})).toHaveValue('Appointment');
 await full.getByRole('button',{name:'Create block',exact:true}).click();
 await expect(full).toHaveCount(0);
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')!).blocks.find((row:{title:string})=>row.title==='Appointment'));
 expect(saved).toMatchObject({kind:'busy',projectId:null,startsAt:'2026-11-10T10:30:00.000Z',endsAt:'2026-11-10T10:55:00.000Z'});
});

for(const width of [360,390])test(`Atlas dialogs contain keyboard focus and restore their opener at ${width}px / 130% text`,async({page},info)=>{
 await largePhone(page,width);await page.goto(repair('/atlas?view=list&id=concept-compactness'));
 await page.getByRole('button',{name:'Show neighbours and actions'}).click();
 for(const name of ['Pin on map','Edit concept','Preview edits']){
  const opener=page.getByRole('button',{name,exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el=>el.matches(':modal'))).toBe(true);
  expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  for(const key of ['Tab','Shift+Tab'])for(let i=0;i<12;i++){
   await page.keyboard.press(key);
   expect(await dialog.evaluate(el=>el.contains(document.activeElement)),name+' '+key+' step '+i).toBe(true);
  }
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  if(name==='Pin on map')await captureEvidence(page,info,'atlas-pin-'+width+'-large-text');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.locator('.v7-atlas-sheet')).toHaveCount(1);
  await expect(opener).toBeFocused();
 }
});

test('source search opens and focuses the matching source and Back restores the search',async({page},info)=>{
 await largePhone(page,360);await page.goto(repair('/'));
 await page.getByRole('button',{name:'Search',exact:true}).click();
 const search=page.getByRole('combobox',{name:'Search',exact:true});
 await search.fill('Rudin');
 const source=page.getByRole('option',{name:/Principles of Mathematical Analysis/});
 await expect(source).toBeVisible();
 await captureEvidence(page,info,'source-search-360-large-text');
 await source.click();
 await expect(page).toHaveURL(/#\/p\/real-analysis\?tab=sources&source=source-rudin/);
 const heading=page.getByRole('heading',{name:'Principles of Mathematical Analysis',exact:true});
 await expect(heading).toBeVisible();await expect(heading).toBeFocused();
 await captureEvidence(page,info,'source-focused-360-large-text');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>/recent/.test(key)).some(key=>(localStorage.getItem(key)??'').includes('Principles of Mathematical Analysis')))).toBe(false);
 await page.goBack();await expect(search).toHaveValue('Rudin');await expect(source).toHaveAttribute('aria-selected','true');
 await search.press('Enter');await expect(heading).toBeFocused();
});

test('a source deep link reveals an item beyond the first twenty source rows',async({page})=>{
 await largePhone(page,360);
 await page.goto(repair('/p/real-analysis?tab=sources&source=stress-source-0-24').replace('demo=1','demo=stress'));
 const heading=page.getByRole('heading',{name:'Source 25: mathematical notes and proofs',exact:true});
 await expect(heading).toBeFocused();await expect(heading).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

for(const proposalKind of ['plan','plan_change'])test(`structured ${proposalKind} edits persist without approving the proposal`,async({page})=>{
 await largePhone(page,390);
 const owner='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222';
 const proposalId='33333333-3333-4333-8333-333333333333',draftId='44444444-4444-4444-8444-444444444444';
 const subjectId='55555555-5555-4555-8555-555555555555',createdAt=NOW.toISOString(),expires=Math.floor(NOW.getTime()/1000)+3600;
 const user={id:owner,email:'plan-editor@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:createdAt};
 const token=[{alg:'HS256',typ:'JWT'},{sub:owner,role:'authenticated',aud:'authenticated',exp:expires}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.fixture';
 await page.addInitScript(({user,token,expires})=>localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({user,access_token:token,refresh_token:'local-fixture',token_type:'bearer',expires_in:3600,expires_at:expires})),{user,token,expires});
 await page.route('**/auth/v1/**',route=>route.fulfill({json:user}));
 const settings={desired_retention:.9,new_per_day:20,reviews_per_day:200,learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,max_interval_days:36500,fuzz:false,load_balance:false,learn_ahead_minutes:20,macros:'',default_style:'socratic',mix_decks:true,preferred_chat:'claude',time_zone:'Asia/Kolkata',ui:{},version:1};
 const project={id:projectId,slug:'analysis',title:'Analysis',subject_id:subjectId,system:false,status:'active',version:1,created_at:createdAt};
 const checkpoint={id:'66666666-6666-4666-8666-666666666666',project_id:projectId,code:'CP1',title:'Foundations',status:'not_started',position:10,current_step:0,steps:['Define the objects'],version:1};
 const proposal={id:proposalId,project_id:projectId,kind:proposalKind,status:'pending',withdrawn_at:null,version:1,origin:'claude',created_at:createdAt,payload:proposalKind==='plan'?{checkpoints:[{code:'CP1',title:'Proposed foundations',objective:'Know the definitions',criterion:'State a definition',steps:['Define the objects']}] }:{ops:[{op:'update',code:'CP1',title:'Proposed foundations'}]}};
 let draft:Record<string,unknown>|null=null;
 const writes:{operation:string;patch:{payload?:{ops:unknown[]}}}[]=[];
 let approvals=0;
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/rest/v1/')[1];
  const single=request.headers().accept?.includes('object');
  const answer=(value:unknown,count?:number)=>route.fulfill({json:value,headers:count===undefined?{}:{'content-range':count?`0-${count-1}/${count}`:'*/0','access-control-expose-headers':'Content-Range'}});
  if(table==='rpc/lemma_plan_released')return answer(true);
  if(table==='settings'||table==='rpc/bootstrap')return answer(settings);
  if(table==='rpc/home_summary'||table==='rpc/exam_home_summary')return answer({projects:[],current:null,proposals:1,activeSession:null,...(table==='rpc/exam_home_summary'?{exam:{sittings:[]}}:{})});
  if(table==='rpc/home_review_outlook')return answer({decks:[],forecast:[]});
  if(table==='rpc/project_summaries')return answer([]);
  if(table==='projects')return answer(single?project:[project]);
  if(table==='subjects')return answer([{id:subjectId,name:'Analysis',glyph:'∫',hue:'violet',position:0}]);
  if(table==='proposals')return answer(single?proposal:[proposal]);
  if(table==='checkpoints')return answer(proposalKind==='plan'?[]:[checkpoint]);
  if(table==='proposal_drafts')return answer(single?draft:draft?[draft]:[],draft?1:0);
  if(table==='rpc/proposal_drafts_command'){
   const command=request.postDataJSON().p;writes.push(command);
   if(command.operation==='create')draft={id:draftId,proposal_id:proposalId,target_id:projectId,base_proposal_version:1,base_versions:{projects:{[projectId]:1}},payload:command.patch.payload,status:'draft',draft_version:1,edited_at:createdAt,created_at:createdAt};
   else if(command.operation==='save')draft={...draft,payload:command.patch.payload,status:'saved',draft_version:2};
   else if(command.operation==='submit')draft={...draft,status:'submitted',draft_version:3};
   else throw Error('Unexpected draft operation '+command.operation);
   return answer({status:'ok',actionNo:writes.length,draft,changed:[{resource:'proposal_drafts',id:draftId,version:draft!.draft_version}]});
  }
  if(table==='rpc/approve_proposal'){approvals++;return answer(null);}
  if(request.method()!=='GET'&&request.method()!=='HEAD'&&!table.startsWith('rpc/'))throw Error('Unexpected fixture mutation '+table);
  return answer([]);
 });
 await page.goto(repair('/proposals/'+proposalId).replace('demo=1','demo=0'));
 const details=page.locator('details').filter({has:page.getByText('Edit before approving',{exact:true})});
 await details.locator('summary').click();await details.getByRole('button',{name:'Start an edit',exact:true}).click();
 const decision=page.getByRole('group',{name:'Plan decision'});
 await expect(decision.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();
 await details.getByLabel('New title',{exact:true}).fill('Owner chosen foundations');
 if(proposalKind==='plan'){
  await details.getByLabel('Objective',{exact:true}).fill('Explain the definition');
  await details.getByLabel('Demonstration criterion',{exact:true}).fill('State and apply it unaided');
  await details.getByLabel('First step',{exact:true}).fill('Read the definition');
 }
 await details.getByRole('button',{name:'Add change to draft',exact:true}).click();
 await details.getByRole('button',{name:'Save edit',exact:true}).click();
 await expect(details.getByText('Draft draft · version 1',{exact:true})).toBeVisible();
 expect(writes[0].patch.payload?.ops).toEqual([proposalKind==='plan'?{op:'add',title:'Owner chosen foundations',objective:'Explain the definition',criterion:'State and apply it unaided',steps:['Read the definition']}:{op:'update',code:'CP1',title:'Owner chosen foundations'}]);
 await page.reload();await details.locator('summary').click();
 await expect(details.locator('pre').first()).toContainText('Owner chosen foundations');
 await details.getByRole('button',{name:'Change edit',exact:true}).click();
 await details.getByRole('button',{name:'Save edit',exact:true}).click();
 await expect(details.getByText('Draft saved · version 2',{exact:true})).toBeVisible();
 await details.getByRole('button',{name:'Send edit',exact:true}).click();
 await expect(details.getByText('Edit sent. Sending it does not approve the plan; that decision stays below.',{exact:true})).toBeVisible();
 expect(writes.map(write=>write.operation)).toEqual(['create','save','submit']);expect(approvals).toBe(0);
 await expect(decision.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();
});

for(const theme of ['graph','graph-night'])test('Atlas solid prerequisite links are actually painted with readable contrast in '+theme,async({page},info)=>{
 await page.setViewportSize({width:1000,height:900});
 await page.addInitScript(()=>{
  type Line={a:[number,number];b:[number,number];width:number;ratio:number};
  const lines=new WeakMap<HTMLCanvasElement,Line[]>(),paths=new WeakMap<CanvasRenderingContext2D,[number,number][]>();
  const backgrounds=new WeakMap<HTMLCanvasElement,ImageData>();
  const proto=CanvasRenderingContext2D.prototype,{beginPath,moveTo,lineTo,stroke,fillRect}=proto;
  proto.beginPath=function(){paths.set(this,[]);return beginPath.call(this);};
  proto.moveTo=function(x,y){paths.set(this,[[x,y]]);return moveTo.call(this,x,y);};
  proto.lineTo=function(x,y){paths.get(this)?.push([x,y]);return lineTo.call(this,x,y);};
  proto.fillRect=function(x,y,w,h){if(x===0&&y===0&&w>100&&h>100){lines.set(this.canvas,[]);backgrounds.delete(this.canvas);}return fillRect.call(this,x,y,w,h);};
  const light=(pixels:Uint8ClampedArray,offset=0)=>{
    const rgb=[...pixels.slice(offset,offset+3)].map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
    return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  };
  proto.stroke=function(...args:Parameters<typeof stroke>){
   const path=paths.get(this);
   if(!this.canvas.closest('.v7-atlas-sky')||path?.length!==2||this.globalAlpha!==1||this.lineWidth!==1.5)return stroke.apply(this,args);
   let background=backgrounds.get(this.canvas);
   if(!background){background=this.getImageData(0,0,this.canvas.width,this.canvas.height);backgrounds.set(this.canvas,background);}
   if(this.getLineDash().length)return stroke.apply(this,args);
   const [a,b]=path,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
   const transform=this.getTransform(),nx=-dy/length,ny=dx/length;
   const points=[-.5,0,.5].map(offset=>new DOMPoint(x+nx*offset,y+ny*offset).matrixTransform(transform))
    .map(point=>({x:Math.floor(point.x),y:Math.floor(point.y)}));
   if(length<20||points.some(point=>point.x<0||point.y<0||point.x>=this.canvas.width||point.y>=this.canvas.height))return stroke.apply(this,args);
   // Compare each real stroke with the painted background layer, including
   // its gradient. Other crossing links, later node markers and text must
   // not become the background sample or cover the foreground sample.
   const before=points.map(point=>light(background.data,(point.y*background.width+point.x)*4));
   stroke.apply(this,args);
   const ratio=Math.max(...points.map((point,i)=>{const ink=light(this.getImageData(point.x,point.y,1,1).data),bg=before[i];return (Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05);}));
   const stored=lines.get(this.canvas)??[];stored.push({a,b,width:this.lineWidth,ratio});lines.set(this.canvas,stored);
  };
  Object.assign(window,{n195PaintedLinks:()=>{
   const canvas=document.querySelector<HTMLCanvasElement>('.v7-atlas-sky canvas');
   return canvas?lines.get(canvas)??[]:[];
  }});
 });
 await page.goto(repair('/atlas?view=map').replace('#','&theme='+theme+'#'));
 await expect(page.locator('.v7-atlas-sky[data-layout]')).toBeVisible();
 const samples=()=>page.evaluate(()=>(window as unknown as {n195PaintedLinks:()=>{ratio:number}[]}).n195PaintedLinks());
 await expect.poll(async()=>(await samples()).length).toBeGreaterThan(0);
 const painted=await samples();
 const evidence=info.outputPath('painted-prerequisite-contrast.json');
 await writeFile(evidence,JSON.stringify(painted));
 await info.attach('painted-prerequisite-contrast',{path:evidence,contentType:'application/json'});
 expect(painted.filter(link=>link.ratio<3)).toEqual([]);
 await captureEvidence(page,info,'atlas-map-'+theme);
});
