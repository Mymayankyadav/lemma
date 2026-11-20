import {expect,it,vi} from 'vitest';
import {browserPracticeResult} from '../../../supabase/functions/mcp/agenda-http';
import {recordPractice} from '../../../supabase/functions/mcp/agenda';
import {study} from '../../../supabase/functions/mcp/tools/study';
import {PracticeScoreRejectedError,validPracticeScore,type PracticeScoreRequest} from '../../../supabase/functions/_shared/practice/delivery';
import type {Context} from '../../../supabase/functions/mcp/db';

const owner='11111111-1111-4111-8111-111111111111';
const request:PracticeScoreRequest={operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  learnerConfirmed:true,outcome:{result:'ok',hintLevel:0,novelty:'novel'}};
const receipt={status:'ok' as const,operationId:request.operationId,requestId:request.requestId,attemptId:'42',actionNo:7};
const sessionRequest:PracticeScoreRequest={...request,outcome:{...request.outcome,sessionId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}};
const rejection={status:'rejected' as const,code:'practice_session_unavailable' as const,operationId:request.operationId,requestId:request.requestId};
const sessionError={code:'42501',message:'Practice session outside owner/project or not open yet'};
const fixture=()=>{const rpc=vi.fn().mockResolvedValue({data:receipt,error:null});return {rpc,c:{userId:owner,db:{rpc}} as unknown as Context};};

it('records exactly the learner-confirmed outcome under the verified owner and preserves the receipt on retry',async()=>{
  const {c,rpc}=fixture();
  expect(await recordPractice(c,request)).toBe(receipt);
  expect(await recordPractice(c,request)).toBe(receipt);
  expect(rpc).toHaveBeenCalledTimes(2);
  for(const call of rpc.mock.calls)expect(call).toEqual(['lemma_record_practice',{p_owner:owner,p_operation:request.operationId,
    p_request:request.requestId,p_outcome:request.outcome,p_source:'app'}]);
  // Follow-up is accepted after a release rollback. Scoring does not re-enroll or re-run the selector.
  expect(rpc.mock.calls.some(([name])=>name==='lemma_plan_released')).toBe(false);
});

it('rejects inferred scores, owner/item injection and malformed outcome fields before the database',async()=>{
  const {c,rpc}=fixture();
  const invalid=[{...request,learnerConfirmed:false},{...request,learnerConfirmed:undefined},{...request,userId:'other'},
    {...request,outcome:{...request.outcome,itemId:'other'}},{...request,outcome:{...request.outcome,practice_request_id:request.requestId}},
    {...request,outcome:{...request.outcome,result:'pass'}},{...request,outcome:{...request.outcome,hintLevel:-1}},
    {...request,outcome:{...request.outcome,hintLevel:1.5}},{...request,outcome:{...request.outcome,hintLevel:5}},
    {...request,outcome:{...request.outcome,novelty:'guess'}},{...request,outcome:{...request.outcome,minutes:Infinity}},
    {...request,outcome:{...request.outcome,sessionId:'other'}},{...request,operationId:'not-a-uuid'}];
  for(const value of invalid){expect(validPracticeScore(value)).toBe(false);await expect(recordPractice(c,value as PracticeScoreRequest)).rejects.toThrow(/learner-confirmed/);}
  expect(rpc).not.toHaveBeenCalled();
});

it('never claims a score was saved after a server error or mismatched receipt',async()=>{
  const {c,rpc}=fixture();
  rpc.mockResolvedValueOnce({data:null,error:{message:'Practice outcome already recorded'}});
  await expect(recordPractice(c,request)).rejects.toThrow('Practice outcome already recorded');
  rpc.mockResolvedValueOnce({data:{...receipt,requestId:owner},error:null});
  await expect(recordPractice(c,request)).rejects.toThrow('could not be confirmed');
});

it('only identifies the exact pre-write session validation error as a definite rejection',async()=>{
  const {c,rpc}=fixture();
  rpc.mockResolvedValueOnce({data:null,error:sessionError});
  const rejected=await recordPractice(c,sessionRequest).catch(error=>error);
  expect(rejected).toBeInstanceOf(PracticeScoreRejectedError);expect(rejected.rejection).toEqual(rejection);
  for(const error of [{message:sessionError.message},{...sessionError,code:'P0001'},
    {...sessionError,message:'Question delivery not found'}, {...sessionError,message:sessionError.message+' (retry)'}]){
    rpc.mockResolvedValueOnce({data:null,error});
    expect(await recordPractice(c,sessionRequest).catch(error=>error)).not.toBeInstanceOf(PracticeScoreRejectedError);
  }
  rpc.mockResolvedValueOnce({data:null,error:sessionError});
  expect(await recordPractice(c,request).catch(error=>error)).not.toBeInstanceOf(PracticeScoreRejectedError);
});

