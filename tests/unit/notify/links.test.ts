import {describe,expect,it} from 'vitest';
import {notificationRoundCap} from '../../../src/features/review/notification-limit';

// NOTIF-7: the explicit Review N deep link selects N due cards, even if
// the user's ordinary daily target is lower. Ordinary Start remains capped.
describe('NOTIF-7 review round caps',()=>{
 it('preserves the daily target for the ordinary Start button',()=>{
  expect(notificationRoundCap(3)).toBe(3);
  expect(notificationRoundCap(0)).toBe(200);
 });
 it('honours the explicit notification size instead of the daily target',()=>{
  expect(notificationRoundCap(3,5)).toBe(5);
  expect(notificationRoundCap(200,1)).toBe(1);
  expect(notificationRoundCap(2,50)).toBe(50);
 });
 it('bounds notification size even when a caller passes an invalid number',()=>{
  expect(notificationRoundCap(3,0)).toBe(1);
  expect(notificationRoundCap(3,99)).toBe(50);
  expect(notificationRoundCap(3,NaN)).toBe(1);
 });
});
