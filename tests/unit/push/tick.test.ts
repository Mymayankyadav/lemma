import {describe,expect,it,vi} from 'vitest';
import {createNoticeAdapters,handleAction,runNoticeTick,sendRow,type NoticeDb,type NoticeRow,type WebDevice,type NoticeOptions} from '../../../supabase/functions/push/tick';
import {verifyActionToken} from '../../../supabase/functions/notify/action-token';
import type {Sender,SendResult} from '../../../supabase/functions/push/fcm';
import type {NoticeFacts} from '../../../supabase/functions/push/notice';

// N164.1: the reminder tick with a fake database and a fake FCM sender.
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const NOW=Date.UTC(2026,10,14,14,0,0);
const facts=(count=34):NoticeFacts=>({tz:'Asia/Kolkata',today:'2026-11-14',studiedToday:false,live:false,due:{count,backlog:count,minutes:12},
 history:{sentToday:0,lastSentAt:null,lastByKey:{},dismissStreak:{}}});
const SECRET='k'.repeat(48);
function setup(opts:{owners?:string[];facts?:NoticeFacts;claimed?:NoticeRow[];tokens?:{id:string;token:string}[];results?:SendResult[];devices?:WebDevice[]}={}){
 const queued:{user:string;rows:unknown[]}[]=[],recorded:[string,number,string][]=[],deleted:string[]=[],webRecorded:[string,string][]=[],sent:{token:string;data:Record<string,string>;options?:unknown}[]=[];
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
  webDevices:vi.fn(async()=>opts.devices??[]),
  webRecord:vi.fn(async(_user,id,result)=>{webRecorded.push([id,result]);}),
 };
 const sender:Sender={send:async(token,data,options)=>{sent.push({token,data,options});return results.shift()??'sent';}};
 return {db,sender,queued,recorded,deleted,sent,webRecorded};
}
const row=(over:Partial<NoticeRow>={}):NoticeRow=>({id:7,kind:'due',title:'34 cards due',body:'About 12 min. Start with 5?',url:'#/review',...over});