it('the MCP score command requires a separate explicit learner assessment and binds its target to the delivery',async()=>{
  const {c,rpc}=fixture();
  const command={operationId:request.operationId,schemaVersion:1 as const,resource:'practice_questions',operation:'score',
    target:{id:request.requestId},patch:{...request.outcome,learnerConfirmed:true}};
  expect(await study(c,{command,client:'chatgpt'})).toBe(receipt);
  expect(rpc).toHaveBeenCalledWith('lemma_record_practice',{p_owner:owner,p_operation:request.operationId,p_request:request.requestId,p_outcome:request.outcome,p_source:'chatgpt'});
  rpc.mockClear();
  for(const invalid of [{...command,expectedVersion:1},{...command,patch:{...request.outcome}},
    {...command,target:{id:request.requestId,owner}},{...command,patch:{...command.patch,itemId:owner}}])
    await expect(study(c,{command:invalid})).rejects.toThrow(/learner|assessment/);
  expect(rpc).not.toHaveBeenCalled();
});

it('the browser score route authenticates the owner, bounds its body, and rejects caller state or missing confirmation',async()=>{
  const url='https://example.invalid/functions/v1/mcp/practice-result';
  const headers={Authorization:'Bearer session.token','Idempotency-Key':request.operationId,'Content-Type':'application/json'};
  const auth={verify:vi.fn(async()=>owner),record:vi.fn(async()=>receipt)};
  const req=(body:unknown,extra:RequestInit={})=>new Request(url,{method:'POST',headers,body:JSON.stringify(body),...extra});
  for(const bad of [{...request,userId:'other'},{...request,learnerConfirmed:false},null])
    expect((await browserPracticeResult(req(bad),auth,{})).status).toBe(400);
  expect((await browserPracticeResult(req(request,{headers:{...headers,'Idempotency-Key':owner}}),auth,{})).status).toBe(400);
  expect((await browserPracticeResult(req(request,{headers:{'Idempotency-Key':request.operationId}}),auth,{})).status).toBe(401);
  expect((await browserPracticeResult(req({large:'x'.repeat(2050)}),auth,{})).status).toBe(413);
  expect(auth.record).not.toHaveBeenCalled();
  const response=await browserPracticeResult(req(request),auth,{});
  expect(await response.json()).toEqual(receipt);expect(response.headers.get('cache-control')).toContain('no-store');
  expect(auth.record).toHaveBeenCalledWith(owner,request);
  auth.verify.mockResolvedValueOnce(null as never);
  expect((await browserPracticeResult(req(request),auth,{})).status).toBe(401);
  expect(auth.record).toHaveBeenCalledTimes(1);
});

it('returns a bounded operation-bound 409 for a rejected session and keeps other failures uncertain',async()=>{
  const {c,rpc}=fixture();
  const req=()=>new Request('https://example.invalid/functions/v1/mcp/practice-result',{method:'POST',
    headers:{Authorization:'Bearer session.token','Idempotency-Key':request.operationId,'Content-Type':'application/json'},body:JSON.stringify(sessionRequest)});
  const auth={verify:vi.fn(async()=>owner),record:vi.fn(async(_owner:string,score:PracticeScoreRequest)=>recordPractice(c,score))};
  rpc.mockResolvedValueOnce({data:null,error:sessionError});
  const response=await browserPracticeResult(req(),auth,{});
  expect(response.status).toBe(409);expect(await response.json()).toEqual(rejection);
  expect(response.headers.get('cache-control')).toContain('no-store');
  rpc.mockResolvedValueOnce({data:null,error:{code:'42501',message:'Internal owner validation failed'}});
  const ambiguous=await browserPracticeResult(req(),auth,{});
  expect(ambiguous.status).toBe(503);expect(await ambiguous.json()).toEqual({error:'The saved result could not be confirmed. Retry the same result.'});
  auth.record.mockRejectedValueOnce(new PracticeScoreRejectedError({...rejection,operationId:owner}));
  expect((await browserPracticeResult(req(),auth,{})).status).toBe(503);
});
