import {expect,it} from 'vitest';
import {corsHeaders as sdkCorsHeaders} from '@supabase/supabase-js/cors';
import {mcpCorsHeaders,mcpPreflight} from '../../../supabase/functions/mcp/http-cors';
import {browserAgenda} from '../../../supabase/functions/mcp/agenda-http';
const tokens=(value:string)=>value.toLowerCase().split(',').map(s=>s.trim());

it('the production preflight explicitly allows Authorization, every SDK header, and practice/MCP transport headers',()=>{
  const response=mcpPreflight();expect(response.status).toBe(204);
  const allowed=tokens(response.headers.get('Access-Control-Allow-Headers')??'');
  // Authorization is a non-wildcard request header; '*' alone cannot authorize it.
  expect(allowed).toContain('authorization');
  for(const header of [...tokens(sdkCorsHeaders['Access-Control-Allow-Headers']),
    'idempotency-key','mcp-session-id','mcp-protocol-version','last-event-id','accept','x-region'])expect(allowed).toContain(header);
  expect(tokens(response.headers.get('Access-Control-Allow-Methods')??'')).toEqual(expect.arrayContaining(['get','post','options','delete']));
  expect(tokens(response.headers.get('Access-Control-Expose-Headers')??'')).toContain('mcp-session-id');
});

it('authenticated agenda responses use the same production CORS declarations as preflight',async()=>{
  const request=new Request('https://example.invalid/functions/v1/mcp/agenda',{method:'POST',
    headers:{Origin:'https://lemma.example',Authorization:'Bearer session.token',apikey:'public-key','x-client-info':'supabase-js-web'}});
  const response=await browserAgenda(request,{verify:async()=> 'owner',read:async()=>({released:false,agenda:null})},mcpCorsHeaders);
  expect(response.status).toBe(200);expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe(mcpPreflight().headers.get('Access-Control-Allow-Headers'));
  expect(response.headers.get('cache-control')).toContain('no-store');
});
