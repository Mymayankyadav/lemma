import {describe,expect,it} from 'vitest';
import type {Proposal} from '../../../src/data/types';
import {groupInbox,inboxDay,proposalRationale} from '../../../src/features/proposals/v6/model';
const p=(id:string,createdAt:string,reason:string|null=null)=>({id,createdAt,reason,kind:'card',projectSlug:'algebra'}) as Proposal;
describe('N32.1 owner-day Inbox model',()=>{
 it('groups real proposals into the local Today and older days',()=>{
  const now='2026-11-06T00:10:00Z',zone='America/Los_Angeles';
  expect(inboxDay(now,zone)).toBe('2026-11-05');
  const rows=[p('today','2026-11-06T00:00:00Z'),p('old','2026-11-05T01:00:00Z'),p('recent','2026-11-05T22:00:00Z','Source p2')];
  const groups=groupInbox(rows,now,zone);
  expect(groups.map(g=>g.label)).toEqual(['Today','2026-11-04']);
  expect(groups[0].proposals.map(x=>x.id)).toEqual(['today','recent']);
  expect(groups.flatMap(g=>g.proposals)).toHaveLength(3);
 });
 it('does not invent rationale, and handles no proposals',()=>{
  expect(proposalRationale(p('a','2026-11-06T00:00:00Z'))).toBe('Rationale unavailable');
  expect(proposalRationale(p('b','2026-11-06T00:00:00Z','Source p2'))).toBe('Source p2');
  expect(groupInbox([],'2026-11-06T12:00:00Z','UTC')).toEqual([]);
  expect(()=>inboxDay('not-a-date','UTC')).toThrow(/Invalid/);
 });
});
