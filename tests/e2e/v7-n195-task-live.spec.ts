import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test.use({timezoneId:'Asia/Kolkata',viewport:{width:390,height:844},reducedMotion:'reduce'});
const owner='11111111-1111-4111-8111-111111111111';
const taskId='22222222-2222-4222-8222-222222222222';
const busyId='33333333-3333-4333-8333-333333333333';
const planId='44444444-4444-4444-8444-444444444444';
const itemId='55555555-5555-4555-8555-555555555555';
const blockId='66666666-6666-4666-8666-666666666666';
const day='2026-11-10',zone='Asia/Kolkata';
const settings={desired_retention:.9,new_per_day:20,reviews_per_day:200,learn_steps:'1m 10m',relearn_steps:'10m',
 rollover_hour:4,max_interval_days:36500,fuzz:false,load_balance:false,learn_ahead_minutes:20,macros:'',
 default_style:'socratic',mix_decks:true,preferred_chat:'claude',time_zone:zone,ui:{},version:1};
const row={id:taskId,user_id:owner,title:'Check the gluing argument',body:'',priority:'normal',position:1,
 status:'backlog',estimate_minutes:25,due_kind:'none',version:1,created_at:NOW.toISOString(),updated_at:NOW.toISOString()};
const protectedBlock={id:busyId,user_id:owner,kind:'busy',status:'planned',title:'Colloquium',starts_at:'2026-11-10T08:30:00Z',
 ends_at:'2026-11-10T09:30:00Z',time_zone:zone,version:1};
const liveRoute=(path:string)=>at(path).replace('demo=1','demo=0').replace('flags=','flags=uiRepairV1,');
async function session(page:Page){
 const expires=Math.floor(Date.now()/1000)+7200;
 const user={id:owner,email:'planner@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:NOW.toISOString()};
 const token=[{alg:'HS256',typ:'JWT'},{sub:owner,role:'authenticated',aud:'authenticated',exp:expires}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.local';
 await page.addInitScript(({user,token,expires})=>localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',
  JSON.stringify({user,access_token:token,refresh_token:'local',token_type:'bearer',expires_in:7200,expires_at:expires})),{user,token,expires});
 await page.route('**/auth/v1/**',r=>r.fulfill({json:user}));
}

// Bounded PostgREST fixture for UI readback. tests/mcp/sql/planner-commit.mjs runs the real SQL and undo_action.
test('Signed-in Calendar refreshes its placed row after the action-number Undo',async({page})=>{
 await session(page);await page.clock.setFixedTime(NOW);
 let plan:Record<string,unknown>|null=null,placed:Record<string,unknown>|null=null;
 let commits=0,undos=0;
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/rest/v1/')[1];
  const reply=(json:unknown)=>route.fulfill({json});
  const rows=(records:unknown[])=>req.method()==='HEAD'
   ?route.fulfill({status:200,headers:{'content-range':'*/'+records.length,'access-control-expose-headers':'Content-Range'},body:''})
   :reply(req.headers().accept?.includes('vnd.pgrst.object')?records[0]??null:records);
  if(table==='rpc/lemma_plan_released')return reply(true);
  if(table==='rpc/bootstrap'||table==='settings')return reply(settings);
  if(table==='rpc/home_summary')return reply({projects:[],current:null,proposals:0,activeSession:null});
  if(table==='rpc/home_review_outlook')return reply({decks:[],forecast:[]});
  if(table==='tasks')return rows([row]);
  if(table==='calendar_blocks')return rows(placed?[protectedBlock,placed]:[protectedBlock]);
  if(table==='day_plans')return rows(plan?[plan]:[]);
  if(table==='rpc/day_plans_command'){
   const p=req.postDataJSON().p;
   expect(p).toMatchObject({operation:'commit_placements',patch:{days:[{plan_date:day,time_zone:zone,placements:[{task_id:taskId,title:row.title}]}]}});
   expect(p.patch.days[0].sources).toEqual(expect.arrayContaining([
    {resource:'tasks',id:taskId,version:1},{resource:'calendar_blocks',id:busyId,version:1}]));
   expect(commits++).toBe(0);
   const {starts_at,ends_at}=p.patch.days[0].placements[0];
   placed={id:blockId,user_id:owner,kind:'study',task_id:taskId,title:row.title,status:'planned',version:1,time_zone:zone,starts_at,ends_at};
   plan={id:planId,user_id:owner,plan_date:day,time_zone:zone,intention:'',capacity_minutes:25,availability:{sources:p.patch.days[0].sources},
    status:'committed',ritual:{},version:1,created_at:NOW.toISOString(),updated_at:NOW.toISOString()};
   return reply({status:'ok',actionNo:17,changed:[{resource:'day_plans',id:planId,version:1},{resource:'day_plan_items',id:itemId,version:1},
    {resource:'calendar_blocks',id:blockId,version:1}],plans:[plan],blockIds:[blockId]});
  }
  if(table==='rpc/undo_action'){
   expect(req.postDataJSON()).toEqual({p_user:owner,p_no:17});expect(plan).not.toBeNull();
   placed=null;plan=null;undos++;return reply({undone:17});
  }
  if(req.method()!=='GET'&&req.method()!=='HEAD'&&!table.startsWith('rpc/'))throw Error('Unexpected fixture mutation '+table);
  return rows([]);
 });
 await page.goto(liveRoute('/calendar?view=day&date='+day+'&plan=1'));
 const planner=page.getByRole('dialog',{name:'Plan study tasks'});
 await planner.getByRole('button',{name:'Add 1 block'}).click();
 const block=page.getByRole('button',{name:/Check the gluing argument, Planned study/});
 const original=page.getByRole('button',{name:/Colloquium, Busy/});
 await expect(block).toBeVisible();await expect(original).toBeVisible();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(block).toHaveCount(0);
 await expect(original).toBeVisible();
 await expect(page.getByText('Removed the planned blocks',{exact:true})).toBeVisible();
 expect({commits,undos}).toEqual({commits:1,undos:1});
});

