import {beforeEach,expect,it,vi} from 'vitest';
import {FunctionsHttpError,FunctionsRelayError} from '@supabase/supabase-js';
const state=vi.hoisted(()=>({generation:1,mode:'live',invoke:vi.fn()}));
vi.mock('../../../src/data/authBoundary',()=>({authGeneration:()=>state.generation}));
vi.mock('../../../src/data/mode',()=>({getMode:()=>state.mode}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({functions:{invoke:state.invoke}})}));
import {openPracticeQuestion,savePracticeResult} from '../../../src/data/adaptive/agenda-api';
import {PracticeScoreRejectedError,type PracticeScoreRequest} from '../../../supabase/functions/_shared/practice/delivery';
const requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const request:PracticeScoreRequest={operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestId,learnerConfirmed:true,
  outcome:{result:'fail',hintLevel:2,novelty:'familiar'}};
const receipt={status:'ok',operationId:request.operationId,requestId,attemptId:'9007199254740994',actionNo:7};
const sessionRequest:PracticeScoreRequest={...request,outcome:{...request.outcome,sessionId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}};
const rejection={status:'rejected',code:'practice_session_unavailable',operationId:request.operationId,requestId};
beforeEach(()=>{state.generation=1;state.mode='live';state.invoke.mockReset();});

it('does not issue an old account action after the asynchronous client import crosses an auth boundary',async()=>{
  const open=openPracticeQuestion(requestId);state.generation++;
  await expect(open).rejects.toThrow('account changed');expect(state.invoke).not.toHaveBeenCalled();
  const score=savePracticeResult(request);state.generation++;
  await expect(score).rejects.toThrow('account changed');expect(state.invoke).not.toHaveBeenCalled();
});

it('uses the exact operation ID and outcome for retries without sending an owner, item, or timestamp',async()=>{
  state.invoke.mockResolvedValueOnce({data:null,error:{message:'lost reply'}}).mockResolvedValueOnce({data:receipt,error:null});
  await expect(savePracticeResult(request)).rejects.toThrow('could not be confirmed');
  expect(await savePracticeResult(request)).toEqual(receipt);
  expect(state.invoke).toHaveBeenCalledTimes(2);
  for(const args of state.invoke.mock.calls)expect(args).toEqual(['mcp/practice-result',{
    method:'POST',body:request,headers:{'Idempotency-Key':request.operationId}}]);
});

it('does not surface a stale score response after switching accounts during the request',async()=>{
  let finish:(value:unknown)=>void=()=>{};
  state.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const saving=savePracticeResult(request);
  await vi.waitFor(()=>expect(state.invoke).toHaveBeenCalledTimes(1));
  state.generation++;finish({data:receipt,error:null});
  await expect(saving).rejects.toThrow('account changed');
});

it('unlocks only a known session rejection with the correct HTTP status and both request bindings',async()=>{
  state.invoke.mockResolvedValueOnce({data:null,error:new FunctionsHttpError(Response.json(rejection,{status:409}))});
  const rejected=await savePracticeResult(sessionRequest).catch(error=>error);
  expect(rejected).toBeInstanceOf(PracticeScoreRejectedError);expect(rejected.rejection).toEqual(rejection);
  for(const error of [new FunctionsHttpError(Response.json(rejection,{status:503})),
    new FunctionsRelayError(Response.json(rejection,{status:409})),
    new FunctionsHttpError(Response.json({...rejection,operationId:requestId},{status:409})),
    new FunctionsHttpError(Response.json({...rejection,requestId:request.operationId},{status:409})),
    new FunctionsHttpError(Response.json({...rejection,code:'other_failure'},{status:409})),
    new FunctionsHttpError(Response.json({...rejection,internal:'unexpected'},{status:409})),
    new FunctionsHttpError(new Response('unreadable',{status:409}))]){
    state.invoke.mockResolvedValueOnce({data:null,error});
    const uncertain=await savePracticeResult(sessionRequest).catch(error=>error);
    expect(uncertain).not.toBeInstanceOf(PracticeScoreRejectedError);expect(uncertain.message).toMatch(/could not be confirmed/);
  }
  state.invoke.mockResolvedValueOnce({data:null,error:new FunctionsHttpError(Response.json(rejection,{status:409}))});
  expect(await savePracticeResult(request).catch(error=>error)).not.toBeInstanceOf(PracticeScoreRejectedError);
});

it('checks the account again after reading an asynchronous rejection body',async()=>{
  let finish:(value:unknown)=>void=()=>{};
  const response=Response.json(rejection,{status:409});
  const reading=vi.spyOn(response,'json').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  state.invoke.mockResolvedValueOnce({data:null,error:new FunctionsHttpError(response)});
  const saving=savePracticeResult(sessionRequest);
  await vi.waitFor(()=>expect(reading).toHaveBeenCalledOnce());
  state.generation++;finish(rejection);
  await expect(saving).rejects.toThrow('account changed');
});

it('rejects malformed or mismatched delivery receipts and never calls a live service from demo mode',async()=>{
  state.invoke.mockResolvedValueOnce({data:{status:'available',requestId:request.operationId,question:'Wrong receipt',itemId:'x',itemVersion:1},error:null});
  await expect(openPracticeQuestion(requestId)).rejects.toThrow('temporarily unavailable');
  state.invoke.mockClear();state.mode='demo';
  await expect(openPracticeQuestion(requestId)).rejects.toThrow('signed-in');
  await expect(savePracticeResult(request)).rejects.toThrow('signed-in');
  expect(state.invoke).not.toHaveBeenCalled();
});
