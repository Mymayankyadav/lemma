import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test('signed-in first card and grade recover both lost acknowledgements through the ordinary UI',async({page})=>{
 const uid='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
 const note='33333333-3333-4333-8333-333333333333',card='44444444-4444-4444-8444-444444444444';
 const run='55555555-5555-4555-8555-555555555555',item='66666666-6666-4666-8666-666666666666';
 const expires=Math.floor(Date.now()/1000)+3600;
 const user={id:uid,email:'first-study@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const token=[{alg:'HS256',typ:'JWT'},{sub:uid,role:'authenticated',aud:'authenticated',exp:expires}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.fixture';
 await page.addInitScript(({user,token,expires})=>localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({user,access_token:token,refresh_token:'local-fixture',token_type:'bearer',expires_in:3600,expires_at:expires})),{user,token,expires});
 await page.route('**/auth/v1/**',r=>r.fulfill({json:user}));
 const settings={desired_retention:.9,new_per_day:20,reviews_per_day:200,learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,
  max_interval_days:36500,fuzz:false,load_balance:false,learn_ahead_minutes:20,macros:'',default_style:'socratic',mix_decks:true,
  preferred_chat:'claude',time_zone:'UTC',ui:{},version:1};
 const front='What is an isolated point?',back='A point open as a singleton.';
 const noteRow={id:note,no:14,user_id:uid,project_id:project,checkpoint_id:null,session_id:null,source_id:null,front,back,type:'basic',kind:'other',tags:[],status:'active',origin:'user',page_label:null};
 const cardRow={id:card,note_id:note,user_id:uid,ord:1,version:1,state:0,due:new Date().toISOString(),stability:0,difficulty:0,last_review:null,step:0,reps:0,lapses:0};
 const created:unknown[]=[],graded:unknown[]=[];
 let started=false;
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/rest/v1/')[1],body=req.postDataJSON();
  const answer=(json:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify(json)});
  if(table==='rpc/create_first_study_card'){
   expect(body).toMatchObject({p_expected_owner:uid,p_front:front,p_back:back,p_path:{kind:'new',title:'Topology'}});
   created.push(body);
   if(created.length===1)return route.abort('connectionreset');
   expect(body).toEqual(created[0]);
   return answer({operationId:body.p_operation_id,status:'applied',noteNo:14,noteId:note,cardId:card,projectId:project,projectSlug:'topology',actionNo:1});
  }
  if(table==='rpc/start_study_target'){
   expect(body).toMatchObject({p_kind:'card',p_id:card});started=true;
   return answer({operationId:body.p_operation_id,status:'applied',runId:run,runVersion:1,actionNo:2});
  }
  if(table==='rpc/grade_study_run_item'){
   expect(body).toMatchObject({p_run:run,p_item:item,p_card:card,p_run_version:1,p_card_version:1,p_rating:3,p_next:{reps:1}});
   graded.push(body);
   if(graded.length===1)return route.abort('connectionreset');
   expect(body).toEqual(graded[0]);
   return answer({operationId:body.p_operation_id,status:'applied',runId:run,itemId:item,cardId:card,reviewId:44,runVersion:2,actionNo:3});
  }
  if(table==='rpc/lemma_plan_released')return answer(true);
  if(table==='rpc/study_run_item_available')return answer(true);
  if(table==='rpc/bootstrap'||table==='settings')return answer(settings);
  if(table==='rpc/home_summary')return answer({projects:[],current:null,proposals:0,activeSession:null});
  if(table==='rpc/home_review_outlook')return answer({decks:[],forecast:[]});
  if(table==='rpc/search_cards_filtered_page')return answer(created.length?[{noteNo:14,front,projectSlug:'topology',status:'active',type:'basic',kind:'other',openComments:0}]:[]);
  if(table==='notes')return answer(req.headers().accept?.includes('object')?noteRow:[noteRow]);
  if(table==='cards')return answer([cardRow]);
  if(table==='projects')return answer(created.length?[{id:project,slug:'topology'}]:[]);
  if(table==='review_runs')return answer(started?[{id:run,position:graded.length?1:0,status:graded.length?'exhausted':'running',version:graded.length?2:1,
   filters:{target:{kind:'card',id:card},cardId:card},started_at:new Date().toISOString(),ended_at:graded.length?new Date().toISOString():null}]:[]);
  if(table==='review_run_items')return answer([{id:item,position:0,card_id:card,expected_card_version:1,state:graded.length?'graded':'pending',review_id:graded.length?44:null}]);
  if(req.method()!=='GET'&&!table.startsWith('rpc/'))throw Error('Unexpected fixture mutation '+table);
  return answer([]);
 });
 const route=at('/cards').replace('demo=1','demo=0').replace('flags=','flags=uiRepairV1,');
 await page.goto(route);
 await page.getByRole('button',{name:'Create a path and card',exact:true}).click();
 await page.getByLabel('Path name',{exact:true}).fill('Topology');
 await page.getByLabel('Front',{exact:true}).fill(front);await page.getByLabel('Back',{exact:true}).fill(back);
 await page.getByRole('button',{name:'Save card',exact:true}).click();
 await expect(page.getByText('The save could not be confirmed.',{exact:false})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Retry saving card'}).click();
 await expect(page).toHaveURL(/#\/cards\/14$/);await expect(page.getByText(front,{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Review now',exact:true}).click();
 await page.getByRole('button',{name:/Show answer/}).click();await expect(page.getByText(back,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^Good/}).click();
 await expect(page.getByRole('button',{name:'Retry grade confirmation'})).toBeVisible();
 expect(graded).toHaveLength(1);
 await page.reload();
 await expect.poll(()=>graded.length).toBe(2);
 await expect(page.getByText(/Round saved. 1 graded/)).toBeVisible();
 expect(created).toHaveLength(2);expect(graded[1]).toEqual(graded[0]);
});

