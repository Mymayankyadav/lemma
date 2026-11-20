/** Used by both OPTIONS and actual responses. Authorization must be named explicitly. */
export const mcpCorsHeaders:Record<string,string>={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':[
    'authorization','apikey','x-client-info','content-type','idempotency-key',
    'mcp-session-id','mcp-protocol-version','last-event-id','accept','x-region',
    'x-retry-count','traceparent','tracestate','baggage',
  ].join(', '),
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS,DELETE',
  'Access-Control-Expose-Headers':'Mcp-Session-Id',
  'Vary':'Origin',
};
export function mcpPreflight():Response{return new Response(null,{status:204,headers:mcpCorsHeaders});}
