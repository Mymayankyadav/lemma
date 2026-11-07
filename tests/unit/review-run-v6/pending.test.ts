import {beforeEach,describe,expect,it} from 'vitest';
import {pendingGrade,writePendingGrade,clearPendingGrade}
 from '../../../src/features/review-run/v6/pending';

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
 it('rejects malformed or uncommitted acknowledgement values',()=>{
  sessionStorage.setItem('lemma.v6.pending-review-advance.v1',
   JSON.stringify({runId:'run-one',itemId:'item-two',reviewId:0}));
  expect(pendingGrade()).toBeNull();
  sessionStorage.setItem('lemma.v6.pending-review-advance.v1','{broken');
  expect(pendingGrade()).toBeNull();
 });
});
