import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {isMachineRead,MACHINE_READS} from '../../../supabase/functions/mcp/machine-reads';

// Incident #1402: the deploy's smoke test JSON.parses get(resources|today|connection|devices), which the tutor's
// "\nNEXT: …" line after every tool result made impossible on the real server.
describe('incident #1402 machine-readable get reads',()=>{
 it('names the N160 JSON reports, only for the get tool',()=>{
  for(const what of ['resources','today','connection','devices','progress','export','calendar_overlaps','source_upload'])
   expect(isMachineRead('get',{what}),what).toBe(true);
  for(const what of ['cards','notes','tasks',undefined,'',7])expect(isMachineRead('get',{what}),String(what)).toBe(false);
  expect(isMachineRead('resume',{what:'today'})).toBe(false);
  expect(isMachineRead('get',null)).toBe(false);
  expect([...MACHINE_READS].sort()).toEqual(['calendar_overlaps','connection','devices','export','progress','resources','source_upload','today']);
 });
 it('is what the server uses to leave the hint off',()=>{
  const server=readFileSync('supabase/functions/mcp/server.ts','utf8');
  expect(server).toContain("import {isMachineRead} from './machine-reads.ts';");
  expect(server).toContain("const suffix=isMachineRead(n,a)?'':'\\nNEXT: '");
 });
 it('every get read the smoke test parses is covered',()=>{
  const smoke=readFileSync('tests/mcp/smoke.mjs','utf8');
  const parsed=[...smoke.matchAll(/what:'(\w+)'/g)].map(m=>m[1]).concat(...[...smoke.matchAll(/for\(const what of \[([^\]]+)\]/g)].map(m=>[...m[1].matchAll(/'(\w+)'/g)].map(x=>x[1])));
  expect(parsed.length).toBeGreaterThan(0);
  for(const what of parsed)expect(isMachineRead('get',{what}),what).toBe(true);
 });
});
