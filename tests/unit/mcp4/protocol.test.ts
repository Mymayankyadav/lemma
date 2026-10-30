import {describe,expect,it} from 'vitest';
import {parseMcpReply} from '../../../supabase/functions/mcp/protocol.ts';

describe('MCP JSON-RPC response parser',()=>{
 const reply={jsonrpc:'2.0',id:1,result:{tools:[{name:'resume'}]}};
 it('accepts application/json replies',()=>{
  expect(parseMcpReply(JSON.stringify(reply),'application/json',1).tools).toHaveLength(1);
 });
 it('accepts SSE event-first replies',()=>{
  expect(parseMcpReply('event: message\ndata: '+JSON.stringify(reply)+'\n\n','text/event-stream',1).tools[0].name).toBe('resume');
 });
 it('accepts SSE data-first replies and unrelated messages',()=>{
  const other={jsonrpc:'2.0',id:0,result:{tools:[]}};
  expect(parseMcpReply('data: '+JSON.stringify(other)+'\n\ndata: '+JSON.stringify(reply)+'\n\n','text/event-stream',1).tools).toHaveLength(1);
 });
 it('rejects missing matching ids and protocol errors',()=>{
  expect(()=>parseMcpReply(JSON.stringify(reply),'application/json',2)).toThrow(/matching request id/);
  expect(()=>parseMcpReply(JSON.stringify({jsonrpc:'2.0',id:1,error:{message:'not initialized'}}),'application/json',1)).toThrow(/not initialized/);
 });
});