describe('N164.1 reminder tick',()=>{
 it('queues what the rules decide to send, then delivers the claimed rows over FCM',async()=>{
  const s=setup({claimed:[row()]});
  const summary=await runNoticeTick(s.db,s.sender,NOW);
  expect(summary).toMatchObject({owners:1,queued:1,sent:1,failed:0,timedOut:false});
  expect(s.queued).toEqual([{user:A,rows:[{kind:'due',key:'due:2026-11-14',title:'34 cards due',body:expect.stringContaining('12 min'),url:'#/review',facts:{actions:[{action:'open',title:'Start review',url:'#/review'},{action:'later',title:'Later'}]}}]}]);
  expect(s.sent[0]).toEqual({token:'tok-1',data:{type:'notice',ownerId:A,id:'7',kind:'due',title:'34 cards due',body:'About 12 min. Start with 5?',url:'#/review'},options:{collapseKey:'notice-7',ttlSeconds:21600}}); // no secret: no signed buttons
  expect(s.recorded).toEqual([[A,7,'sent']]);
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

const rowWith=(actions:unknown[],over:Partial<NoticeRow>={}):NoticeRow=>({...row(over),facts:{actions:actions as never}});
describe('N164 action buttons',()=>{
 it('sends a link for open and a signed, single-purpose token for anything else, at most two',async()=>{
  const s=setup({tokens:[{id:'t1',token:'tok-1'}]});
  const r=rowWith([{action:'open',title:'Start review',url:'#/review'},{action:'later',title:'Later'},{action:'not_today',title:'Not today'}]);
  expect(await sendRow(s.db,s.sender,A,r,{secret:SECRET,now:()=>NOW})).toEqual({ok:true});
  const actions=JSON.parse(s.sent[0].data.actions) as {action:string;title:string;url?:string;token?:string}[];
  expect(actions.map(a=>a.action)).toEqual(['open','later']);
  expect(actions[0]).toEqual({action:'open',title:'Start review',url:'#/review'});
  const payload=await verifyActionToken(actions[1].token!,SECRET,Math.floor(NOW/1000));
  expect(payload).toMatchObject({u:A,n:7,a:'later'});
  expect(payload.exp).toBeLessThanOrEqual(Math.floor(NOW/1000)+48*3600);
  await expect(verifyActionToken(actions[1].token!,'z'.repeat(48),Math.floor(NOW/1000))).rejects.toThrow(/signature/);
 });
 it('carries the cards an approval covers, and leaves the buttons out when it cannot sign',async()=>{
  const ids=['aaaaaaaa-aaaa-4aaa-8aaa-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-000000000002'];
  const s=setup();
  await sendRow(s.db,s.sender,A,rowWith([{action:'approve_cards',title:'Approve 2 cards',x:{ids}},{action:'open',title:'Review',url:'#/proposals'}],{kind:'tutor'}),{secret:SECRET,now:()=>NOW});
  const approve=JSON.parse(s.sent[0].data.actions)[0];
  expect((await verifyActionToken(approve.token,SECRET,Math.floor(NOW/1000))).x).toEqual({ids});
  const unsigned=setup();
  await sendRow(unsigned.db,unsigned.sender,A,rowWith([{action:'later',title:'Later'},{action:'open',title:'Review',url:'#/proposals'}]),{secret:'short',now:()=>NOW});
  expect(JSON.parse(unsigned.sent[0].data.actions)).toEqual([{action:'open',title:'Review',url:'#/proposals'}]);
 });
});

const DEVICE:WebDevice={id:'d1',subscription:{endpoint:'https://push.example.com/abc',keys:{p256dh:'AAAA',auth:'BBBB'}},failures:1};
const VAPID={publicKey:'p',privateKey:'q',subject:'mailto:a@example.com'};
describe('N164 Web Push for an owner with no phone',()=>{
 it('sends to the browser with the same notice and records the result, only when there is no phone',async()=>{
  const calls:{payload:Record<string,unknown>;kind:string;tag:string;priorFailures?:number}[]=[];
  const webPush:NoticeOptions['webPush']=async request=>{calls.push(request as never);return {status:'sent',httpStatus:201};};
  const s=setup({tokens:[],devices:[DEVICE]});
  const r=rowWith([{action:'open',title:'Start review',url:'#/review'},{action:'later',title:'Later'}]);
  expect(await sendRow(s.db,s.sender,A,r,{secret:SECRET,vapid:VAPID,webPush,now:()=>NOW})).toEqual({ok:true});
  expect(s.sent).toHaveLength(0);
  expect(s.webRecorded).toEqual([['d1','sent']]);
  expect(calls[0]).toMatchObject({kind:'due',tag:'due',priorFailures:1,payload:{v:1,id:7,kind:'due',tag:'due',title:'34 cards due',url:'#/review',ts:NOW}});
  expect((calls[0].payload.actions as unknown[]).length).toBe(2);
  // An owner with both a phone and a browser gets only the phone.
  const both=setup({tokens:[{id:'t1',token:'tok-1'}],devices:[DEVICE]});
  await sendRow(both.db,both.sender,A,r,{secret:SECRET,vapid:VAPID,webPush,now:()=>NOW});
  expect(both.sent).toHaveLength(1);expect(calls).toHaveLength(1);expect(both.webRecorded).toEqual([]);
 });
 it('fails with no_device when there is no browser or no VAPID key, and push_error when the browser refuses',async()=>{
  const none=setup({tokens:[],devices:[]});
  expect(await sendRow(none.db,none.sender,A,row(),{vapid:VAPID})).toEqual({ok:false,reason:'no_device'});
  const noKey=setup({tokens:[],devices:[DEVICE]});
  expect(await sendRow(noKey.db,noKey.sender,A,row(),{})).toEqual({ok:false,reason:'no_device'});
  const gone=setup({tokens:[],devices:[DEVICE]});
  expect(await sendRow(gone.db,gone.sender,A,row(),{vapid:VAPID,webPush:async()=>({status:'gone',httpStatus:410})})).toEqual({ok:false,reason:'push_error'});
  expect(gone.webRecorded).toEqual([['d1','gone']]);
  const boom=setup({tokens:[],devices:[DEVICE]});
  expect(await sendRow(boom.db,boom.sender,A,row(),{vapid:VAPID,webPush:async()=>{throw new Error('x');}})).toEqual({ok:false,reason:'push_error'});
 });
});

describe('N164 the action route',()=>{
 const tokenFor=async(a:string,x?:object,n=7,exp=Math.floor(NOW/1000)+3600)=>{
  const {signActionToken}=await import('../../../supabase/functions/notify/action-token');
  return signActionToken({u:A,n,a:a as never,exp,...(x?{x:x as never}:{})},SECRET,Math.floor(NOW/1000));
 };
 const deps=(over:Partial<Parameters<typeof handleAction>[1]>={})=>{
  const acts:unknown[][]=[],confirms:unknown[]=[];
  return {acts,confirms,deps:{secret:SECRET,now:()=>NOW,act:vi.fn(async(...args:unknown[])=>{acts.push(args);return {status:'done',kind:'due'} as Record<string,unknown>;}),confirm:vi.fn(async(...args:unknown[])=>{confirms.push(args);}),...over} as Parameters<typeof handleAction>[1]};
 };
 it('runs the one action the token names, for the owner it names',async()=>{
  const d=deps();
  expect(await handleAction({token:await tokenFor('later')},d.deps)).toEqual({status:200,body:{status:'done'}});
  expect(d.acts).toEqual([[A,7,'later',{}]]);
  const approve=deps({act:vi.fn(async()=>({status:'done',kind:'tutor',confirmId:99,action:5,approved:['x'],skipped:[]}))});
  const ids=['aaaaaaaa-aaaa-4aaa-8aaa-000000000001'];
  expect((await handleAction({token:await tokenFor('approve_cards',{ids})},approve.deps)).status).toBe(200);
  expect(approve.deps.act).toHaveBeenCalledWith(A,7,'approve_cards',{ids});
  expect(approve.confirms).toHaveLength(1);
 });
 it('says already done for a used notification, and refuses a bad, forged, expired or refused action',async()=>{
  expect(await handleAction({token:await tokenFor('later')},deps({act:vi.fn(async()=>({status:'already_done'}))}).deps)).toEqual({status:200,body:{status:'already_done'}});
  expect((await handleAction({token:'x'},deps().deps)).status).toBe(400);
  expect((await handleAction({token:await tokenFor('later'),extra:1},deps().deps)).status).toBe(400);
  expect((await handleAction(null,deps().deps)).status).toBe(400);
  const forged=(await tokenFor('later')).replace(/.$/,c=>c==='A'?'B':'A');
  expect((await handleAction({token:forged},deps().deps)).status).toBe(401);
  const expired=await tokenFor('later',undefined,7,Math.floor(NOW/1000)+60);
  expect((await handleAction({token:expired},deps({now:()=>NOW+3600_000}).deps)).status).toBe(410);
  expect((await handleAction({token:await tokenFor('later')},deps({act:vi.fn(async()=>{throw new Error('bad_action');})}).deps)).status).toBe(400);
  expect((await handleAction({token:await tokenFor('later')},deps({secret:'short'}).deps)).status).toBe(503);
 });
 it('still answers when the confirmation cannot be sent',async()=>{
  const d=deps({act:vi.fn(async()=>({status:'done',confirmId:3})),confirm:vi.fn(async()=>{throw new Error('fcm down');})});
  expect((await handleAction({token:await tokenFor('approve_cards',{ids:['aaaaaaaa-aaaa-4aaa-8aaa-000000000001']})},d.deps)).status).toBe(200);
 });
});

