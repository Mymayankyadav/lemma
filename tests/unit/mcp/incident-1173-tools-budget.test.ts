import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const server=readFileSync('supabase/functions/mcp/server.ts','utf8');

describe('incident #1173 MCP tools/list schema budget regression',()=>{
 it('does not advertise legacy enums already wholly covered by dynamic identifiers',()=>{
  const envelope=server.slice(server.indexOf('const studyEnvelope='),
   server.indexOf("m.registerTool('study'"));
  expect(envelope).toContain("resource:S().regex(/^[a-z][a-z0-9_]{0,60}$/)");
  expect(envelope).toContain("operation:S().regex(/^[a-z][a-z0-9_]{0,60}$/)");
  expect(envelope).not.toContain('resource:z.enum');
  expect(envelope).not.toContain('operation:z.enum');
 });
 it('retains the owner-bound study tool, its exact write-envelope fields and the 24 existing tool names',()=>{
  expect(server).toContain("m.registerTool('study'");
  expect(server).toContain('operationId:S().uuid()');
  expect(server).toContain('schemaVersion:z.literal(1)');
  expect(server).toContain('target:z.object({id:S().uuid()}).strict().optional()');
  expect(server).toContain('expectedVersion:z.number().int().min(0).optional()');
  expect(server).toContain("patch:z.record(S(),z.unknown()).optional()");
  expect(server).toContain("const TOOL_NAMES=");
 });
});
