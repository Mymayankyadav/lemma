import {describe,expect,it} from 'vitest';
import {handlePush,type OutboxRow,type PushDb} from '../../../supabase/functions/push/handler';
import type {Sender,SendResult} from '../../../supabase/functions/push/fcm';
import type {EntryRow,IntervalRow} from '../../../supabase/functions/_shared/timerState';

// N163: draining the outbox, with a fake database and a fake FCM sender.
const SECRET='s'.repeat(40),NOW=Date.UTC(2026,10,14,10,0,0);
const entry=(over:Partial<EntryRow>={}):EntryRow=>({id:'e1',version:7,status:'running',intent:'Algebra',mode:'open',phase:'focus',cycle:1,config:{},phase_ends_at:null,project_id:'p1',...over});
const focus:IntervalRow[]=[{kind:'focus',started_at:new Date(NOW-600_000).toISOString(),ended_at:null}];
const row=(id:number,over:Partial<OutboxRow>={}):OutboxRow=>({id,user_id:'u1',entry_id:'e1',entry_version:id,attempts:1,...over});
function setup(opts:{rows?:OutboxRow[];entry?:EntryRow|null;tokens?:{id:string;token:string}[];results?:SendResult[];fail?:boolean}={}){
 const finished:{ids:number[];status:string}[]=[],deleted:string[]=[],sent:{token:string;data:Record<string,string>;options?:unknown}[]=[];
 const results=[...(opts.results??['sent'])];
 const db:PushDb={
  claim:async()=>{if(opts.fail)throw new Error('db down');return opts.rows??[row(1)];},
  entry:async()=>opts.entry===undefined?entry():opts.entry,
  intervals:async()=>focus,
  context:async()=>({title:'Algebra 1',clock24h:true}),
  tokens:async()=>opts.tokens??[{id:'t1',token:'tok-1'}],
  deleteToken:async id=>{deleted.push(id);},
  finish:async(ids,status)=>{finished.push({ids,status});},
 };
 const sender:Sender={send:async(token,data,options)=>{sent.push({token,data,options});return results.shift()??'sent';}};
 const run=(request:{method:string;secret:string|null}={method:'POST',secret:SECRET},secret=SECRET)=>handlePush(request,{db,sender,secret,now:()=>NOW});
 return {run,finished,deleted,sent};
}
describe('N163 push handler',()=>{
 it('answers only the database: POST with the shared secret',async()=>{
  const s=setup();
  expect((await s.run({method:'GET',secret:SECRET})).status).toBe(405);
  expect((await s.run({method:'POST',secret:null})).status).toBe(401);
  expect((await s.run({method:'POST',secret:'x'.repeat(40)})).status).toBe(401);
  expect((await s.run({method:'POST',secret:'short'},'short')).status).toBe(503);
  expect(s.sent.length+s.finished.length).toBe(0);
 });
 it('sends the running timer to every registered phone and marks the rows sent',async()=>{
  const s=setup({tokens:[{id:'t1',token:'tok-1'},{id:'t2',token:'tok-2'}]});
  const result=await s.run();
  expect(result).toEqual({status:200,body:{sent:1,skipped:0,failed:0,retry:0}});
  expect(s.sent.map(x=>x.token)).toEqual(['tok-1','tok-2']);
  const data=s.sent[0].data;
  expect(data).toMatchObject({type:'timer',op:'show',entryId:'e1',version:'7'});
  expect(JSON.parse(data.state)).toMatchObject({entryId:'e1',status:'running',intention:'Algebra',context:'Algebra 1',focusedMs:600000,asOf:NOW});
  expect(s.sent[0].options).toEqual({collapseKey:'timer',ttlSeconds:60});
  expect(s.finished).toEqual([{ids:[1],status:'sent'}]);
 });
 it('clears the phone when the entry is saved, discarded or gone',async()=>{
  for(const e of [entry({status:'saved',version:9}),null]){
   const s=setup({entry:e,rows:[row(3,{entry_version:5})]});
   await s.run();
   expect(s.sent[0].data).toEqual({type:'timer',op:'clear',entryId:'e1',version:String(e?9:5)});
  }
 });
 it('sends one message for several quick changes to one entry',async()=>{
  const s=setup({rows:[row(1),row(2),row(3),row(4,{entry_id:'e2'})]});
  await s.run();
  expect(s.sent.map(x=>x.data.entryId)).toEqual(['e1','e2']);
  expect(s.finished).toEqual([{ids:[1,2,3],status:'sent'},{ids:[4],status:'sent'}]);
 });
 it('skips an owner with no registered phone, and a row with no entry',async()=>{
  const none=setup({tokens:[]});await none.run();
  expect(none.sent.length).toBe(0);expect(none.finished).toEqual([{ids:[1],status:'skipped'}]);
  const blank=setup({rows:[row(1,{entry_id:null})]});await blank.run();
  expect(blank.finished).toEqual([{ids:[1],status:'skipped'}]);
 });
 it('removes a token FCM no longer knows and still counts the others',async()=>{
  const s=setup({tokens:[{id:'t1',token:'tok-1'},{id:'t2',token:'tok-2'}],results:['gone','sent']});
  await s.run();
  expect(s.deleted).toEqual(['t1']);expect(s.finished).toEqual([{ids:[1],status:'sent'}]);
 });
 it('leaves a row for the next try when every send needs a retry, and gives up after three attempts',async()=>{
  const again=setup({results:['retry']});
  expect((await again.run()).body).toMatchObject({retry:1,failed:0});expect(again.finished).toEqual([]);
  const spent=setup({rows:[row(1,{attempts:3})],results:['retry']});
  expect((await spent.run()).body).toMatchObject({retry:0,failed:1});expect(spent.finished).toEqual([{ids:[1],status:'failed'}]);
  const bad=setup({results:['failed']});await bad.run();
  expect(bad.finished).toEqual([{ids:[1],status:'failed'}]);
 });
 it('never throws for one entry: a read error leaves it for a retry',async()=>{
  const s=setup();
  const db=(s as unknown as {run:unknown});void db;
  const broken=handlePush({method:'POST',secret:SECRET},{db:{...({} as PushDb),claim:async()=>[row(1)],tokens:async()=>{throw new Error('boom');},finish:async()=>{}},sender:{send:async()=>'sent'},secret:SECRET,now:()=>NOW});
  expect((await broken).body).toMatchObject({retry:1});
 });
});
