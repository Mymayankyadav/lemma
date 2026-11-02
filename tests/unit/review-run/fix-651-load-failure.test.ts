import {describe,expect,it} from 'vitest';
import {reviewInitialLoadFailure} from '../../../src/features/review-run/loadFailure';

// FIX #651: a failed initial settings/review-items query must never leave
// Review-run on an indefinite "Preparing your cards" screen. A later refetch
// failure with usable cached data must not discard an active review card.
const pending={isError:false,data:undefined};
const ready={isError:false,data:{ok:true}};
const failed={isError:true,data:undefined};

describe('FIX #651 initial Review-run loading errors',()=>{
 it('reports initial settings failure without waiting for a separate pending query',()=>{
  expect(reviewInitialLoadFailure(failed,pending)).toBe('settings');
 });
 it('reports initial review-items failure and prioritizes settings if both fail',()=>{
  expect(reviewInitialLoadFailure(ready,failed)).toBe('cards');
  expect(reviewInitialLoadFailure(failed,failed)).toBe('settings');
 });
 it('preserves usable stale data when background refetch fails',()=>{
  expect(reviewInitialLoadFailure({isError:true,data:{ok:true}},ready)).toBeNull();
  expect(reviewInitialLoadFailure(ready,{isError:true,data:[1]})).toBeNull();
 });
 it('keeps pending and successful initial queries on their normal paths',()=>{
  expect(reviewInitialLoadFailure(pending,pending)).toBeNull();
  expect(reviewInitialLoadFailure(ready,ready)).toBeNull();
 });
});
