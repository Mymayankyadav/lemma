import {describe,it,expect} from 'vitest';
import {assertReviewAdvance,assertReviewInstant,assertReviewUuid,
 assertReviewVersion,canAdvanceReviewRun,canTransitionReviewRun,
 encodeReviewRunCursor,validateReviewRunDraft,validateReviewRunItem,
 validateReviewRunQuery,validateReviewRunRecord} from '../../../src/data/review-runs/model';
import type {ReviewRunItemRecord,ReviewRunRecord} from '../../../src/data/review-runs/contract';
const id=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const at='2026-11-07T08:00:00Z';
const run=(patch:Partial<ReviewRunRecord>={}):ReviewRunRecord=>({
 id:id(1),filters:{state:['due']},selectedDeckIds:['project:proofs','cp:proofs:CP1'],
 cardBudget:20,minuteBudget:30,schedulerVersion:'fsrs-5',settingsVersion:2,
 status:'running',position:0,revealed:false,startedAt:at,pausedAt:null,endedAt:null,
 version:1,source:'app',createdAt:at,updatedAt:at,...patch
});
const item=(patch:Partial<ReviewRunItemRecord>={}):ReviewRunItemRecord=>({
 id:id(2),runId:id(1),position:0,cardId:id(3),expectedCardVersion:8,
 state:'pending',reviewId:null,staleReason:null,version:1,source:'app',
 createdAt:at,updatedAt:at,...patch
});
const invalid=(runAction:()=>unknown)=>expect(runAction).toThrowError();
describe('N62.1 durable review run contract and pure invariants',()=>{
 it('accepts application deck keys instead of incorrectly requiring UUIDs',()=>{
  const input={schedulerVersion:'fsrs-5',settingsVersion:3,
   selectedDeckIds:['project:proofs','cp:proofs:CP1'],filters:{kind:'due'}};
  expect(validateReviewRunDraft(input)).toMatchObject({...input,cardBudget:20,minuteBudget:20});
  expect(validateReviewRunRecord(run()).selectedDeckIds).toEqual(input.selectedDeckIds);
 });
 it('clones user-owned input fields and rejects caller owner/provenance injection',()=>{
  const input={schedulerVersion:'fsrs-5',settingsVersion:1,filters:{state:['due']}};
  const dto=validateReviewRunDraft(input);
  (input.filters.state as string[]).push('tampered');
  expect(dto.filters).toEqual({state:['due']});
  invalid(()=>validateReviewRunDraft({...input,userId:id(4)} as never));
  invalid(()=>validateReviewRunDraft({...input,filters:{scope:{user_id:id(4)}}}));
  invalid(()=>validateReviewRunDraft({...input,filters:{source:NaN}}));
  invalid(()=>validateReviewRunDraft({...input,filters:{x:()=>1}}));
  invalid(()=>validateReviewRunDraft({...input,filters:[]} as never));
 });
 it('validates SQL-shaped budgets, scheduler/settings versions and deck keys',()=>{
  const valid={schedulerVersion:'fsrs-5',settingsVersion:1};
  for(const n of [-1,2001,1.5,NaN])
   invalid(()=>validateReviewRunDraft({...valid,cardBudget:n}));
  for(const n of [-1,1441,1.5])
   invalid(()=>validateReviewRunDraft({...valid,minuteBudget:n}));
  for(const n of [0,-1,2147483648,1.5])
   invalid(()=>validateReviewRunDraft({...valid,settingsVersion:n}));
  invalid(()=>validateReviewRunDraft({...valid,schedulerVersion:'  '}));
  invalid(()=>validateReviewRunDraft({...valid,schedulerVersion:'x'.repeat(81)}));
  invalid(()=>validateReviewRunDraft({...valid,selectedDeckIds:['']}));
  invalid(()=>validateReviewRunDraft({...valid,selectedDeckIds:['  ']}));
  invalid(()=>validateReviewRunDraft({...valid,selectedDeckIds:['x'.repeat(181)]}));
  invalid(()=>validateReviewRunDraft({...valid,selectedDeckIds:Array(257).fill('project:proofs')}));
  invalid(()=>validateReviewRunDraft({...valid,selectedDeckIds:['project:proofs','project:proofs']}));
  invalid(()=>validateReviewRunDraft({...valid,filters:{large:'😀'.repeat(2300)}}));
 });
 it('rejects calendar rollover, naive timestamps, SQL infinity and invalid UUIDs',()=>{
  expect(assertReviewInstant('2026-11-07T13:30:00+05:30')).toBe('2026-11-07T13:30:00+05:30');
  for(const value of ['2026-02-30T08:00:00Z','2026-11-07T08:00:00','infinity',
    '2026-11-07','2026-11-07T08:00:00+25:00'])
   invalid(()=>assertReviewInstant(value));
  invalid(()=>assertReviewUuid('not-a-uuid'));
  invalid(()=>assertReviewVersion(0));
  invalid(()=>assertReviewVersion(2147483648));
  expect(assertReviewVersion(2147483647)).toBe(2147483647);
 });
 it('matches SQL pause and terminal time consistency',()=>{
  expect(validateReviewRunRecord(run())).toMatchObject({status:'running'});
  expect(validateReviewRunRecord(run({status:'paused',pausedAt:'2026-11-07T08:20:00Z'})).status)
   .toBe('paused');
  expect(validateReviewRunRecord(run({status:'completed',endedAt:'2026-11-07T08:25:00Z'})).status)
   .toBe('completed');
  invalid(()=>validateReviewRunRecord(run({status:'paused'})));
  invalid(()=>validateReviewRunRecord(run({status:'running',pausedAt:at})));
  invalid(()=>validateReviewRunRecord(run({status:'completed'})));
  invalid(()=>validateReviewRunRecord(run({status:'abandoned',endedAt:'2026-11-07T07:00:00Z'})));
  invalid(()=>validateReviewRunRecord(run({position:-1})));
 });
 it('rejects improper graded/stale references and preserves bigint IDs losslessly',()=>{
  expect(validateReviewRunItem(item())).toMatchObject({state:'pending'});
  expect(validateReviewRunItem(item({state:'graded',reviewId:'9223372036854775807'})).reviewId)
   .toBe('9223372036854775807');
  expect(validateReviewRunItem(item({state:'stale',staleReason:'Card version changed'})).state)
   .toBe('stale');
  invalid(()=>validateReviewRunItem(item({state:'graded'})));
  invalid(()=>validateReviewRunItem(item({state:'pending',reviewId:'12'})));
  invalid(()=>validateReviewRunItem(item({state:'stale'})));
  invalid(()=>validateReviewRunItem(item({state:'graded',reviewId:'9223372036854775808'})));
  invalid(()=>validateReviewRunItem(item({state:'graded',reviewId:'0'})));
  invalid(()=>validateReviewRunItem(item({state:'stale',staleReason:' '})));
  invalid(()=>validateReviewRunItem(item({expectedCardVersion:0})));
 });
 it('links existing grade receipts only; never grades or advances stale/cross-run items',()=>{
  expect(canAdvanceReviewRun(run(),item())).toBe(true);
  expect(canAdvanceReviewRun(run({status:'paused',pausedAt:at}),item())).toBe(false);
  expect(canAdvanceReviewRun(run(),item({position:1}))).toBe(false);
  expect(canAdvanceReviewRun(run(),item({runId:id(5)}))).toBe(false);
  expect(canAdvanceReviewRun(run(),item({state:'graded',reviewId:'73'}))).toBe(false);
  expect(canAdvanceReviewRun(run(),item({state:'stale',staleReason:'Changed'}))).toBe(false);
  expect(assertReviewAdvance({kind:'graded',itemId:id(2),reviewId:'73'}))
   .toEqual({kind:'graded',itemId:id(2),reviewId:'73'});
  expect(assertReviewAdvance({kind:'stale',itemId:id(2),reason:' changed '}))
   .toEqual({kind:'stale',itemId:id(2),reason:'changed'});
  invalid(()=>assertReviewAdvance({kind:'graded',itemId:id(2),reviewId:'0'}));
  invalid(()=>assertReviewAdvance({kind:'stale',itemId:id(2),reason:' '}));
  invalid(()=>assertReviewAdvance({kind:'graded',itemId:id(2),reviewId:'73',user_id:id(4)} as never));
 });
 it('disallows terminal review-run resumption and repeated lifecycle transitions',()=>{
  expect(canTransitionReviewRun('running','paused')).toBe(true);
  expect(canTransitionReviewRun('paused','running')).toBe(true);
  expect(canTransitionReviewRun('running','completed')).toBe(true);
  expect(canTransitionReviewRun('running','exhausted')).toBe(true);
  expect(canTransitionReviewRun('paused','abandoned')).toBe(true);
  expect(canTransitionReviewRun('completed','running')).toBe(false);
  expect(canTransitionReviewRun('abandoned','running')).toBe(false);
  expect(canTransitionReviewRun('exhausted','running')).toBe(false);
  expect(canTransitionReviewRun('running','running')).toBe(false);
 });
 it('binds opaque 1–50 keyset cursor to exact status filters and rejects forged owner',()=>{
  const first=validateReviewRunQuery({status:['paused','running'],limit:50});
  expect(first).toEqual({status:['running','paused'],limit:50,cursor:null});
  const cursor=encodeReviewRunCursor(run(),first.status);
  expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(validateReviewRunQuery({status:['running','paused'],limit:1,cursor}))
   .toEqual({status:['running','paused'],limit:1,cursor:{id:id(1),createdAt:at}});
  invalid(()=>validateReviewRunQuery({status:['running'],cursor}));
  invalid(()=>validateReviewRunQuery({status:['running','running']}));
  invalid(()=>validateReviewRunQuery({limit:0}));
  invalid(()=>validateReviewRunQuery({limit:51}));
  invalid(()=>validateReviewRunQuery({limit:1.5}));
  invalid(()=>validateReviewRunQuery({cursor:'%%%'}));
  invalid(()=>validateReviewRunQuery({status:['bad'] as never}));
  invalid(()=>validateReviewRunQuery({userId:id(1)} as never));
 });
});
