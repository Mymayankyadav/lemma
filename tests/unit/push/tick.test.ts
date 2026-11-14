import {describe,expect,it,vi} from 'vitest';
import {createNoticeAdapters,runNoticeTick,type NoticeDb,type NoticeRow} from '../../../supabase/functions/push/tick';
import type {Sender,SendResult} from '../../../supabase/functions/push/fcm';
import type {NoticeFacts} from '../../../supabase/functions/push/notice';

// N164.1: the reminder tick with a fake database and a fake FCM sender.
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const NOW=Date.UTC(2026,10,14,14,0,0);
const facts=(count=34):NoticeFacts=>({tz:'Asia/Kolkata',today:'2026-11-14',studiedToday:false,live:false,due:{count,backlog:count,minutes:12},
 history:{sentToday:0,lastSentAt:null,lastByKey:{},dismissStreak:{}}});
function setup(opts:{owners?:string[];facts?:NoticeFacts;claimed?:NoticeRow[];tokens?:{id:string;token:string}[];results?:SendResult[]}={}){
 const queued:{user:string;rows:unknown[]}[]=[],recorded:[string,number,string][]=[],deleted:string[]=[],sent:{token:string;data:Record<string,string>;options?:unknown}[]=[];
 const results=[...(opts.results??['sent'])];
 const db:NoticeDb={
  owners:vi.fn(async()=>opts.owners??[A]),
  facts:vi.fn(async()=>opts.facts??facts()),
  prefs:vi.fn(async()=>({enabled:true,studyTime:'19:00',quiet:{start:'22:30',end:'07:30'},kinds:{due:true}})),
  queue:vi.fn(async(user,rows)=>{queued.push({user,rows});return rows.length;}),
  claim:vi.fn(async()=>opts.claimed??[]),
  record:vi.fn(async(user,id,reason)=>{recorded.push([user,id,reason]);}),
  tokens:vi.fn(async()=>opts.tokens??[{id:'t1',token:'tok-1'}]),
  deleteToken:vi.fn(async id=>{deleted.push(id);}),
 };
 const sender:Sender={send:async(token,data,options)=>{sent.push({token,data,options});return results.shift()??'sent';}};
 return {db,sender,queued,recorded,deleted,sent};
}
const row=(over:Partial<NoticeRow>={}):NoticeRow=>({id:7,kind:'due',title:'34 cards due',body:'About 12 min. Start with 5?',url:'#/review',...over});

describe('N164.1 reminder tick',()=>{
 it('queues what the rules decide to send, then delivers the claimed rows over FCM',async()=>{
  const s=setup({claimed:[row()]});
  const summary=await runNoticeTick(s.db,s.sender,NOW);
  expect(summary).toMatchObject({owners:1,queued:1,sent:1,failed:0,timedOut:false});
  expect(s.queued).toEqual([{user:A,rows:[{kind:'due',key:'due:2026-11-14',title:'34 cards due',body:expect.stringContaining('12 min'),url:'#/review'}]}]);
  expect(s.sent[0]).toEqual({token:'tok-1',data:{type:'notice',id:'7',kind:'due',title:'34 cards due',body:'About 12 min. Start with 5?',url:'#/review'},options:{collapseKey:'notice-7',ttlSeconds:21600}});
  expect(s.recorded).toEqual([]);
 });
 it('queues nothing when the rules defer, suppress or skip',async()=>{
  const few=setup({facts:facts(3)});
  await runNoticeTick(few.db,few.sender,NOW);
  expect(few.queued).toEqual([]);
  expect(few.db.queue).not.toHaveBeenCalled();
 });
 it('still delivers rows queued elsewhere (a test or a confirmation) when nothing new is decided',async()=>{
  const s=setup({facts:facts(3),claimed:[row({id:9,kind:'test',title:'Reminders are on',body:'Lemma will write at most 3 times a day.',url:'#/settings'})]});
  const summary=await runNoticeTick(s.db,s.sender,NOW);
  expect(summary).toMatchObject({queued:0,sent:1});
  expect(s.sent[0].data).toMatchObject({type:'notice',kind:'test',id:'9'});
 });
 it('sends one message to every registered phone, removes a token FCM no longer knows, and counts the row sent if any phone got it',async()=>{
  const s=setup({claimed:[row()],tokens:[{id:'t1',token:'tok-1'},{id:'t2',token:'tok-2'}],results:['gone','sent']});
  const summary=await runNoticeTick(s.db,s.sender,NOW);
  expect(s.sent.map(x=>x.token)).toEqual(['tok-1','tok-2']);
  expect(s.deleted).toEqual(['t1']);
  expect(summary).toMatchObject({sent:1,failed:0});
 });
 it('records a failure when the owner has no phone or every send failed, and sends a digest with a longer life',async()=>{
  const none=setup({claimed:[row()],tokens:[]});
  expect(await runNoticeTick(none.db,none.sender,NOW)).toMatchObject({sent:0,failed:1});
  expect(none.recorded).toEqual([[A,7,'no_device']]);
  const bad=setup({claimed:[row()],results:['retry']});
  expect(await runNoticeTick(bad.db,bad.sender,NOW)).toMatchObject({sent:0,failed:1});
  expect(bad.recorded).toEqual([[A,7,'push_error']]);
  const digest=setup({claimed:[row({kind:'digest'})]});
  await runNoticeTick(digest.db,digest.sender,NOW);
  expect(digest.sent[0].options).toEqual({collapseKey:'notice-7',ttlSeconds:86400});
 });
 it('keeps one owner from stopping another, and never throws',async()=>{
  const s=setup({owners:[A,B]});
  vi.mocked(s.db.facts).mockRejectedValueOnce(new Error('boom'));
  const summary=await runNoticeTick(s.db,s.sender,NOW);
  expect(summary).toMatchObject({owners:2,failed:1});
  expect(s.queued.map(q=>q.user)).toEqual([B]);
 });
 it('uses the adapters of the existing tick core',()=>{
  const adapters=createNoticeAdapters(setup().db,setup().sender);
  expect(Object.keys(adapters).sort()).toEqual(['deliver','listEnabledOwners','load','queue']);
 });
});
