import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// FIX main #739: the 60-project NOTIF X fixture must use the same owner
// study-day clock for due_on and p_now. Bare UTC current_date+1 flips at
// 00:00 UTC while the default study day rolls at 04:00 UTC.
const stress=readFileSync('tests/mcp/notif1b-stress.mjs','utf8');

const tomorrow=(iso:string,rolloverHour:number)=>new Date(
 Date.parse(iso)+(24-rolloverHour)*60*60*1000,
).toISOString().slice(0,10);

describe('FIX #739 notification X study-day fixture',()=>{
 it('keeps tomorrow stable through UTC midnight, changing only at 04:00',()=>{
  expect(tomorrow('2026-11-01T23:59:59Z',4)).toBe('2026-11-02');
  expect(tomorrow('2026-11-02T00:00:01Z',4)).toBe('2026-11-02');
  expect(tomorrow('2026-11-02T03:59:59Z',4)).toBe('2026-11-02');
  expect(tomorrow('2026-11-02T04:00:01Z',4)).toBe('2026-11-03');
 });
 it('uses one captured instant and owner rollover for fixture and RPC',()=>{
  expect(stress).not.toMatch(/\bcurrent_date\s*\+\s*1\b/i);
  expect(stress).toContain('const snapshotAt=new Date().toISOString()');
  expect(stress).toContain('make_interval(hours=>s.rollover_hour)');
  expect(stress).toContain('p_now');
  expect(stress).toContain("select public.notify_candidates($1,$2::timestamptz) data");
  expect(stress).toContain('assert.equal(new Set(snapshot.tomorrow.map(row=>row.slug)).size,20');
  expect(stress).toContain('assert.ok(elapsed<150');
 });
});