test('Signed-in task creation recovers a lost acknowledgement using the original operation and exact owner-local due',async({page})=>{
 await session(page);await page.clock.setFixedTime(new Date('2026-11-09T20:00:00Z'));
 let saved:Record<string,unknown>|null=null;
 const envelopes:unknown[]=[];
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/rest/v1/')[1];
  const reply=(json:unknown)=>route.fulfill({json});
  if(table==='rpc/lemma_plan_released')return reply(true);
  if(table==='rpc/bootstrap'||table==='settings')return reply(settings);
  if(table==='rpc/home_summary')return reply({projects:[],current:null,proposals:0,activeSession:null});
  if(table==='rpc/home_review_outlook')return reply({decks:[],forecast:[]});
  if(table==='rpc/task_command'){
   const p=req.postDataJSON().p;
   expect(p).toMatchObject({operation:'create',patch:{title:'Owner midnight task',due_kind:'instant',due_at:'2026-11-10T10:40:00.000Z'}});
   envelopes.push(p);
   if(envelopes.length===1){
    saved={...row,...p.patch};
    return route.abort('connectionreset');
   }
   expect(p).toEqual(envelopes[0]);
   return reply({status:'ok',actionNo:19,changed:[{resource:'tasks',id:taskId,version:1}]});
  }
  if(table==='tasks'){
   if(req.method()==='HEAD')return route.fulfill({headers:{'content-range':'*/'+(saved?1:0),'access-control-expose-headers':'Content-Range'},body:''});
   return reply(req.headers().accept?.includes('vnd.pgrst.object')?saved:saved?[saved]:[]);
  }
  if(req.method()!=='GET'&&req.method()!=='HEAD'&&!table.startsWith('rpc/'))throw Error('Unexpected fixture mutation '+table);
  return reply([]);
 });
 await page.goto(liveRoute('/tasks?new=1'));
 const editor=page.getByRole('dialog',{name:'New task'});
 await editor.getByLabel('Title',{exact:true}).fill('Owner midnight task');
 await editor.getByRole('radio',{name:'Date & time'}).click();
 await editor.getByRole('button',{name:/^Due time,/}).click();
 const picker=page.getByRole('dialog',{name:'Due time'});
 await picker.getByLabel('Time (HH:MM)').fill('16:10');
 await picker.getByRole('button',{name:'Use time'}).click();
 await editor.getByRole('button',{name:'Save task'}).click();
 await expect(editor.getByRole('alert')).toContainText('Your changes are still here');
 await expect(editor.getByLabel('Title',{exact:true})).toHaveValue('Owner midnight task');
 await editor.getByRole('button',{name:'Save task'}).click();
 await expect(page.getByRole('checkbox',{name:'Complete Owner midnight task'})).toBeVisible();
 expect(envelopes).toHaveLength(2);
 await page.reload();
 await expect(page.getByRole('checkbox',{name:'Complete Owner midnight task'})).toHaveCount(1);
});