const authKey='sb-yemqnhnztlbyxmjxidis-auth-token';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const live=(path:string)=>at(path).replace('demo=1','demo=0').replace('flags=','flags=uiRepairV1,');
const studySettings={desired_retention:.9,new_per_day:20,reviews_per_day:200,learn_steps:'1m 10m',relearn_steps:'10m',
 rollover_hour:4,max_interval_days:36500,fuzz:false,load_balance:false,learn_ahead_minutes:20,macros:'',
 default_style:'socratic',mix_decks:true,preferred_chat:'claude',time_zone:'UTC',ui:{},version:1};
function authSession(ownerId:string){
 const expires=Math.floor(Date.now()/1000)+7200;
 const user={id:ownerId,email:ownerId+'@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:NOW.toISOString()};
 const token=[{alg:'HS256',typ:'JWT'},{sub:ownerId,role:'authenticated',aud:'authenticated',exp:expires}]
  .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.fixture';
 return {user,access_token:token,refresh_token:'local-fixture',token_type:'bearer',expires_in:7200,expires_at:expires};
}

type ScopeKind='path'|'checkpoint'|'concept';
type WireCard={id:string;note_id:string;user_id:string;ord:number;version:number;state:number;due:string;stability:number;
 difficulty:number;last_review:string|null;step:number;reps:number;lapses:number};
type FixtureCard={card:WireCard;no:number;front:string;back:string;projectId:string;slug:string;checkpointId:string;conceptId:string};
type FixtureItem={id:string;position:number;card_id:string;expected_card_version:number;state:'pending'|'graded';review_id:number|null};
type FixtureRun={id:string;user_id:string;position:number;status:'running'|'paused'|'exhausted';version:number;
 filters:{target?:{kind:ScopeKind;id:string};targetLabel?:string};started_at:string;ended_at:string|null;items:FixtureItem[]};

/** Stateful PostgREST boundary: exercises the production adapter and persisted UI recovery.
 * Actual RLS, concurrent transactions and membership are independently tested by first-study*.mjs. */
async function reviewFixture(page:Page,options:{count:number;paused?:boolean;future?:boolean;loseGradeAck?:boolean;otherPath?:boolean;released?:boolean}){
 const ownerId=id(1),otherOwner=id(2),pathId=id(10),checkpointId=id(20),conceptId=id(30);
 const future=new Date(NOW.getTime()+90*86400000).toISOString();
 let session=authSession(ownerId),runNumber=100,reviewNumber=0;
 const runs:FixtureRun[]=[],gradeRequests:Record<string,unknown>[]=[],startRequests:Record<string,unknown>[]=[],exactReads:string[]=[];
 const receipts=new Map<string,Record<string,unknown>>();
 const records:FixtureCard[]=Array.from({length:options.count+(options.otherPath?1:0)},(_,index)=>{
  const other=index>=options.count;
  return {card:{id:id(1000+index),note_id:id(2000+index),user_id:ownerId,ord:1,version:1,state:2,
    due:options.future?future:NOW.toISOString(),stability:10,difficulty:5,last_review:new Date(NOW.getTime()-86400000).toISOString(),step:0,reps:3,lapses:0},
   no:100+index,front:(other?'Other path':'Topology')+' question '+(index+1),back:'Answer '+(index+1),
   projectId:other?id(11):pathId,slug:other?'algebra':'topology',checkpointId:other?id(22):index<4?checkpointId:id(21),
   conceptId:index<9?conceptId:id(31)};
 });
 const dueCards=()=>records.filter(row=>row.card.user_id===session.user.id&&row.card.due<=NOW.toISOString());
 function materialize(selected:FixtureCard[],filters:FixtureRun['filters']={}):FixtureRun{
  const run:FixtureRun={id:id(runNumber++),user_id:session.user.id,position:0,status:'running',version:1,filters,
   started_at:NOW.toISOString(),ended_at:null,items:selected.map((row,position)=>({id:id(3000+runNumber*100+position),position,
    card_id:row.card.id,expected_card_version:row.card.version,state:'pending',review_id:null}))};
  runs.push(run);return run;
 }
 if(options.paused){
  const paused=materialize(records.filter(row=>row.projectId===pathId));
  paused.status='paused';paused.position=1;paused.version=3;paused.items[0].state='graded';paused.items[0].review_id=++reviewNumber;
  records[0].card.due=future;records[0].card.version++;
 }
 await page.addInitScript(({authKey,session})=>{
  if(!localStorage.getItem(authKey))localStorage.setItem(authKey,JSON.stringify(session));
 },{authKey,session});
 await page.route('**/auth/v1/**',route=>route.fulfill({json:session.user}));
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/rest/v1/')[1];
  const body=request.postDataJSON(),reply=(json:unknown)=>route.fulfill({json});
  const rows=(values:Record<string,unknown>[])=>reply(request.headers().accept?.includes('vnd.pgrst.object')?values[0]??null:values);
  const selected=<T extends Record<string,unknown>>(values:T[])=>values.filter(row=>
   [...url.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(row[key])===value.slice(3)));
  const visibleRuns=()=>runs.filter(run=>run.user_id===session.user.id);
  if(table==='rpc/lemma_plan_released')return reply(options.released??true);
  if(table==='rpc/bootstrap'||table==='settings')return reply(studySettings);
  if(table==='rpc/home_summary')return reply({projects:[],current:null,proposals:0,activeSession:null});
  if(table==='rpc/home_review_outlook')return reply({decks:['topology','algebra'].map(slug=>({key:'project:'+slug,
   label:slug==='topology'?'Topology':'Algebra',due:dueCards().filter(row=>row.slug===slug).length,children:[]})),forecast:[]});
  if(table==='rpc/insights')return reply({});
  if(table==='rpc/review_items')return reply(dueCards().map(row=>({cardId:row.card.id,noteId:row.card.note_id,noteNo:row.no,ord:1,
   type:'basic',kind:'other',front:row.front,back:row.back,projectSlug:row.slug,glyph:'',checkpointCode:null,checkpointTitle:null,
   sessionNumber:null,sourceShort:null,pageLabel:null,state:{...row.card,lastReview:row.card.last_review}})));
  if(table==='rpc/search_cards_filtered_page')return reply(records.filter(row=>row.card.user_id===session.user.id).map(row=>({noteNo:row.no,
   front:row.front,projectSlug:row.slug,status:'active',type:'basic',kind:'other',openComments:0})));
  if(table==='rpc/next_study_due'){
   const waiting=records.filter(row=>row.card.user_id===session.user.id&&row.card.due>NOW.toISOString()).sort((a,b)=>a.card.due.localeCompare(b.card.due));
   const day=waiting[0]?.card.due.slice(0,10);
   return reply(day?{day,count:waiting.filter(row=>row.card.due.startsWith(day)).length}:null);
  }
  if(table==='rpc/start_study_target'){
   startRequests.push(body);
   const kind=body.p_kind as ScopeKind,scopeId=body.p_id as string;
   const chosen=dueCards().filter(row=>(kind==='path'?row.projectId:kind==='checkpoint'?row.checkpointId:row.conceptId)===scopeId);
   if(!chosen.length)return reply({operationId:body.p_operation_id,status:'empty'});
   const label=kind==='path'?(scopeId===pathId?'Topology':'Algebra'):kind==='checkpoint'?'Compactness checkpoint':'Compactness concept';
   const run=materialize(chosen,{target:{kind,id:scopeId},targetLabel:label});
   return reply({operationId:body.p_operation_id,status:'applied',runId:run.id,runVersion:run.version,actionNo:1});
  }
  if(table==='rpc/review_runs_command'){
   const command=body.p;
   let run:FixtureRun|undefined;
   if(command.operation==='start'){
    startRequests.push(command);
    const selectedDecks=command.patch.selected_deck_ids as string[];
    run=materialize(dueCards().filter(row=>selectedDecks.includes('project:'+row.slug)).slice(0,command.patch.card_budget));
   }else{
    run=visibleRuns().find(row=>row.id===command.target.id);
    expect(run).toBeDefined();expect(command.expectedVersion).toBe(run!.version);
    expect(['pause','resume']).toContain(command.operation);
    run!.status=command.operation==='pause'?'paused':'running';run!.version++;
   }
   return reply({status:'ok',actionNo:1,run,changed:[{resource:'review_runs',id:run!.id,version:run!.version}]});
  }
  if(table==='rpc/study_run_item_available'){
   const run=visibleRuns().find(row=>row.id===body.p_run),item=run?.items[run.position];
   return reply(!!item&&item.id===body.p_item&&item.card_id===body.p_card);
  }
  if(table==='rpc/grade_study_run_item'){
   gradeRequests.push(body);
   const previous=receipts.get(body.p_operation_id);
   if(previous){expect(body).toEqual(gradeRequests.find(row=>row.p_operation_id===body.p_operation_id));return reply(previous);}
   const run=visibleRuns().find(row=>row.id===body.p_run),item=run?.items[run.position];
   expect(run).toBeDefined();expect(item).toBeDefined();
   expect(body).toMatchObject({p_run_version:run!.version,p_item:item!.id,p_card:item!.card_id,p_card_version:item!.expected_card_version});
   const card=records.find(row=>row.card.id===item!.card_id)!.card;
   expect(body.p_next.reps).toBe(card.reps+1);
   Object.assign(card,body.p_next,{version:card.version+1});
   item!.state='graded';item!.review_id=++reviewNumber;run!.position++;run!.version++;
   if(run!.position===run!.items.length){run!.status='exhausted';run!.ended_at=NOW.toISOString();}
   const receipt={operationId:body.p_operation_id,status:'applied',runId:run!.id,itemId:item!.id,cardId:card.id,
    reviewId:reviewNumber,runVersion:run!.version,actionNo:reviewNumber+10};
   receipts.set(body.p_operation_id,receipt);
   if(options.loseGradeAck&&gradeRequests.length===1)return route.abort('connectionreset');
   return reply(receipt);
  }
  if(table==='review_runs'){
   const found=selected(visibleRuns()).filter(run=>!url.searchParams.has('status')||['running','paused'].includes(run.status));
   return rows(found.slice(0,Number(url.searchParams.get('limit')??found.length)));
  }
  if(table==='review_run_items')return rows(selected(visibleRuns().flatMap(run=>run.items.map(item=>({...item,run_id:run.id})))));
  if(table==='cards'){
   if(url.searchParams.get('select')?.includes('notes!inner'))return reply([]);
   const found=selected(records.map(row=>row.card).filter(card=>card.user_id===session.user.id));
   if(url.searchParams.has('id'))exactReads.push(...found.map(card=>card.id));
   return rows(found);
  }
  if(table==='notes')return rows(selected(records.filter(row=>row.card.user_id===session.user.id).map(row=>({id:row.card.note_id,
   no:row.no,user_id:row.card.user_id,project_id:row.projectId,checkpoint_id:row.checkpointId,session_id:null,source_id:null,
   front:row.front,back:row.back,type:'basic',kind:'other',tags:[],status:'active',origin:'user',page_label:null}))));
  if(table==='projects')return rows(selected([{id:pathId,user_id:ownerId,slug:'topology',title:'Topology',status:'active'},
   {id:id(11),user_id:ownerId,slug:'algebra',title:'Algebra',status:'active'}].filter(row=>row.user_id===session.user.id)));
  if(table==='checkpoints')return rows(selected([{id:checkpointId,user_id:ownerId,code:'CP1'},{id:id(21),user_id:ownerId,code:'CP2'}]));
  if(request.method()!=='GET'&&request.method()!=='HEAD'&&!table.startsWith('rpc/'))throw Error('Unexpected fixture mutation '+table);
  return reply([]);
 });
 return {ownerId,otherOwner,pathId,checkpointId,conceptId,records,runs,gradeRequests,startRequests,exactReads,
  reviewCount:()=>reviewNumber,
  async switchOwner(nextOwner:string){
   session=authSession(nextOwner);
   await page.evaluate(({authKey,session})=>{
    localStorage.setItem(authKey,JSON.stringify(session));
    const channel=new BroadcastChannel(authKey);channel.postMessage({event:'SIGNED_IN',session});channel.close();
   },{authKey,session});
  }};
}

