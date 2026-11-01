import {beforeEach,describe,expect,it,vi} from 'vitest';
import {handlePreviewRequest,type PreviewDeps,type PreviewCandidate} from '../../../supabase/functions/notify/preview-handler';

const owner='123e4567-e89b-42d3-a456-426614174000';
const now=Date.UTC(2026,10,1,12,0);
const context={
 now,timeZone:'Asia/Kolkata',quietStart:'22:30',quietEnd:'07:30',
 mode:'as-happens' as const,dailyCap:3,sendsToday:0,
};
const candidates:PreviewCandidate[]=[
 {kind:'due',key:'due:2026-11-01',cardsDue:23,threshold:10,
  title:'23 cards due',body:'Start with five?',why:'threshold 10'},
 {kind:'tutor',key:'tutor:2026-11-01',hasSummary:true,
  title:'Tutor left $\\mathbb R$',body:'Open $x^2$',why:'new proposal'},
];
const verifyJwt=vi.fn(),load=vi.fn();
const deps:PreviewDeps={configured:true,verifyJwt,load};
beforeEach(()=>{
 verifyJwt.mockReset().mockResolvedValue({id:owner});
 load.mockReset().mockResolvedValue({ownerId:owner,context,candidates});
});
describe('NOTIF-4b4 owner-authenticated read-only preview',()=>{
 it('requires verified JWT before reading any owner data',async()=>{
  for(const authorization of [null,'','Basic token','Bearer','Bearer x y']){
   expect((await handlePreviewRequest(authorization,deps)).status).toBe(401);
  }
  verifyJwt.mockResolvedValueOnce(null);
  expect((await handlePreviewRequest('Bearer signed',deps)).status).toBe(401);
  verifyJwt.mockRejectedValueOnce(Error('sensitive JWT'));
  expect((await handlePreviewRequest('Bearer signed',deps)).status).toBe(401);
  expect(load).not.toHaveBeenCalled();
 });
 it('uses exactly one owner-bound read, real rules, local time and sanitized copy',async()=>{
  const result=await handlePreviewRequest('Bearer signed.jwt',deps);
  expect(result.status).toBe(200);
  expect(verifyJwt).toHaveBeenCalledWith('signed.jwt');
  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith(owner);
  const body=result.body as Record<string,unknown>;
  expect(body.send).toEqual([{
   time:'17:30',kind:'tutor',title:'Tutor left ℝ',body:'Open x²',why:'new proposal',
  }]);
  expect(body.held).toEqual([{
   time:'17:30',kind:'due',title:'23 cards due',body:'Start with five?',why:'spacing',
  }]);
  expect(body.omitted).toBe(0);
 });
 it('does not fabricate sends during quiet hours or while reminders are off',async()=>{
  load.mockResolvedValueOnce({ownerId:owner,context:{...context,now:Date.UTC(2026,10,1,18,0)},candidates});
  const quiet=await handlePreviewRequest('Bearer signed',deps);
  expect((quiet.body as Record<string,unknown>).send).toEqual([]);
  expect(((quiet.body as Record<string,unknown>).held as Array<{why:string}>).every(r=>r.why==='quiet hours')).toBe(true);
  load.mockResolvedValueOnce({ownerId:owner,context:{...context,mode:'off'},candidates});
  const off=await handlePreviewRequest('Bearer signed',deps);
  expect((off.body as Record<string,unknown>).send).toEqual([]);
 });
 it('caps preview rows to twenty, disclosing omitted count',async()=>{
  const many=Array.from({length:100},(_,i)=>({
   kind:'due' as const,key:'due:'+i,cardsDue:23,threshold:10,
   title:'Due '+i,body:'Start?',why:'threshold 10',
  }));
  load.mockResolvedValueOnce({ownerId:owner,context,candidates:many});
  const result=await handlePreviewRequest('Bearer signed',deps);
  const body=result.body as {send:unknown[];held:unknown[];omitted:number};
  expect(body.send.length+body.held.length).toBe(20);
  expect(body.omitted).toBe(80);
 });
 it('fails closed on absent configuration or owner read errors without leaking details',async()=>{
  expect(await handlePreviewRequest('Bearer signed',{...deps,configured:false}))
   .toEqual({status:503,body:{message:'Reminders are not set up yet'}});
  expect(verifyJwt).not.toHaveBeenCalled();
  load.mockRejectedValueOnce(Error('private owner SQL data'));
  const result=await handlePreviewRequest('Bearer signed',deps);
  expect(result).toEqual({status:503,body:{message:'Could not preview reminders'}});
  expect(JSON.stringify(result)).not.toMatch(/private|SQL data/i);
 });
 it('returns an empty preview when there are no candidates',async()=>{
  load.mockResolvedValueOnce({ownerId:owner,context,candidates:[]});
  expect(await handlePreviewRequest('Bearer signed',deps)).toEqual({
   status:200,body:{send:[],held:[],omitted:0},
  });
 });
 it('does not expose malformed owner time-zone configuration',async()=>{
  load.mockResolvedValueOnce({ownerId:owner,context:{...context,timeZone:'Not/AZone'},candidates});
  expect(await handlePreviewRequest('Bearer signed',deps))
   .toEqual({status:503,body:{message:'Could not preview reminders'}});
 });
 it('rejects a cross-owner snapshot even if an adapter accidentally returns it',async()=>{
  load.mockResolvedValueOnce({ownerId:'123e4567-e89b-42d3-a456-426614174009',context,candidates});
  expect(await handlePreviewRequest('Bearer signed',deps))
   .toEqual({status:503,body:{message:'Could not preview reminders'}});
 });
 it('omits resolved conditions instead of presenting them as held reminders',async()=>{
  const resolved:PreviewCandidate={kind:'due',key:'due:resolved',cardsDue:0,threshold:10,
   title:'0 cards due',body:'No cards due',why:'threshold 10'};
  load.mockResolvedValueOnce({ownerId:owner,context,candidates:[resolved,...candidates]});
  const result=await handlePreviewRequest('Bearer signed',deps);
  expect(result.status).toBe(200);
  const body=result.body as {send:Array<{title:string}>;held:Array<{title:string}>;omitted:number};
  expect([...body.send,...body.held].map(row=>row.title)).not.toContain('0 cards due');
  expect(body.omitted).toBe(0);
 });

 it('labels a future reminder as not yet due, not a frequency-limit suppression',async()=>{
  const future:PreviewCandidate={kind:'due',key:'due:future',dueAt:now+30*60*1000,
   cardsDue:23,threshold:10,title:'23 cards due',body:'Review later',why:'threshold 10'};
  load.mockResolvedValueOnce({ownerId:owner,context,candidates:[future]});
  const result=await handlePreviewRequest('Bearer signed',deps);
  expect(result.status).toBe(200);
  expect((result.body as {held:Array<{time:string;why:string}>}).held)
   .toEqual([{time:'18:00',kind:'due',title:'23 cards due',body:'Review later',why:'not yet due'}]);
 });

});
