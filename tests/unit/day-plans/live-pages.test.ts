import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';

const PLAN='11111111-1111-4111-8111-111111111111';
const at='2026-11-07T09:00:00Z';
const ident=(n:number)=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');
const planRow=(n:number)=>{
 const planDate=new Date(Date.UTC(2020,0,n+1)).toISOString().slice(0,10);
 return {id:ident(n+1),user_id:'owner-hidden',plan_date:planDate,
  time_zone:'UTC',intention:'Plan '+n,capacity_minutes:20,availability:{sources:[]},
  status:'draft',closed_at:null,tomorrow_first_task_id:null,ritual:{},
  version:1,created_at:at,updated_at:at};
};
let plans=Array.from({length:53},(_,i)=>planRow(i));
let items=Array.from({length:52},(_,i)=>({
 id:ident(i+100),plan_id:PLAN,task_id:ident(i+200),
 calendar_block_id:null,disposition:'unplaced',reason:'No slot',
 position:i,version:1,
}));
type R=Record<string,unknown>;
let trace:Array<{table:string;fields:string[];clauses:string[];size:number}>=[];
function query(table:string){
 const fields:string[]=[],clauses:string[]=[];
 let fromDay:string|null=null,throughDay:string|null=null;
 let planId:string|null=null,afterDate:[string,string]|null=null;
 let afterPosition:[number,string]|null=null,allowed:string[]|null=null;
 const results=():R[]=>{
  const source=(table==='day_plans'?plans:items) as R[];
  return source.filter(r=>{
   if(fromDay&&String(r.plan_date)<fromDay)return false;
   if(throughDay&&String(r.plan_date)>throughDay)return false;
   if(planId&&r.plan_id!==planId)return false;
   if(allowed&&!allowed.includes(String(r.status)))return false;
   if(afterDate){
    const [date,id]=afterDate;
    if(String(r.plan_date)<date||
      (String(r.plan_date)===date&&String(r.id)<=id))return false;
   }
   if(afterPosition){
    const [position,id]=afterPosition;
    if(Number(r.position)<position||
      (Number(r.position)===position&&String(r.id)<=id))return false;
   }
   return true;
  }).sort((a,b)=>table==='day_plans'?
   String(a.plan_date).localeCompare(String(b.plan_date))||
    String(a.id).localeCompare(String(b.id)):
   Number(a.position)-Number(b.position)||
    String(a.id).localeCompare(String(b.id)));
 };
 const chain={
  select:(s:string,_opts?:unknown)=>{fields.push(s);return chain},
  gte:(_col:string,value:string)=>{fromDay=value;clauses.push('gte');return chain},
  lte:(_col:string,value:string)=>{throughDay=value;clauses.push('lte');return chain},
  eq:(_col:string,value:string)=>{planId=value;clauses.push('eq');return chain},
  in:(_col:string,value:string[])=>{allowed=value;clauses.push('in');return chain},
  or:(expr:string)=>{
   clauses.push('or');
   const day=/^plan_date\.gt\.([^,]+),and\(plan_date\.eq\.([^,]+),id\.gt\.([^)]+)\)$/.exec(expr);
   const position=/^position\.gt\.([^,]+),and\(position\.eq\.([^,]+),id\.gt\.([^)]+)\)$/.exec(expr);
   if(day&&day[1]===day[2])afterDate=[day[1],day[3]];
   else if(position&&position[1]===position[2])afterPosition=[Number(position[1]),position[3]];
   else throw Error('Unexpected keyset query '+expr);
   return chain;
  },
  order:(_col:string,_opts?:unknown)=>chain,
  range:async(from:number,to:number)=>{
   trace.push({table,fields:[...fields],clauses:[...clauses],size:to-from+1});
   return {data:results().slice(from,to+1),error:null};
  },
  then:<T>(resolve:(value:{count:number;error:null})=>T)=>{
   trace.push({table,fields:[...fields],clauses:[...clauses],size:0});
   return Promise.resolve({count:results().length,error:null}).then(resolve);
  },
 };
 return chain;
}
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:(table:string)=>query(table)}),
}));
beforeEach(()=>{
 plans=Array.from({length:53},(_,i)=>planRow(i));
 items=Array.from({length:52},(_,i)=>({
 id:ident(i+100),plan_id:PLAN,task_id:ident(i+200),
 calendar_block_id:null,disposition:'unplaced',reason:'No slot',position:i,version:1,
 }));
 trace=[];
});
describe('N60.2 live owner-RLS bounded keyset reads',()=>{
 it('reads exact plan totals and returns disjoint pages of at most 50',async()=>{
  const api=createLiveDayPlanApi();
  const first=await api.listPlans({limit:50,status:['draft']});
  expect(first.total).toBe(53);
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).toBeTruthy();
  const second=await api.listPlans({limit:50,status:['draft'],cursor:first.nextCursor});
  expect(second.total).toBe(53);
  expect(second.items).toHaveLength(3);
  expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(53);
  expect(trace.filter(x=>x.size>0).map(x=>x.size)).toEqual([51,51]);
  expect(trace.every(x=>!x.clauses.includes('ownerId'))).toBe(true);
  await expect(api.listPlans({cursor:first.nextCursor,status:['closed']}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
 });
 it('pages item dispositions with exact total and a plan-bound cursor',async()=>{
  const api=createLiveDayPlanApi();
  const first=await api.listItems(PLAN,{limit:50});
  expect(first.total).toBe(52);
  expect(first.items).toHaveLength(50);
  expect(first.items.every(x=>x.disposition==='unplaced'&&x.reason==='No slot')).toBe(true);
  const second=await api.listItems(PLAN,{limit:50,cursor:first.nextCursor});
  expect(second.items.map(x=>x.position)).toEqual([50,51]);
  expect(second.total).toBe(52);
  expect(trace.filter(x=>x.table==='day_plan_items'&&x.size===0)
   .every(x=>x.clauses.includes('eq'))).toBe(true);
  await expect(api.listItems(ident(900),{cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
 });
});