test('one signed-in due card starts from Review, grades once and stays complete after reload',async({page})=>{
 const fixture=await reviewFixture(page,{count:1});await page.clock.setFixedTime(NOW);await page.goto(live('/review'));
 await expect(page.getByLabel('Cards in this round')).toHaveText('1');
 await page.getByRole('button',{name:'Start review, 1 card',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('1 of 1');
 await expect(page.getByRole('article',{name:'Review card'})).toContainText('Topology question 1');
 await page.keyboard.press('Space');await expect(page.getByText('Answer 1',{exact:true})).toBeVisible();await page.keyboard.press('3');
 await expect(page.getByRole('heading',{name:'Round complete'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Round complete'})).toBeVisible();
 expect(fixture.startRequests).toHaveLength(1);expect(fixture.gradeRequests).toHaveLength(1);expect(fixture.reviewCount()).toBe(1);
 expect(fixture.runs[0]).toMatchObject({position:1,status:'exhausted'});expect(fixture.records[0].card.reps).toBe(4);
});

test('reloading before the first grade request reaches the server saves the selected grade once',async({page})=>{
 const fixture=await reviewFixture(page,{count:1});
 await page.clock.setFixedTime(NOW);
 await page.goto(live('/review/run?target=path&id='+fixture.pathId));
 await page.getByRole('button',{name:/Show answer/}).click();

 // Hold the account check that precedes the grade RPC until the original document unloads.
 const ownerUrl='**/auth/v1/user';
 let releaseOwnerCheck!:()=>void;
 const ownerCheck=new Promise<void>(resolve=>{releaseOwnerCheck=resolve;});
 await page.route(ownerUrl,async route=>{await ownerCheck;await route.fallback();},{times:1});
 const checkingOwner=page.waitForRequest(ownerUrl);
 try{
  await page.getByRole('button',{name:/^Good/}).click();
  await checkingOwner;
  await expect(page.getByRole('button',{name:'Retry grade confirmation'})).toHaveCount(0);
  await expect(page.getByText('Confirming your grade…',{exact:true})).toBeVisible();
  expect(fixture.gradeRequests).toHaveLength(0);
  await page.reload({waitUntil:'commit'});
 }finally{releaseOwnerCheck();}

 await expect(page.getByText('Round saved. 1 graded; 0 skipped.',{exact:true})).toBeVisible();
 expect(fixture.gradeRequests).toHaveLength(1);
 expect(fixture.gradeRequests[0]).toMatchObject({p_rating:3,p_item:fixture.runs[0].items[0].id});
 expect(fixture.reviewCount()).toBe(1);
 expect(fixture.records[0].card.reps).toBe(4);
});

test('a signed-in paused 23-card round resumes at the second item and retains progress through reload',async({page})=>{
 const fixture=await reviewFixture(page,{count:23,paused:true});await page.clock.setFixedTime(NOW);await page.goto(live('/review'));
 await page.getByRole('button',{name:'Resume · 2 of 23',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('2 of 23');
 await expect(page.getByRole('article',{name:'Review card'})).toContainText('Topology question 2');
 await page.getByRole('button',{name:/Show answer/}).click();await page.getByRole('button',{name:/^Good/}).click();
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('3 of 23');
 await page.reload();await expect(page.getByRole('article',{name:'Review card'})).toContainText('Topology question 3');
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuenow','2');
 expect(fixture.runs[0].items[0]).toMatchObject({state:'graded',review_id:1});
 expect(fixture.runs[0].items[1]).toMatchObject({state:'graded',review_id:2});
 expect(fixture.gradeRequests).toHaveLength(1);expect(fixture.reviewCount()).toBe(2);
});

for(const [kind,label,count] of [['checkpoint','Compactness checkpoint',4],['concept','Compactness concept',9],['path','Topology',23]] as const)
 test('signed-in '+kind+' review keeps its named membership while another path is due',async({page})=>{
  const fixture=await reviewFixture(page,{count:23,otherPath:true});await page.clock.setFixedTime(NOW);
  const target=kind==='path'?fixture.pathId:kind==='checkpoint'?fixture.checkpointId:fixture.conceptId;
  await page.goto(live('/review/run?target='+kind+'&id='+target));
  await expect(page.getByText(label,{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('1 of '+count);
  await expect(page.getByRole('article',{name:'Review card'})).toContainText('Topology question 1');
  await page.getByRole('button',{name:/Show answer/}).click();await page.getByRole('button',{name:/^Good/}).click();
  await page.reload();
  await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('2 of '+count);
  await expect(page.getByRole('article',{name:'Review card'})).toContainText('Topology question 2');
  const snapshot=fixture.runs[0];expect(snapshot.items).toHaveLength(count);
  const members=fixture.records.filter(row=>(kind==='path'?row.projectId:kind==='checkpoint'?row.checkpointId:row.conceptId)===target).map(row=>row.card.id);
  expect(snapshot.items.map(item=>item.card_id)).toEqual(members);
  expect(fixture.exactReads.every(card=>members.includes(card))).toBe(true);
  expect(fixture.records.at(-1)!.card.reps).toBe(3);
 });

test('90 signed-in future cards show their next date without offering an empty first-card flow',async({page})=>{
 const fixture=await reviewFixture(page,{count:90,future:true});await page.clock.setFixedTime(NOW);await page.goto(live('/review'));
 await expect(page.getByText('Nothing due',{exact:true})).toBeVisible();
 await expect(page.locator('time[datetime="'+fixture.records[0].card.due.slice(0,10)+'"]')).toBeVisible();
 await expect(page.getByText(/Next review ·.*90 cards/)).toBeVisible();
 await expect(page.getByRole('link',{name:'Practice instead',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Start review/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Create (your first card|a path and card)/})).toHaveCount(0);
 await expect(page.getByRole('link',{name:/Create (your first card|a path and card)/})).toHaveCount(0);
 await page.reload();await expect(page.getByText(/Next review ·.*90 cards/)).toBeVisible();
 expect(fixture.startRequests).toHaveLength(0);expect(fixture.gradeRequests).toHaveLength(0);
});

test('an empty signed-in target stays empty instead of opening cards from another scope',async({page})=>{
 const fixture=await reviewFixture(page,{count:1,otherPath:true});await page.clock.setFixedTime(NOW);
 await page.goto(live('/review/run?target=checkpoint&id='+id(99)));
 await expect(page.getByRole('alert')).toHaveText('There are no eligible cards in this review selection.');
 await expect(page.getByRole('article',{name:'Review card'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Show answer/})).toHaveCount(0);
 expect(fixture.runs).toHaveLength(0);expect(fixture.gradeRequests).toHaveLength(0);
});

test('a scoped link cannot resume an unrelated round before its release capability is available',async({page})=>{
 const fixture=await reviewFixture(page,{count:23,paused:true,otherPath:true,released:false});
 fixture.runs[0].status='running';await page.clock.setFixedTime(NOW);
 await page.goto(live('/review/run?target=path&id='+id(11)));
 await expect(page.getByRole('alert')).toHaveText('This review selection is not available yet. Reconnect and try again.');
 await expect(page.getByRole('article',{name:'Review card'})).toHaveCount(0);
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveCount(0);
 expect(fixture.startRequests).toHaveLength(0);expect(fixture.gradeRequests).toHaveLength(0);
});

test('changing signed-in scopes opens a separate frozen round and leaves the prior checkpoint intact',async({page})=>{
 const fixture=await reviewFixture(page,{count:23,otherPath:true});await page.clock.setFixedTime(NOW);
 await page.goto(live('/review/run?target=checkpoint&id='+fixture.checkpointId));
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('1 of 4');
 await page.getByRole('button',{name:/Show answer/}).click();await page.getByRole('button',{name:/^Good/}).click();
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('2 of 4');
 const first=fixture.runs[0],members=first.items.map(item=>item.card_id);
 await page.getByRole('button',{name:'Leave',exact:true}).click();
 await expect(page.getByRole('main',{name:'Review',exact:true})).toBeVisible();
 await page.evaluate(hash=>{window.location.hash=hash;},'/review/run?target=path&id='+id(11));
 await expect(page.getByText('Algebra',{exact:true})).toBeVisible();
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveText('1 of 1');
 await expect(page.getByRole('article',{name:'Review card'})).toContainText('Other path question 24');
 expect(fixture.runs).toHaveLength(2);expect(first).toMatchObject({position:1,status:'paused'});
 expect(first.items.map(item=>item.card_id)).toEqual(members);
 expect(fixture.runs[1].items[0].card_id).toBe(fixture.records.at(-1)!.card.id);
});

test('an account switch hides an uncertain grade and only its original owner can replay it',async({page})=>{
 const fixture=await reviewFixture(page,{count:1,loseGradeAck:true});await page.clock.setFixedTime(NOW);
 await page.goto(live('/review/run?target=path&id='+fixture.pathId));
 await page.getByRole('button',{name:/Show answer/}).click();await page.getByRole('button',{name:/^Good/}).click();
 await expect(page.getByRole('button',{name:'Retry grade confirmation'})).toBeVisible();
 const operation=fixture.gradeRequests[0],run=fixture.runs[0];
 await fixture.switchOwner(fixture.otherOwner);
 await expect(page.getByRole('heading',{name:'No review in progress'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry grade confirmation'})).toHaveCount(0);
 await expect(page.getByText('Topology question 1',{exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'No review in progress'})).toBeVisible();
 expect(fixture.gradeRequests).toHaveLength(1);
 await fixture.switchOwner(fixture.ownerId);
 await expect(page.getByText('Round saved. 1 graded; 0 skipped.',{exact:true})).toBeVisible();
 expect(fixture.gradeRequests).toEqual([operation,operation]);expect(fixture.reviewCount()).toBe(1);
 expect(run.items[0]).toMatchObject({state:'graded',review_id:1});expect(fixture.records[0].card.reps).toBe(4);
});
