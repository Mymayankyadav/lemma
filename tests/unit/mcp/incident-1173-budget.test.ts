import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const server=readFileSync('supabase/functions/mcp/server.ts','utf8');

// Incident #1173: the deployed selftest rejected a 15,050-char tool list.
// The real serialized 15,000-char gate remains in selftest.ts and smoke.mjs;
// leave room for tool-schema fields by guarding this contributor to its size.
describe('incident #1173 MCP tool-list headroom',()=>{
 it('advertises concise, nonempty descriptions for all 24 tools',()=>{
  const descriptions=[
   ...[...server.matchAll(/register\\('([^']+)',"([^"]+)"/g)].map(match=>match[2]),
   ...[...server.matchAll(/m\\.registerTool\\('study',\\{\\s*description:'([^']+)'/g)].map(match=>match[1])
  ];
  expect(descriptions).toHaveLength(24);
  expect(descriptions.every(text=>text.trim().length>0)).toBe(true);
  expect(descriptions.reduce((total,text)=>total+text.length,0)).toBeLessThanOrEqual(230);
 });
});
