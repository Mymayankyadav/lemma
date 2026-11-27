import {beforeEach,describe,expect,it} from 'vitest';
import {pendingGrade,writePendingGrade,clearPendingGrade}
 from '../../../src/features/review-run/v6/pending';

const legacyKey='lemma.v6.pending-review-advance.v1';
beforeEach(()=>sessionStorage.clear());

describe('N83 persisted grade acknowledgements',()=>{
 it('keeps the committed review receipt until advance is acknowledged',()=>{
  expect(pendingGrade()).toBeNull();
  const receipt={runId:'run-one',itemId:'item-two',reviewId:72};
  writePendingGrade(receipt);
  expect(pendingGrade()).toEqual(receipt);
  clearPendingGrade();
  expect(pendingGrade()).toBeNull();
 });
 it('keeps a newer receipt for the same run when an older advance resolves',()=>{
  const old={runId:'run-one',itemId:'item-two',reviewId:72};
  const current={...old,reviewId:73};
  writePendingGrade(current);
  clearPendingGrade(old);
  expect(pendingGrade(old.runId)).toEqual(current);
  clearPendingGrade(current);
  expect(pendingGrade(current.runId)).toBeNull();
 });
 it('recovers independent receipts when saves and advances complete out of order',()=>{
  const first={runId:'first-run',itemId:'first-item',reviewId:72};
  const second={runId:'second-run',itemId:'second-item',reviewId:73};
  writePendingGrade(second);
  writePendingGrade(first);
  expect(pendingGrade(first.runId)).toEqual(first);
  expect(pendingGrade(second.runId)).toEqual(second);
  expect(pendingGrade()).toEqual(first);
  clearPendingGrade(first);
  expect(pendingGrade(first.runId)).toBeNull();
  expect(pendingGrade(second.runId)).toEqual(second);
  clearPendingGrade(second);
  expect(pendingGrade(second.runId)).toBeNull();
 });
 it('uses the pre-existing single receipt for its own run and keeps it alongside other runs',()=>{
  const previous={runId:'old-run',itemId:'old-item',reviewId:72};
  const current={runId:'new-run',itemId:'new-item',reviewId:73};
  sessionStorage.setItem(legacyKey,JSON.stringify(previous));
  expect(pendingGrade()).toEqual(previous);
  expect(pendingGrade(current.runId)).toBeNull();
  writePendingGrade(current);
  expect(pendingGrade(previous.runId)).toEqual(previous);
  clearPendingGrade(current);
  expect(pendingGrade(previous.runId)).toEqual(previous);
  clearPendingGrade(previous);
  expect(pendingGrade(previous.runId)).toBeNull();
  expect(sessionStorage.getItem(legacyKey)).toBeNull();
 });
 it('does not fall back to an obsolete legacy receipt when a run saves a new one',()=>{
  const previous={runId:'same-run',itemId:'old-item',reviewId:72};
  const current={...previous,itemId:'new-item',reviewId:73};
  sessionStorage.setItem(legacyKey,JSON.stringify(previous));
  writePendingGrade(current);
  expect(pendingGrade(current.runId)).toEqual(current);
  clearPendingGrade(current);
  expect(pendingGrade(current.runId)).toBeNull();
 });
 it('rejects malformed or uncommitted acknowledgement values',()=>{
  sessionStorage.setItem(legacyKey,
   JSON.stringify({runId:'run-one',itemId:'item-two',reviewId:0}));
  expect(pendingGrade()).toBeNull();
  sessionStorage.setItem(legacyKey,'{broken');
  expect(pendingGrade()).toBeNull();
 });
});
