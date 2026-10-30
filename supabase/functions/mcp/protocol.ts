/** Parse one JSON-RPC reply from either MCP HTTP JSON or SSE transport. */
export function parseMcpReply(body:string,contentType:string,id:number):any{
  const isSse=contentType.includes('text/event-stream')||/^\s*(?:event|data):/m.test(body);
  const messages=isSse
    ?body.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5).trim()))
    :[JSON.parse(body)];
  const reply=messages.find(message=>message&&message.id===id);
  if(!reply)throw Error('MCP response missing matching request id');
  if(reply.error)throw Error('MCP protocol error: '+String(reply.error.message||'unknown'));
  if(!reply.result)throw Error('MCP response missing result');
  return reply.result;
}
