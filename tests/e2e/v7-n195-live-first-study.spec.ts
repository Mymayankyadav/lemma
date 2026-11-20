import {expect,test} from '@playwright/test';
import {at} from './v7-scenes';

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
 await page.reload();
 await expect.poll(()=>graded.length).toBe(2);
 await expect(page.getByText(/Round saved. 1 graded/)).toBeVisible();
 expect(created).toHaveLength(2);expect(graded[1]).toEqual(graded[0]);
});
