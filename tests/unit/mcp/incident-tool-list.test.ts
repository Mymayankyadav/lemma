import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Incident #921: a newly registered MCP tool must also be expected by the
// deploy smoke, while the existing exact 15,000-char runtime check stays on.
const server=readFileSync('supabase/functions/mcp/server.ts','utf8');
const smoke=readFileSync('tests/mcp/smoke.mjs','utf8');
const selftest=readFileSync('supabase/functions/mcp/selftest.ts','utf8');
function names(source:string,declaration:string):string[]{
 const start=source.indexOf(declaration);
 if(start<0)throw new Error('Missing tool names declaration: '+declaration);
 const end=source.indexOf(']',start+declaration.length);
 if(end<0)throw new Error('Unterminated tool names declaration');
 return [...source.slice(start+declaration.length,end).matchAll(/'([^']+)'/g)].map(m=>m[1]);
}
describe('incident #921 MCP tool-list deploy contract',()=>{
 it('lists all 24 registered tools, including study, in the deployment smoke',()=>{
  const registered=names(server,'export const TOOL_NAMES=[');
  const expected=names(smoke,'const names=[');
  expect(registered).toHaveLength(24);
  expect(new Set(registered).size).toBe(24);
  expect(registered).toContain('study');
  expect(expected).toEqual(registered);
  expect(smoke).toContain('tools.tools.length,24');
 });
 it('keeps exact live and deploy-smoke character budgets enforced',()=>{
  expect(selftest).toContain('const chars=JSON.stringify({tools:list}).length');
  expect(selftest).toContain("if(chars>15000)throw Error('tools/list too large: '+chars)");
  expect(smoke).toContain("JSON.stringify(tools).length<=15000");
 });
});
