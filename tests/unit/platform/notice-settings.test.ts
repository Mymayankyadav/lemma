import {describe,expect,it,vi} from 'vitest';
import {REMINDER_KINDS,reminderKindRows} from '../../../src/features/settings/v7/reminderKinds';
import {requestTestNotice} from '../../../src/platform/push';

// N164: once the phone is registered for push, the server sends every kind to it, so Settings has every switch.
describe('N164 reminder switches on a phone that receives push',()=>{
 it('has every kind\'s switch and the proposals switch, and no "wait in your Inbox" list',()=>{
  const rows=reminderKindRows(true,true);
  expect(rows.switches.map(row=>row.key)).toEqual(REMINDER_KINDS.map(([key])=>key));
  expect(rows.switches.find(row=>row.key==='plan')!.label).toBe('Plans and time blocks');
  expect(rows.proposalsSwitch).toBe(true);
  expect(rows.inbox).toEqual([]);
 });
 it('keeps the earlier behaviour without push, in the app and on the web',()=>{
  expect(reminderKindRows(true).switches.map(row=>row.key)).toEqual(['due','plan']);
  expect(reminderKindRows(true,false).inbox.length).toBeGreaterThan(0);
  expect(reminderKindRows(false,true).switches.find(row=>row.key==='plan')!.label).toBe('Plans');
 });
});
describe('N164 the test reminder',()=>{
 it('asks the server to queue one and reports its refusal',async()=>{
  const rpc=vi.fn().mockResolvedValue({error:null});
  await requestTestNotice(async()=>({rpc}));
  expect(rpc).toHaveBeenCalledWith('request_notify_test',{});
  rpc.mockResolvedValueOnce({error:{message:'A test reminder was sent a moment ago. Try again in a minute.'}});
  await expect(requestTestNotice(async()=>({rpc}))).rejects.toThrow('a moment ago');
 });
});
